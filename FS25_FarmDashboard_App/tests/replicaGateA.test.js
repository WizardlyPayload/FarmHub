"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");
const { ingestWatchedSlot } = require("../exportIngress");
const { writeStrictPair } = require("../replicaPairContract.cjs");
const localIngressController = require("../localIngressController");
const replicaRegistration = require("../replicaRegistration");
const { configNeedsServerReboot, resolveServersForSave } = require("../setupConfigMerge.cjs");
const runtimeActivation = require("../runtimeActivation");
const { adler32 } = require("../exportEnvelope");
const exportIngress = require("../exportIngress");
const { createBoundSourcePublication } = require("../boundSourcePublication.cjs");
const { isExplicitReplicaXmlSource } = require("../xmlCollector");

const modSrc = path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src");
const mainPath = path.resolve(__dirname, "../main.js");

function installBoundSources(context) {
    const events = [];
    context.boundSources = createBoundSourcePublication({
        sameBinding: (before, after) => !configNeedsServerReboot({ servers: [before] }, { servers: [after] }),
    });
    context.broadcastSourceState = (event) => { events.push(event); };
    context.sourceStateEvents = events;
}

function runLua(files, chunk) {
    const L = lauxlib.luaL_newstate();
    try {
        lualib.luaL_openlibs(L);
        const parts = [
            "Logging = { info = function() end, warning = function() end }",
            "FarmDashLog = { isVerbose = function() return false end }",
            "Event = {}",
            "function Event.new(mt) return setmetatable({}, mt) end",
            "function Class(classTable) return { __index = classTable } end",
            "function InitEventClass() end",
            "Utils = {}",
            "function Utils.appendedFunction(old, fn) return function(...) if old then old(...) end return fn(...) end end",
            "FSBaseMission = {}",
            "function FSBaseMission:onFinishedReceivingDynamicData(connection) end",
            "function FSBaseMission:onConnectionClosed(connection) end",
            "function FSBaseMission:sendInitialClientState() end",
        ];
        for (const file of files) parts.push(fs.readFileSync(path.join(modSrc, file), "utf8"));
        parts.push(chunk);
        const status = lauxlib.luaL_dostring(L, to_luastring(parts.join("\n")));
        if (status !== lua.LUA_OK) {
            const err = lua.lua_tostring(L, -1);
            throw new Error(err ? to_jsstring(err) : `lua error ${status}`);
        }
        const value = lua.lua_tostring(L, -1);
        return value ? to_jsstring(value) : "";
    } finally {
        lua.lua_close(L);
    }
}

const configFiles = ["FarmDashboardReplicaConfig.lua", "FarmDashboardExportMirror.lua"];

const configHost = `
local files = {}
function getUserProfileAppPath() return "profile/" end
function loadXMLFile(name, p)
    if files[p] == nil then return 0 end
    return { path = p, text = files[p] }
end
function getXMLString(handle, key)
    if type(handle) ~= "table" or type(handle.text) ~= "string" then return nil end
    local index, attr = string.match(key, "source%((%d+)%)#([A-Za-z0-9_]+)$")
    if index == nil then return nil end
    local found = 0
    for tag in string.gmatch(handle.text, "<source%s[^>]*/>") do
        if found == tonumber(index) then
            return string.match(tag, attr .. '="([^"]*)"')
        end
        found = found + 1
    end
    return nil
end
function delete() end
files["profile/modSettings/FS25_FarmDashboard/replicaSources.xml"] = [[
<farmDashboardReplicaSources>
<source sourceId="source-a" remoteSlot="savegame3" serverKey="alpha"/>
<source sourceId="source-b" remoteSlot="savegame3" serverKey="beta"/>
</farmDashboardReplicaSources>
]]
g_currentMission = { missionDynamicInfo = { platformSessionId = "alpha" } }
local function serverConn()
    local conn = {}
    function conn:getIsServer() return true end
    return conn
end
`;

describe("replica gate A registration and watch", () => {
    test("the receiving client binds the verified server connection from the production config", () => {
        const result = runLua(configFiles, configHost + `
            FarmDashboardSettingsApi = { isAuthorityMachine = function() return false end }
            local conn = serverConn()
            local other = {}
            function other:getIsServer() return false end
            FSBaseMission:onFinishedReceivingDynamicData(conn)
            FSBaseMission:onFinishedReceivingDynamicData(other)
            local binding = FarmDashboardReplicaConfig:bindingForConnection(conn)
            return "registered=" .. tostring(FarmDashboardExportMirror._replicaSources[conn] == "source-a")
                .. "|slot=" .. tostring(binding and binding.remoteSlot)
                .. "|other=" .. tostring(FarmDashboardExportMirror._replicaSources[other] ~= nil)
                .. "|root=" .. tostring(binding and binding.replicaRoot)
        `);
        expect(result).toContain("registered=true");
        expect(result).toContain("slot=savegame3");
        expect(result).toContain("other=false");
        expect(result).toContain("replicas/");
    });

    test("authority role does not use the client registration hook", () => {
        const result = runLua(configFiles, configHost + `
            FarmDashboardSettingsApi = { isAuthorityMachine = function() return true end }
            local conn = serverConn()
            FSBaseMission:onFinishedReceivingDynamicData(conn)
            FarmDashboardExportMirror:onClientJoined(conn)
            return "registered=" .. tostring(FarmDashboardExportMirror._replicaSources[conn] ~= nil)
                .. "|tracked=" .. tostring(FarmDashboardExportMirror._clients[conn] == true)
        `);
        expect(result).toBe("registered=false|tracked=true");
    });

    test("two sources with the same remote slot bind independently and disconnect retires one", () => {
        const result = runLua(configFiles, configHost + `
            FarmDashboardSettingsApi = { isAuthorityMachine = function() return false end }
            local first = serverConn()
            local second = serverConn()
            g_currentMission.missionDynamicInfo.platformSessionId = "alpha"
            FSBaseMission:onFinishedReceivingDynamicData(first)
            g_currentMission.missionDynamicInfo.platformSessionId = "beta"
            FSBaseMission:onFinishedReceivingDynamicData(second)
            local both = FarmDashboardExportMirror._replicaSources[first] == "source-a"
                and FarmDashboardExportMirror._replicaSources[second] == "source-b"
            FSBaseMission:onConnectionClosed(first)
            return "both=" .. tostring(both)
                .. "|first=" .. tostring(FarmDashboardExportMirror._replicaSources[first] ~= nil)
                .. "|second=" .. tostring(FarmDashboardExportMirror._replicaSources[second] == "source-b")
        `);
        expect(result).toBe("both=true|first=false|second=true");
    });

    test("a replica-only directory is ready and last-known stays a replica", () => {
        const main = fs.readFileSync(mainPath, "utf8");
        const start = main.indexOf("async function startLocalWatching");
        const gate = main.indexOf("replicaReadyEarly", start);
        const waiting = main.indexOf("Waiting for:", start);
        expect(gate).toBeGreaterThan(start);
        expect(waiting).toBeGreaterThan(gate);

        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-gate-a-"));
        const replicaDir = path.join(dir, "replicas", "source-a");
        fs.mkdirSync(replicaDir, { recursive: true });
        const slotA = '<farmDashboardExport schema="2" careerId="career-a" sessionId="session-a" publicationSequence="2" exportGeneration="2" simulationTimeMs="10" encoding="base64" bytes="23" crc="1644365814" payload="eyJ2ZWhpY2xlcyI6W3siaWQiOjF9XX0="/>';
        writeStrictPair(replicaDir, slotA, { sourceId: "source-a", sourceSlot: "savegame3", connectionEpoch: "1", slot: "a", replicaRevision: 2 });
        const srv = { id: "source-a", replicaRemoteSlot: "savegame3" };
        const targets = localIngressController.resolveTargets(srv, { basePath: dir, folderName: "local-folder" });
        expect(targets.remoteSlot).toBe("savegame3");
        expect(targets.localFolder).toBe("local-folder");
        expect(localIngressController.replicaFilesReady(targets.replicaDir, fs.existsSync)).toBe(true);
        expect(localIngressController.chooseIngressDir(false, true, targets.replicaDir, path.join(dir, "local-folder"))).toBe(targets.replicaDir);
        expect(localIngressController.chooseIngressDir(true, true, targets.replicaDir, path.join(dir, "local-folder"))).toBe(path.join(dir, "local-folder"));

        const clock = { t: 1000 };
        const first = ingestWatchedSlot(replicaDir, {
            sourceId: "source-a",
            configuredSlot: targets.remoteSlot,
            now: () => clock.t,
            staleAfterMs: 5000,
        });
        const state = {};
        const seen = [];
        const applied = localIngressController.applyWatchedIngress(state, srv, first, (id, raw, transport) => {
            seen.push({ id, raw, transport });
        });
        expect(applied).toBe(true);
        expect(seen[0].transport.replica).toBe(true);
        expect(seen[0].transport.authoritative).toBe(false);
        expect(seen[0].id).toBe("source-a");

        const rolledSlot = '<farmDashboardExport schema="2" careerId="career-a" sessionId="session-a" publicationSequence="1" exportGeneration="1" simulationTimeMs="10" encoding="base64" bytes="23" crc="1644365814" payload="eyJ2ZWhpY2xlcyI6W3siaWQiOjF9XX0="/>';
        writeStrictPair(replicaDir, rolledSlot, { sourceId: "source-a", sourceSlot: "savegame3", connectionEpoch: "1", slot: "a", replicaRevision: 1 });
        clock.t += 100;
        const rolled = ingestWatchedSlot(replicaDir, {
            sourceId: "source-a",
            configuredSlot: "savegame3",
            tracker: first.tracker,
            previous: first,
            now: () => clock.t,
            staleAfterMs: 5000,
        });
        expect(rolled.status).toBe("last-known");
        localIngressController.applyWatchedIngress(state, srv, rolled, (id, raw, transport) => {
            seen.push({ id, raw, transport });
        });
        expect(seen[1].transport.replica).toBe(true);
        expect(seen[1].transport.authoritative).toBe(false);
        expect(seen[1].transport.publicationSequence).toBe(2);

        const mismatch = ingestWatchedSlot(replicaDir, { sourceId: "source-a", configuredSlot: "savegame99" });
        expect(localIngressController.applyWatchedIngress(state, srv, mismatch, () => seen.push("mismatch"))).toBe(false);
        expect(seen.some((entry) => entry === "mismatch")).toBe(false);
    });

    test("an emptied registration retires the previous client binding", () => {
        const result = runLua(configFiles, configHost + `
            FarmDashboardSettingsApi = { isAuthorityMachine = function() return false end }
            local conn = serverConn()
            local first = FarmDashboardReplicaConfig:onClientServerReady(conn)
            files["profile/modSettings/FS25_FarmDashboard/replicaSources.xml"] = "<farmDashboardReplicaSources/>"
            local second = FarmDashboardReplicaConfig:onClientServerReady(conn)
            return "first=" .. tostring(first)
                .. "|second=" .. tostring(second)
                .. "|oldBindingRetained=" .. tostring(FarmDashboardReplicaConfig:bindingForConnection(conn) ~= nil)
                .. "|mirrorBindingRetained=" .. tostring(FarmDashboardExportMirror._replicaSources[conn] ~= nil)
        `);
        expect(result).toBe("first=true|second=false|oldBindingRetained=false|mirrorBindingRetained=false");
    });

    test("the settings writer emits registration XML and refuses a damaged file", () => {
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-reg-"));
        const written = replicaRegistration.publishReplicaRegistration(profile, [{
            id: "source-a",
            replicaRegistration: { remoteSlot: "savegame3", sessionPairing: "alpha" },
        }]);
        expect(written.ok).toBe(true);
        expect(written.xml).toContain('sourceId="source-a"');
        expect(written.xml).toContain('remoteSlot="savegame3"');
        expect(written.xml).toContain('serverKey="alpha"');
        const loaded = runLua(configFiles, configHost.replace(
            /files\["profile\/modSettings\/FS25_FarmDashboard\/replicaSources.xml"\] = \[\[[\s\S]*?\]\]/,
            `files["profile/modSettings/FS25_FarmDashboard/replicaSources.xml"] = ${JSON.stringify(written.xml)}`
        ) + `
            FarmDashboardSettingsApi = { isAuthorityMachine = function() return false end }
            local conn = serverConn()
            local ready = FarmDashboardReplicaConfig:onClientServerReady(conn)
            local binding = FarmDashboardReplicaConfig:bindingForConnection(conn)
            return tostring(ready) .. "|" .. tostring(binding and binding.remoteSlot)
        `);
        expect(loaded).toBe("true|savegame3");
        fs.writeFileSync(written.path, "<truncated");
        const refused = replicaRegistration.publishReplicaRegistration(profile, []);
        expect(refused.ok).toBe(false);
        expect(refused.error).toBe("damaged");
        expect(fs.readFileSync(written.path, "utf8")).toBe("<truncated");
    });

    test("authority wins over a replica and a missing remote slot does not apply", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-select-"));
        const folder = path.join(dir, "local-folder");
        const replicaDir = path.join(dir, "replicas", "source-a");
        fs.mkdirSync(folder, { recursive: true });
        fs.mkdirSync(replicaDir, { recursive: true });
        fs.writeFileSync(path.join(folder, "active.xml"), "<route/>");
        fs.writeFileSync(path.join(replicaDir, "slot-a.xml"), "<replica/>");
        const srv = { id: "source-a", replicaRemoteSlot: "savegame3", legacyJson: false };
        const parts = { basePath: dir, folderName: "local-folder" };
        const both = localIngressController.selectIngress(srv, parts, fs.existsSync);
        expect(both.kind).toBe("authority");
        expect(both.configuredSlot).toBe("savegame3");
        fs.unlinkSync(path.join(folder, "active.xml"));
        delete srv.replicaRemoteSlot;
        const missing = localIngressController.selectIngress(srv, parts, fs.existsSync);
        expect(missing.reason).toBe("configuration-required");
        expect(missing.dir).toBeNull();
        expect(localIngressController.allowRawLegacy(srv, missing)).toBe(false);
        expect(localIngressController.allowRawLegacy({ legacyJson: true }, { kind: "none" })).toBe(true);
    });

    test("truncated registration stays byte-identical and a declared document updates", () => {
        const truncated = '<farmDashboardReplicaSources revision="7"><source';
        const declared = '<?xml version="1.0" encoding="utf-8"?>\n<farmDashboardReplicaSources revision="7"></farmDashboardReplicaSources>';
        const badProfile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-reg-trunc-"));
        const badPath = path.join(badProfile, "modSettings", "FS25_FarmDashboard", "replicaSources.xml");
        fs.mkdirSync(path.dirname(badPath), { recursive: true });
        fs.writeFileSync(badPath, truncated);
        const refused = replicaRegistration.publishReplicaRegistration(badProfile, []);
        expect(refused.ok).toBe(false);
        expect(fs.readFileSync(badPath, "utf8")).toBe(truncated);
        const goodProfile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-reg-decl-"));
        const goodPath = path.join(goodProfile, "modSettings", "FS25_FarmDashboard", "replicaSources.xml");
        fs.mkdirSync(path.dirname(goodPath), { recursive: true });
        fs.writeFileSync(goodPath, declared);
        const updated = replicaRegistration.publishReplicaRegistration(goodProfile, []);
        expect(updated.ok).toBe(true);
        expect(updated.revision).toBe(8);
        expect(updated.xml.startsWith("<farmDashboardReplicaSources")).toBe(true);
    });

    test("writer and reader share the 32-row identifier contract", () => {
        const rows = [];
        for (let i = 0; i < 33; i += 1) {
            rows.push({ id: `source-${i}`, replicaRegistration: { remoteSlot: "savegame3", sessionPairing: `session-${i}` } });
        }
        const tooMany = replicaRegistration.validateSnapshot(rows);
        expect(tooMany.ok).toBe(false);
        expect(tooMany.error).toBe("too-many");
        expect(replicaRegistration.validId("source%a")).toBe(false);
        expect(replicaRegistration.validId("a/b")).toBe(false);
        expect(replicaRegistration.validId("a.b")).toBe(false);
        expect(replicaRegistration.validId("a b")).toBe(false);
        expect(replicaRegistration.validId("ä")).toBe(false);
        expect(replicaRegistration.validId("a".repeat(64))).toBe(true);
        expect(replicaRegistration.validId("a".repeat(65))).toBe(false);
        const xml33 = replicaRegistration.renderRegistrationXml(rows.slice(0, 33).map((row) => ({
            sourceId: row.id,
            remoteSlot: "savegame3",
            sessionPairing: row.replicaRegistration.sessionPairing,
        })), 1);
        const rejected = runLua(configFiles, configHost.replace(
            /files\["profile\/modSettings\/FS25_FarmDashboard\/replicaSources.xml"\] = \[\[[\s\S]*?\]\]/,
            `files["profile/modSettings/FS25_FarmDashboard/replicaSources.xml"] = ${JSON.stringify(xml33)}`
        ) + `
            FarmDashboardSettingsApi = { isAuthorityMachine = function() return false end }
            g_currentMission.missionDynamicInfo.platformSessionId = "session-32"
            local conn = serverConn()
            local ready = FarmDashboardReplicaConfig:onClientServerReady(conn)
            return "loaded=" .. #FarmDashboardReplicaConfig._sources .. "|ready33=" .. tostring(ready)
        `);
        expect(rejected).toBe("loaded=0|ready33=false");
        const percent = runLua(configFiles, configHost.replace(
            /files\["profile\/modSettings\/FS25_FarmDashboard\/replicaSources.xml"\] = \[\[[\s\S]*?\]\]/,
            'files["profile/modSettings/FS25_FarmDashboard/replicaSources.xml"] = [[<farmDashboardReplicaSources revision="1"><source sourceId="source%a" remoteSlot="savegame3" serverKey="alpha"/></farmDashboardReplicaSources>]]'
        ) + `
            FarmDashboardSettingsApi = { isAuthorityMachine = function() return false end }
            local conn = serverConn()
            local ready = FarmDashboardReplicaConfig:onClientServerReady(conn)
            return "loaded=" .. #FarmDashboardReplicaConfig._sources .. "|ready=" .. tostring(ready)
        `);
        expect(percent).toBe("loaded=0|ready=false");
    });

    test("a reader fault keeps the previous snapshot and retires that connection", () => {
        const result = runLua(configFiles, configHost + `
            FarmDashboardSettingsApi = { isAuthorityMachine = function() return false end }
            local conn = serverConn()
            FarmDashboardReplicaConfig:onClientServerReady(conn)
            local nativeGet = getXMLString
            function getXMLString(h, k)
                if string.find(k, "source(1)", 1, true) then error("injected XML read failure") end
                return nativeGet(h, k)
            end
            local ok = pcall(function() FarmDashboardReplicaConfig:onClientServerReady(conn) end)
            return "reloadOk=" .. tostring(ok)
                .. "|partialSources=" .. #FarmDashboardReplicaConfig._sources
                .. "|bindingRetained=" .. tostring(FarmDashboardReplicaConfig:bindingForConnection(conn) ~= nil)
                .. "|mirrorBindingRetained=" .. tostring(FarmDashboardExportMirror._replicaSources[conn] ~= nil)
        `);
        expect(result).toBe("reloadOk=true|partialSources=2|bindingRetained=false|mirrorBindingRetained=false");
    });

    test("settings save fails closed and a stopped watcher cannot apply the old source", async () => {
        const mainSource = fs.readFileSync(mainPath, "utf8");
        const slice = (startMarker, endMarker) => {
            const start = mainSource.indexOf(startMarker);
            const end = mainSource.indexOf(endMarker, start + startMarker.length);
            if (start < 0 || end < 0) throw new Error(`missing ${startMarker}`);
            return mainSource.slice(start, end);
        };
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-settings-"));
        const initial = [{ id: "source-a", replicaRegistration: { remoteSlot: "savegame3", sessionPairing: "alpha" } }];
        const seeded = replicaRegistration.publishReplicaRegistration(profile, initial);
        let stored = { servers: initial };
        let boots = 0;
        const settings = {
            replicaRegistration,
            console,
            getFs25DocumentsRoot: () => profile,
            resolveServersForSave: (_prev, next) => ({ servers: next, keptExisting: false }),
            configNeedsServerReboot: () => false,
            bootServer: () => { boots += 1; },
            runtimeActivation: runtimeActivation.createScope(),
            store: {
                get: () => stored,
                set: (_key, value) => { stored = value; },
            },
        };
        vm.createContext(settings);
        vm.runInContext(slice("async function applyFarmdashSetupConfig", "// ── Electron window"), settings);
        let httpResult;
        try {
            await settings.applyFarmdashSetupConfig({
                servers: [{ id: "source-a", replicaRegistration: { remoteSlot: "../bad", sessionPairing: "alpha" } }],
            });
            httpResult = { ok: true };
        } catch (error) {
            httpResult = { ok: false, error: error.message };
        }
        expect(httpResult).toEqual({ ok: false, error: "invalid-registration" });
        expect(stored.servers[0].replicaRegistration.remoteSlot).toBe("savegame3");
        expect(fs.readFileSync(seeded.path, "utf8")).toBe(seeded.xml);
        expect(boots).toBe(0);
        fs.writeFileSync(seeded.path, "<truncated");
        const renamed = await settings.applyFarmdashSetupConfig({
            servers: [{ id: "source-a", name: "Display only", replicaRegistration: { remoteSlot: "savegame3", sessionPairing: "alpha" } }],
        });
        expect(renamed.rebooted).toBe(false);
        expect(fs.readFileSync(seeded.path, "utf8")).toBe("<truncated");
        expect(stored.servers[0].name).toBe("Display only");
        fs.writeFileSync(seeded.path, seeded.xml);
        settings.store.set = () => { throw new Error("store-failed"); };
        await expect(settings.applyFarmdashSetupConfig({
            servers: [{ id: "source-a", replicaRegistration: { remoteSlot: "savegame4", sessionPairing: "alpha" } }],
        })).rejects.toThrow("store-failed");
        expect(fs.readFileSync(seeded.path, "utf8")).toBe(seeded.xml);
        expect(boots).toBe(0);

        const oldRoot = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-old-watch-"));
        const newRoot = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-new-watch-"));
        const writeReplica = (root, vehicleId) => {
            const body = Buffer.from(JSON.stringify({ vehicles: [{ id: vehicleId }] }));
            const replicaDir = path.join(root, "replicas", "source-a");
            fs.mkdirSync(replicaDir, { recursive: true });
            const crc = adler32(body);
            const envelope = `<farmDashboardExport schema="2" careerId="career-a" sessionId="session-a" publicationSequence="1" exportGeneration="1" simulationTimeMs="10" encoding="base64" bytes="${body.length}" crc="${crc}" payload="${body.toString("base64")}"/>`;
            writeStrictPair(replicaDir, envelope, { sourceId: "source-a", sourceSlot: "savegame3", connectionEpoch: "1", slot: "a", replicaRevision: 1 });
        };
        writeReplica(oldRoot, 1);
        writeReplica(newRoot, 22);
        const applies = [];
        const timers = [];
        let timerSeq = 0;
        const watch = {
            serverStates: {},
            serverCacheSaveTimers: {},
            persistAllServerCaches() {},
            clearFtpPollingTimers() {},
            resolveLocalWatchParts: (srv) => ({ basePath: srv.probeBase, folderName: "slot" }),
            ensureIdentityProposal: () => ({ status: "ready" }),
            path,
            pathExists: async (target) => fs.existsSync(target),
            fs: {
                existsSync: fs.existsSync,
                promises: fs.promises,
                watch: () => ({ on() {}, close() {} }),
            },
            localIngressController,
            exportIngress,
            processLuaData: (_id, raw) => applies.push(JSON.parse(raw).vehicles[0].id),
            readLocalLuaJsonReady: async () => null,
            livestockDetailModule: { bustDirtyIndexCache() {} },
            triggerXmlPoll() {},
            console,
            setTimeout: (fn, ms) => {
                const handle = { kind: "timeout", id: ++timerSeq, fn, ms, canceled: false };
                timers.push(handle);
                return handle;
            },
            clearTimeout: (handle) => { if (handle) handle.canceled = true; },
            setInterval: (fn, ms) => {
                const handle = { kind: "interval", id: ++timerSeq, fn, ms, canceled: false };
                timers.push(handle);
                return handle;
            },
            clearInterval: (handle) => { if (handle) handle.canceled = true; },
        };
        vm.createContext(watch);
        vm.runInContext(`${slice("function releaseWatcherHandles", "// ── FTP polling")}\n${slice("async function stopAllWatchers()", "function shouldLoadDashboardUrl")}`, watch);
        const source = (probeBase) => ({ id: "source-a", mode: "local", probeBase, localSubFolder: "slot", replicaRemoteSlot: "savegame3" });
        watch.serverStates["source-a"] = { intervals: [], active: true, ingressGeneration: 0, readDebounceTimer: null };
        await watch.startLocalWatching(source(oldRoot));
        const oldDebounce = timers.filter((timer) => timer.kind === "timeout" && timer.ms === 350);
        expect(oldDebounce.length).toBe(1);
        await watch.stopAllWatchers();
        expect(oldDebounce[0].canceled).toBe(true);
        watch.serverStates["source-a"] = { intervals: [], active: true, ingressGeneration: 0, readDebounceTimer: null };
        await watch.startLocalWatching(source(newRoot));
        for (const timer of timers) {
            if (timer.kind === "timeout" && timer.ms === 350 && !timer.canceled) timer.fn();
        }
        oldDebounce[0].fn();
        expect(applies).toEqual([22]);
    });

    test("attribute grammar, release failure, and durable registration recovery", () => {
        expect(replicaRegistration.parseRegistrationDocument('<farmDashboardReplicaSources __proto__="ignored" revision="1"/>').ok).toBe(false);
        expect(replicaRegistration.parseRegistrationDocument('<farmDashboardReplicaSources revision="1"><source sourceId="source-a" remoteSlot="savegame3" serverKey="alpha" __proto__="ignored"/></farmDashboardReplicaSources>').ok).toBe(false);
        const spaced = replicaRegistration.parseRegistrationDocument('<farmDashboardReplicaSources  revision="1"><source  sourceId="source-a"  remoteSlot="savegame3"  serverKey="alpha"/></farmDashboardReplicaSources>');
        expect(spaced.ok).toBe(true);
        expect(spaced.rows[0].sourceId).toBe("source-a");
        const padded = replicaRegistration.parseRegistrationDocument("<farmDashboardReplicaSources\trevision=\"1\">\n<source\nsourceId=\"source-a\"\tremoteSlot=\"savegame3\" serverKey=\"alpha\"/>\n</farmDashboardReplicaSources>");
        expect(padded.ok).toBe(true);
        expect(replicaRegistration.parseRegistrationDocument('<farmDashboardReplicaSources revision="1"><source sourceId="source-a"remoteSlot="savegame3" serverKey="alpha"/></farmDashboardReplicaSources>').ok).toBe(false);
        expect(replicaRegistration.parseRegistrationDocument(`<farmDashboardReplicaSources revision="1">${"x".repeat(replicaRegistration.MAX_DOCUMENT_BYTES)}</farmDashboardReplicaSources>`).error).toBe("too-large");

        const released = runLua(configFiles, configHost + `
            function delete() error("injected-native-release-failure") end
            FarmDashboardSettingsApi = { isAuthorityMachine = function() return false end }
            local conn = serverConn()
            local ready = FarmDashboardReplicaConfig:onClientServerReady(conn)
            return "ready=" .. tostring(ready)
                .. "|binding=" .. tostring(FarmDashboardReplicaConfig:bindingForConnection(conn) ~= nil)
                .. "|mirror=" .. tostring(FarmDashboardExportMirror._replicaSources[conn] ~= nil)
        `);
        expect(released).toBe("ready=false|binding=false|mirror=false");

        const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-recover-"));
        const servers = [{ id: "source-a", replicaRegistration: { remoteSlot: "savegame3", sessionPairing: "alpha" } }];
        const first = replicaRegistration.publishReplicaRegistration(profile, servers);
        expect(first.ok).toBe(true);
        replicaRegistration.commitRegistrationPublication(first);
        const second = replicaRegistration.publishReplicaRegistration(profile, [{
            id: "source-a",
            replicaRegistration: { remoteSlot: "savegame4", sessionPairing: "beta" },
        }]);
        expect(second.ok).toBe(true);
        const dir = path.dirname(second.path);
        const backup = path.join(dir, "replicaSources.xml.recovery");
        const held = path.join(dir, "replicaSources.xml.recovery.held");
        fs.renameSync(backup, held);
        const failed = replicaRegistration.restoreRegistrationPublication(second);
        expect(failed.ok).toBe(false);
        expect(fs.readFileSync(second.path, "utf8")).toBe(second.xml);
        expect(fs.existsSync(path.join(dir, "replicaSources.transaction.json"))).toBe(true);
        fs.renameSync(held, backup);
        const recovered = replicaRegistration.reconcileRegistrationTransaction(profile, servers);
        expect(recovered.ok).toBe(true);
        expect(fs.readFileSync(second.path, "utf8")).toBe(first.xml);

        const absentProfile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-recover-absent-"));
        const created = replicaRegistration.publishReplicaRegistration(absentProfile, servers);
        const absentDir = path.dirname(created.path);
        fs.rmSync(created.path);
        fs.mkdirSync(created.path);
        const absentRestore = replicaRegistration.restoreRegistrationPublication(created);
        expect(absentRestore.ok).toBe(false);
        expect(fs.existsSync(path.join(absentDir, "replicaSources.transaction.json"))).toBe(true);
        fs.rmdirSync(created.path);
        const absentRecovered = replicaRegistration.reconcileRegistrationTransaction(absentProfile, []);
        expect(absentRecovered.ok).toBe(true);
        expect(fs.existsSync(created.path)).toBe(false);
        expect(fs.existsSync(path.join(absentDir, "replicaSources.transaction.json"))).toBe(false);
    });

    test("foreign recovery, stale handles, and startup reconciliation stay bounded", async () => {
        const serversA = [{ id: "source-a", replicaRegistration: { remoteSlot: "savegame3", sessionPairing: "alpha" } }];
        const serversB = [{ id: "source-a", replicaRegistration: { remoteSlot: "savegame4", sessionPairing: "beta" } }];
        const foreign = replicaRegistration.renderRegistrationXml([
            { sourceId: "source-foreign", remoteSlot: "savegame9", sessionPairing: "gamma" },
        ], 99);
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-trust-"));
        const first = replicaRegistration.publishReplicaRegistration(profile, serversA);
        expect(replicaRegistration.commitRegistrationPublication(first).ok).toBe(true);
        const pending = replicaRegistration.publishReplicaRegistration(profile, serversB);
        const dir = path.dirname(pending.path);
        const journalFile = path.join(dir, "replicaSources.transaction.json");
        const recoveryFile = path.join(dir, "replicaSources.xml.recovery");
        const activeBefore = fs.readFileSync(pending.path);
        const journalBefore = fs.readFileSync(journalFile);
        const recoveryBefore = fs.readFileSync(recoveryFile);
        fs.writeFileSync(recoveryFile, foreign);
        const tainted = replicaRegistration.reconcileRegistrationTransaction(profile, serversA);
        expect(tainted.ok).toBe(false);
        expect(tainted.error).toBe("recovery-required");
        expect(fs.readFileSync(pending.path).equals(activeBefore)).toBe(true);
        expect(fs.readFileSync(journalFile).equals(journalBefore)).toBe(true);
        expect(fs.readFileSync(recoveryFile, "utf8")).toContain("source-foreign");

        const outside = path.join(profile, "outside.xml");
        fs.writeFileSync(outside, foreign);
        const escaped = JSON.parse(journalBefore.toString("utf8"));
        escaped.backup = "../outside.xml";
        fs.writeFileSync(journalFile, JSON.stringify(escaped));
        const escapedResult = replicaRegistration.reconcileRegistrationTransaction(profile, serversA);
        expect(escapedResult.ok).toBe(false);
        expect(fs.readFileSync(outside).toString()).toBe(foreign);
        expect(fs.readFileSync(pending.path).equals(activeBefore)).toBe(true);
        expect(fs.readFileSync(journalFile, "utf8")).toContain("../outside.xml");

        fs.writeFileSync(journalFile, journalBefore);
        fs.writeFileSync(recoveryFile, recoveryBefore);
        fs.writeFileSync(pending.path, foreign);
        const foreignActive = fs.readFileSync(pending.path);
        const foreignResult = replicaRegistration.reconcileRegistrationTransaction(profile, serversA);
        expect(foreignResult.ok).toBe(false);
        expect(fs.readFileSync(pending.path).equals(foreignActive)).toBe(true);
        expect(fs.existsSync(journalFile)).toBe(true);

        const staleProfile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-stale-"));
        const staleA = replicaRegistration.publishReplicaRegistration(staleProfile, serversA);
        expect(replicaRegistration.commitRegistrationPublication(staleA).ok).toBe(true);
        const staleB = replicaRegistration.publishReplicaRegistration(staleProfile, serversB);
        expect(replicaRegistration.commitRegistrationPublication(staleB).ok).toBe(true);
        const staleC = replicaRegistration.publishReplicaRegistration(staleProfile, [
            { id: "source-a", replicaRegistration: { remoteSlot: "savegame5", sessionPairing: "gamma" } },
        ]);
        const staleActive = fs.readFileSync(staleC.path);
        const staleJournal = fs.readFileSync(path.join(path.dirname(staleC.path), "replicaSources.transaction.json"));
        const staleRestore = replicaRegistration.restoreRegistrationPublication(staleB);
        expect(staleRestore.ok).toBe(false);
        expect(staleRestore.error).toBe("stale-transaction");
        expect(fs.readFileSync(staleC.path).equals(staleActive)).toBe(true);
        expect(fs.readFileSync(path.join(path.dirname(staleC.path), "replicaSources.transaction.json")).equals(staleJournal)).toBe(true);

        const bootProfile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-boot-"));
        const bootA = replicaRegistration.publishReplicaRegistration(bootProfile, serversA);
        replicaRegistration.commitRegistrationPublication(bootA);
        replicaRegistration.publishReplicaRegistration(bootProfile, serversB);
        const calls = [];
        const bootSource = fs.readFileSync(mainPath, "utf8");
        const bootStart = bootSource.indexOf("async function bootServer");
        const bootEnd = bootSource.indexOf("/** Same persistence + boot", bootStart);
        const bootContext = {
            calls,
            replicaRegistration: {
                reconcileRegistrationTransaction: (dir, servers) => {
                    calls.push("reconcile");
                    return replicaRegistration.reconcileRegistrationTransaction(dir, servers);
                },
            },
            runtimeActivation: runtimeActivation.createScope(),
            getFs25DocumentsRoot: () => bootProfile,
            stopAllWatchers: async () => {},
            serverStates: {},
            isLocalModeServer: () => true,
            resolveLocalWatchParts: () => ({ basePath: bootProfile, folderName: "slot" }),
            path,
            pathExists: async () => true,
            console,
            hydrateServerCacheFromDisk() {},
            hydrateLuaSnapshotFromDiskAtBoot: async () => { calls.push("hydrate"); },
            startLocalWatching: async () => { calls.push("watch"); },
            startFtpPollingCoordinator() {},
            startVanillaFillTypeHudWarmup() {},
            shouldLoadDashboardUrl: () => false,
            mainWindow: null,
            setImmediate: (fn) => fn(),
            server: { listening: true },
            listenFarmdashHttp() {},
            getLanBindAddress: () => "127.0.0.1",
            PORT: 0,
        };
        installBoundSources(bootContext);
        vm.createContext(bootContext);
        vm.runInContext(bootSource.slice(bootStart, bootEnd), bootContext);
        await bootContext.bootServer({ servers: serversA });
        expect(calls.indexOf("reconcile")).toBeGreaterThan(-1);
        expect(calls.indexOf("reconcile")).toBeLessThan(calls.indexOf("hydrate"));
        expect(calls.indexOf("hydrate")).toBeLessThan(calls.indexOf("watch"));
        expect(fs.readFileSync(path.join(bootProfile, "modSettings", "FS25_FarmDashboard", "replicaSources.xml"), "utf8")).toBe(bootA.xml);
    });

    test("journal bounds, ownership, cleanup, and startup refusal stay closed", async () => {
        const freshRegistration = () => {
            const resolved = require.resolve("../replicaRegistration");
            delete require.cache[resolved];
            return require(resolved);
        };
        const serversA = [{ id: "source-a", replicaRegistration: { remoteSlot: "savegame3", sessionPairing: "alpha" } }];
        const serversB = [{ id: "source-a", replicaRegistration: { remoteSlot: "savegame4", sessionPairing: "beta" } }];
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-bounds-"));
        const first = replicaRegistration.publishReplicaRegistration(profile, serversA);
        expect(replicaRegistration.commitRegistrationPublication(first).ok).toBe(true);
        const pending = replicaRegistration.publishReplicaRegistration(profile, serversB);
        const dir = path.dirname(pending.path);
        const journalFile = path.join(dir, "replicaSources.transaction.json");
        const recoveryFile = path.join(dir, "replicaSources.xml.recovery");
        const activeBefore = fs.readFileSync(pending.path);
        const journalBefore = fs.readFileSync(journalFile);
        const recoveryBefore = fs.readFileSync(recoveryFile);
        fs.writeFileSync(recoveryFile, "<truncated");
        const truncated = replicaRegistration.reconcileRegistrationTransaction(profile, serversA);
        expect(truncated).toEqual({ ok: false, error: "recovery-required" });
        expect(fs.readFileSync(pending.path).equals(activeBefore)).toBe(true);
        expect(fs.readFileSync(journalFile).equals(journalBefore)).toBe(true);

        const absolute = JSON.parse(journalBefore.toString("utf8"));
        absolute.backup = path.join(profile, "outside.xml");
        fs.writeFileSync(journalFile, JSON.stringify(absolute));
        fs.writeFileSync(recoveryFile, recoveryBefore);
        expect(replicaRegistration.reconcileRegistrationTransaction(profile, serversA).ok).toBe(false);
        expect(fs.readFileSync(journalFile, "utf8")).toContain("outside.xml");
        const wrongType = { ...absolute, backup: 12 };
        fs.writeFileSync(journalFile, JSON.stringify(wrongType));
        expect(replicaRegistration.reconcileRegistrationTransaction(profile, serversA).ok).toBe(false);
        const extra = { ...JSON.parse(journalBefore.toString("utf8")), unexpected: true };
        fs.writeFileSync(journalFile, JSON.stringify(extra));
        expect(replicaRegistration.reconcileRegistrationTransaction(profile, serversA).ok).toBe(false);
        fs.writeFileSync(journalFile, "{");
        expect(replicaRegistration.reconcileRegistrationTransaction(profile, serversA).ok).toBe(false);
        fs.writeFileSync(journalFile, Buffer.alloc(40000, 0x61));
        expect(replicaRegistration.reconcileRegistrationTransaction(profile, serversA).ok).toBe(false);
        expect(fs.readFileSync(pending.path).equals(activeBefore)).toBe(true);
        expect(fs.readFileSync(recoveryFile).equals(recoveryBefore)).toBe(true);

        fs.writeFileSync(journalFile, journalBefore);
        const shifted = activeBefore.toString("utf8").replace(`revision="${pending.revision}"`, 'revision="99"');
        fs.writeFileSync(pending.path, shifted);
        const shiftedResult = replicaRegistration.reconcileRegistrationTransaction(profile, serversB);
        expect(shiftedResult.ok).toBe(false);
        expect(fs.readFileSync(pending.path, "utf8")).toBe(shifted);

        fs.writeFileSync(pending.path, activeBefore);
        const prepared = JSON.parse(journalBefore.toString("utf8"));
        prepared.phase = "prepared";
        fs.writeFileSync(journalFile, JSON.stringify(prepared));
        const preparedRestore = freshRegistration().reconcileRegistrationTransaction(profile, serversA);
        expect(preparedRestore.ok).toBe(true);
        expect(fs.readFileSync(pending.path).equals(recoveryBefore)).toBe(true);

        const owned = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-owned-"));
        const ownedA = replicaRegistration.publishReplicaRegistration(owned, serversA);
        expect(replicaRegistration.commitRegistrationPublication(ownedA).ok).toBe(true);
        const ownedB = replicaRegistration.publishReplicaRegistration(owned, serversB);
        expect(replicaRegistration.commitRegistrationPublication(ownedB).ok).toBe(true);
        const ownedC = replicaRegistration.publishReplicaRegistration(owned, [
            { id: "source-a", replicaRegistration: { remoteSlot: "savegame5", sessionPairing: "gamma" } },
        ]);
        const ownedActive = fs.readFileSync(ownedC.path);
        const ownedJournal = fs.readFileSync(path.join(path.dirname(ownedC.path), "replicaSources.transaction.json"));
        const ownedBackup = fs.readFileSync(path.join(path.dirname(ownedC.path), "replicaSources.xml.recovery"));
        expect(replicaRegistration.commitRegistrationPublication(ownedB).error).toBe("stale-transaction");
        expect(freshRegistration().restoreRegistrationPublication({ path: ownedC.path, profileDir: ownedC.profileDir }).error).toBe("stale-transaction");
        const wrongProfile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-wrong-"));
        const wrongDir = path.join(wrongProfile, "modSettings", "FS25_FarmDashboard");
        fs.mkdirSync(wrongDir, { recursive: true });
        fs.writeFileSync(path.join(wrongDir, "replicaSources.xml.recovery"), "keep-me");
        expect(replicaRegistration.restoreRegistrationPublication({ ...ownedC, profileDir: wrongProfile }).ok).toBe(false);
        expect(fs.readFileSync(path.join(wrongDir, "replicaSources.xml.recovery"), "utf8")).toBe("keep-me");
        expect(fs.readFileSync(ownedC.path).equals(ownedActive)).toBe(true);
        expect(fs.readFileSync(path.join(path.dirname(ownedC.path), "replicaSources.transaction.json")).equals(ownedJournal)).toBe(true);
        expect(fs.readFileSync(path.join(path.dirname(ownedC.path), "replicaSources.xml.recovery")).equals(ownedBackup)).toBe(true);

        const cleanupProfile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-cleanup-"));
        const cleanupA = replicaRegistration.publishReplicaRegistration(cleanupProfile, serversA);
        replicaRegistration.commitRegistrationPublication(cleanupA);
        const cleanupB = replicaRegistration.publishReplicaRegistration(cleanupProfile, serversB);
        const realUnlink = fs.unlinkSync;
        fs.unlinkSync = (target) => {
            if (String(target).endsWith("replicaSources.xml.recovery")) throw new Error("unlink-fault");
            return realUnlink(target);
        };
        let cleanupResult;
        try {
            cleanupResult = replicaRegistration.commitRegistrationPublication(cleanupB);
        } finally {
            fs.unlinkSync = realUnlink;
        }
        expect(cleanupResult).toEqual({ ok: false, error: "cleanup-pending" });
        expect(fs.readFileSync(cleanupB.path, "utf8")).toBe(cleanupB.xml);
        expect(freshRegistration().commitRegistrationPublication(cleanupB).ok).toBe(true);
        expect(fs.existsSync(path.join(path.dirname(cleanupB.path), "replicaSources.transaction.json"))).toBe(false);

        const overlap = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-overlap-"));
        const overlapA = replicaRegistration.publishReplicaRegistration(overlap, serversA);
        replicaRegistration.commitRegistrationPublication(overlapA);
        const realWrite = fs.writeFileSync;
        let nested;
        fs.writeFileSync = (target, data) => {
            if (nested == null && String(target).endsWith("replicaSources.xml.tmp")) {
                nested = freshRegistration().reconcileRegistrationTransaction(overlap, serversA);
            }
            return realWrite(target, data);
        };
        let overlapB;
        try {
            overlapB = replicaRegistration.publishReplicaRegistration(overlap, serversB);
        } finally {
            fs.writeFileSync = realWrite;
        }
        expect(nested.error).toBe("registration-busy");
        expect(overlapB.ok).toBe(true);
        expect(fs.readFileSync(overlapB.path, "utf8")).toBe(overlapB.xml);

        const mainSource = fs.readFileSync(mainPath, "utf8");
        const applySource = mainSource.slice(
            mainSource.indexOf("async function applyFarmdashSetupConfig"),
            mainSource.indexOf("// ── Electron window"),
        );
        const settingsProfile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-settings-result-"));
        let stored = { servers: serversA };
        let boots = 0;
        const settings = {
            console,
            getFs25DocumentsRoot: () => settingsProfile,
            resolveServersForSave: (_prev, next) => ({ servers: next, keptExisting: false }),
            configNeedsServerReboot: () => true,
            bootServer: () => { boots += 1; },
            runtimeActivation: runtimeActivation.createScope(),
            store: { get: () => stored, set: (_key, value) => { stored = value; } },
            replicaRegistration: {
                reconcileRegistrationTransaction: () => ({ ok: true }),
                validateSnapshot: () => ({ ok: true }),
                sameRegistration: () => false,
                publishReplicaRegistration: () => ({ ok: true, transactionId: "abc", profileDir: settingsProfile, path: "published" }),
                restoreRegistrationPublication: () => ({ ok: false, error: "rollback-failed" }),
                commitRegistrationPublication: () => ({ ok: false, error: "cleanup-pending" }),
                noteActivationPending() {},
                noteRuntimeApplied() {},
                activationPendingFor() { return false; },
            },
        };
        vm.createContext(settings);
        vm.runInContext(applySource, settings);
        const pendingSave = await settings.applyFarmdashSetupConfig({ servers: serversB });
        expect(pendingSave.ok).toBe(true);
        expect(pendingSave.saveState).toBe("saved-with-recovery-pending");
        expect(pendingSave.rebooted).toBe(false);
        expect(boots).toBe(0);
        settings.replicaRegistration.commitRegistrationPublication = () => ({ ok: false, error: "stale-transaction" });
        const staleSave = await settings.applyFarmdashSetupConfig({ servers: serversB });
        expect(staleSave.ok).toBe(false);
        expect(staleSave.recoveryPending).toBe(true);
        expect(boots).toBe(0);
        settings.store.set = () => { throw new Error("store-failed"); };
        await expect(settings.applyFarmdashSetupConfig({ servers: serversB })).rejects.toThrow(/recovery-required/);
        expect(boots).toBe(0);

        const blocked = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-blocked-boot-"));
        const blockedA = replicaRegistration.publishReplicaRegistration(blocked, serversA);
        replicaRegistration.commitRegistrationPublication(blockedA);
        const blockedB = replicaRegistration.publishReplicaRegistration(blocked, serversB);
        fs.writeFileSync(path.join(path.dirname(blockedB.path), "replicaSources.xml.recovery"), "<truncated");
        const calls = [];
        const bootSource = mainSource.slice(mainSource.indexOf("async function bootServer"), mainSource.indexOf("/** Same persistence + boot"));
        const bootContext = {
            replicaRegistration,
            runtimeActivation: runtimeActivation.createScope(),
            getFs25DocumentsRoot: () => blocked,
            stopAllWatchers: async () => {},
            serverStates: {},
            isLocalModeServer: () => true,
            resolveLocalWatchParts: () => ({ basePath: blocked, folderName: "slot" }),
            path,
            pathExists: async () => true,
            console,
            hydrateServerCacheFromDisk() {},
            hydrateLuaSnapshotFromDiskAtBoot: async (srv) => { calls.push(`hydrate:${srv.id}`); },
            startLocalWatching: async (srv) => { calls.push(`watch:${srv.id}`); },
            startFtpPollingCoordinator() {},
            startVanillaFillTypeHudWarmup() {},
            shouldLoadDashboardUrl: () => false,
            mainWindow: null,
            setImmediate: (fn) => fn(),
            server: { listening: true },
            listenFarmdashHttp() {},
            getLanBindAddress: () => "127.0.0.1",
            PORT: 0,
        };
        installBoundSources(bootContext);
        vm.createContext(bootContext);
        vm.runInContext(bootSource, bootContext);
        await bootContext.bootServer({
            servers: [serversA[0], { id: "local-plain", mode: "local" }],
        });
        expect(calls).toEqual(["hydrate:local-plain", "watch:local-plain"]);
        expect(bootContext.serverStates["source-a"].configWarning.code).toBe("registration-recovery-required");
        expect(fs.readFileSync(blockedB.path).equals(Buffer.from(blockedB.xml))).toBe(true);
    });

    test("saved registration activates once and terminal cleanup follows the persisted app", async () => {
        const serversA = [{ id: "source-a", name: "Alpha", replicaRegistration: { remoteSlot: "savegame3", sessionPairing: "alpha" } }];
        const serversB = [{ id: "source-a", name: "Alpha", replicaRegistration: { remoteSlot: "savegame4", sessionPairing: "beta" } }];
        const serversC = [{ id: "source-a", name: "Alpha", replicaRegistration: { remoteSlot: "savegame5", sessionPairing: "gamma" } }];
        const mainSource = fs.readFileSync(mainPath, "utf8");
        const applySource = mainSource.slice(mainSource.indexOf("async function applyFarmdashSetupConfig"), mainSource.indexOf("// ── Electron window"));
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-activate-"));
        const seeded = replicaRegistration.publishReplicaRegistration(profile, serversA);
        expect(replicaRegistration.commitRegistrationPublication(seeded).ok).toBe(true);
        let stored = { servers: serversA };
        const boots = [];
        let bootImpl = (config) => { boots.push(JSON.parse(JSON.stringify(config.servers))); };
        const settings = {
            console,
            getFs25DocumentsRoot: () => profile,
            resolveServersForSave,
            configNeedsServerReboot,
            bootServer: (config) => bootImpl(config),
            runtimeActivation: runtimeActivation.createScope(),
            store: { get: () => stored, set: (_key, value) => { stored = value; } },
            replicaRegistration,
        };
        vm.createContext(settings);
        vm.runInContext(applySource, settings);
        const ordinary = await settings.applyFarmdashSetupConfig({ servers: serversB });
        expect(ordinary.ok).toBe(true);
        expect(ordinary.rebooted).toBe(true);
        expect(boots).toHaveLength(1);
        expect(boots[0][0].replicaRegistration).toEqual({ remoteSlot: "savegame4", sessionPairing: "beta" });
        expect(fs.readFileSync(seeded.path, "utf8")).toContain('remoteSlot="savegame4"');
        const display = await settings.applyFarmdashSetupConfig({ servers: [{ ...serversB[0], name: "Renamed" }], locale: "de" });
        expect(display.rebooted).toBe(false);
        expect(boots).toHaveLength(1);
        expect(fs.readFileSync(seeded.path, "utf8")).toContain('remoteSlot="savegame4"');

        const retryProfile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-retry-"));
        const retryA = replicaRegistration.publishReplicaRegistration(retryProfile, serversA);
        replicaRegistration.commitRegistrationPublication(retryA);
        let retryStored = { servers: serversA };
        const retryBoots = [];
        const realUnlink = fs.unlinkSync;
        fs.unlinkSync = (target) => {
            if (String(target).endsWith("replicaSources.xml.recovery")) throw new Error("unlink-fault");
            return realUnlink(target);
        };
        const retrySettings = {
            console,
            getFs25DocumentsRoot: () => retryProfile,
            resolveServersForSave,
            configNeedsServerReboot,
            bootServer: (config) => { retryBoots.push(config.servers[0].replicaRegistration.remoteSlot); },
            runtimeActivation: runtimeActivation.createScope(),
            store: { get: () => retryStored, set: (_key, value) => { retryStored = value; } },
            replicaRegistration,
        };
        vm.createContext(retrySettings);
        vm.runInContext(applySource, retrySettings);
        let first;
        try {
            first = await retrySettings.applyFarmdashSetupConfig({ servers: serversB });
        } finally {
            fs.unlinkSync = realUnlink;
        }
        expect(first.saveState).toBe("saved-with-recovery-pending");
        expect(first.rebooted).toBe(false);
        expect(retryBoots).toEqual([]);
        const journalFile = path.join(path.dirname(retryA.path), "replicaSources.transaction.json");
        expect(JSON.parse(fs.readFileSync(journalFile, "utf8")).phase).toBe("committed-cleanup");
        const second = await retrySettings.applyFarmdashSetupConfig({ servers: serversB });
        expect(second.rebooted).toBe(true);
        expect(retryBoots).toEqual(["savegame4"]);
        expect(fs.existsSync(journalFile)).toBe(false);
        const third = await retrySettings.applyFarmdashSetupConfig({ servers: serversB });
        expect(third.rebooted).toBe(false);
        expect(retryBoots).toEqual(["savegame4"]);

        const failedProfile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-bootfail-"));
        const failedA = replicaRegistration.publishReplicaRegistration(failedProfile, serversA);
        replicaRegistration.commitRegistrationPublication(failedA);
        let failedStored = { servers: serversA };
        let failBoot = true;
        const failedBoots = [];
        const failedSettings = {
            console,
            getFs25DocumentsRoot: () => failedProfile,
            resolveServersForSave,
            configNeedsServerReboot,
            bootServer: (config) => {
                failedBoots.push(config.servers[0].replicaRegistration.remoteSlot);
                if (failBoot) throw new Error("boot-failed");
            },
            runtimeActivation: runtimeActivation.createScope(),
            store: { get: () => failedStored, set: (_key, value) => { failedStored = value; } },
            replicaRegistration,
        };
        vm.createContext(failedSettings);
        vm.runInContext(applySource, failedSettings);
        const failed = await failedSettings.applyFarmdashSetupConfig({ servers: serversB });
        expect(failed.saveState).toBe("saved-with-activation-pending");
        expect(failed.rebooted).toBe(false);
        failBoot = false;
        const retriedBoot = await failedSettings.applyFarmdashSetupConfig({ servers: serversB });
        expect(retriedBoot.rebooted).toBe(true);
        expect(failedBoots).toEqual(["savegame4", "savegame4"]);

        const supersede = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-supersede-"));
        const superA = replicaRegistration.publishReplicaRegistration(supersede, serversA);
        replicaRegistration.commitRegistrationPublication(superA);
        let superStored = { servers: serversA };
        const superBoots = [];
        fs.unlinkSync = (target) => {
            if (String(target).endsWith("replicaSources.xml.recovery")) throw new Error("unlink-fault");
            return realUnlink(target);
        };
        const superSettings = {
            console,
            getFs25DocumentsRoot: () => supersede,
            resolveServersForSave,
            configNeedsServerReboot,
            bootServer: (config) => { superBoots.push(config.servers[0].replicaRegistration.remoteSlot); },
            runtimeActivation: runtimeActivation.createScope(),
            store: { get: () => superStored, set: (_key, value) => { superStored = value; } },
            replicaRegistration,
        };
        vm.createContext(superSettings);
        vm.runInContext(applySource, superSettings);
        try {
            await superSettings.applyFarmdashSetupConfig({ servers: serversB });
        } finally {
            fs.unlinkSync = realUnlink;
        }
        const jumped = await superSettings.applyFarmdashSetupConfig({ servers: serversC });
        expect(jumped.rebooted).toBe(true);
        expect(superBoots).toEqual(["savegame5"]);

        const terminal = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-terminal-"));
        const terminalA = replicaRegistration.publishReplicaRegistration(terminal, serversA);
        replicaRegistration.commitRegistrationPublication(terminalA);
        const terminalB = replicaRegistration.publishReplicaRegistration(terminal, serversB);
        const terminalDir = path.dirname(terminalB.path);
        const terminalJournal = path.join(terminalDir, "replicaSources.transaction.json");
        const terminalBackup = path.join(terminalDir, "replicaSources.xml.recovery");
        fs.unlinkSync = (target) => {
            if (String(target).endsWith("replicaSources.xml.recovery")) throw new Error("unlink-fault");
            return realUnlink(target);
        };
        let terminalCommit;
        try {
            terminalCommit = replicaRegistration.commitRegistrationPublication(terminalB);
        } finally {
            fs.unlinkSync = realUnlink;
        }
        expect(terminalCommit.error).toBe("cleanup-pending");
        const activeBefore = fs.readFileSync(terminalB.path);
        const journalBefore = fs.readFileSync(terminalJournal);
        const backupBefore = fs.readFileSync(terminalBackup);
        const fresh = () => {
            const resolved = require.resolve("../replicaRegistration");
            delete require.cache[resolved];
            return require(resolved);
        };
        const previousApp = fresh().reconcileRegistrationTransaction(terminal, serversA);
        expect(previousApp).toEqual({ ok: false, error: "recovery-required" });
        const foreignApp = fresh().reconcileRegistrationTransaction(terminal, serversC);
        expect(foreignApp.ok).toBe(false);
        expect(fs.readFileSync(terminalB.path).equals(activeBefore)).toBe(true);
        expect(fs.readFileSync(terminalJournal).equals(journalBefore)).toBe(true);
        expect(fs.readFileSync(terminalBackup).equals(backupBefore)).toBe(true);
        fs.unlinkSync(terminalBackup);
        const missingBackup = fresh().reconcileRegistrationTransaction(terminal, serversA);
        expect(missingBackup.ok).toBe(false);
        expect(fs.existsSync(terminalJournal)).toBe(true);
        const intendedApp = fresh().reconcileRegistrationTransaction(terminal, serversB);
        expect(intendedApp.ok).toBe(true);
        expect(fs.existsSync(terminalJournal)).toBe(false);
        expect(fresh().reconcileRegistrationTransaction(terminal, serversB)).toEqual({ ok: true, pending: false });

        const restoredProfile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-restored-"));
        const restoredFirst = replicaRegistration.publishReplicaRegistration(restoredProfile, serversA);
        replicaRegistration.commitRegistrationPublication(restoredFirst);
        const restoredPending = replicaRegistration.publishReplicaRegistration(restoredProfile, serversB);
        const restoredDir = path.dirname(restoredPending.path);
        const restoredJournal = path.join(restoredDir, "replicaSources.transaction.json");
        const restoredRecord = JSON.parse(fs.readFileSync(restoredJournal, "utf8"));
        restoredRecord.phase = "restored-cleanup";
        fs.writeFileSync(restoredJournal, JSON.stringify(restoredRecord));
        fs.writeFileSync(restoredPending.path, fs.readFileSync(path.join(restoredDir, "replicaSources.xml.recovery")));
        const restoredActive = fs.readFileSync(restoredPending.path);
        expect(fresh().reconcileRegistrationTransaction(restoredProfile, serversB).ok).toBe(false);
        expect(fs.readFileSync(restoredPending.path).equals(restoredActive)).toBe(true);
        expect(fs.existsSync(restoredJournal)).toBe(true);
        expect(fresh().reconcileRegistrationTransaction(restoredProfile, serversA).ok).toBe(true);
        expect(fs.existsSync(restoredJournal)).toBe(false);

        const absentProfile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-restored-absent-"));
        const absentCreated = replicaRegistration.publishReplicaRegistration(absentProfile, serversA);
        const absentJournal = path.join(path.dirname(absentCreated.path), "replicaSources.transaction.json");
        const absentRecord = JSON.parse(fs.readFileSync(absentJournal, "utf8"));
        absentRecord.phase = "restored-cleanup";
        fs.writeFileSync(absentJournal, JSON.stringify(absentRecord));
        fs.unlinkSync(absentCreated.path);
        expect(fresh().reconcileRegistrationTransaction(absentProfile, serversA).ok).toBe(false);
        expect(fs.existsSync(absentJournal)).toBe(true);
        expect(fresh().reconcileRegistrationTransaction(absentProfile, []).ok).toBe(true);
        expect(fs.existsSync(absentCreated.path)).toBe(false);
        expect(fs.existsSync(absentJournal)).toBe(false);

        const calls = [];
        const bootSource = `${mainSource.slice(mainSource.indexOf("function localCacheSourceEligible"), mainSource.indexOf("function schedulePersistServerCache"))}\n${mainSource.slice(mainSource.indexOf("function hydrateServerCacheFromDisk"), mainSource.indexOf("function getLocalLuaJsonPathForServer"))}\n${mainSource.slice(mainSource.indexOf("async function bootServer"), mainSource.indexOf("/** Same persistence + boot"))}`;
        const bootFixture = (root, options) => {
            const seen = [];
            let currentServers = [];
            const context = {
                replicaRegistration: {
                    ...replicaRegistration,
                    reconcileRegistrationTransaction: (...args) => {
                        seen.push("reconcile");
                        return replicaRegistration.reconcileRegistrationTransaction(...args);
                    },
                },
                getFs25DocumentsRoot: () => root,
                getServersFromStore: () => currentServers,
                isExplicitReplicaXmlSource,
                localIngressController,
                exportIngress,
                fs,
                runtimeActivation: runtimeActivation.createScope(),
                stopAllWatchers: async () => { seen.push("stop"); },
                serverStates: {},
                isLocalModeServer: () => true,
                resolveLocalWatchParts: () => ({ basePath: root || os.tmpdir(), folderName: "slot" }),
                path,
                pathExists: async () => true,
                console,
                loadServerCache: (_dir, id) => ({ mergedSnapshot: { marker: `cached-${id}`, serverInfo: { saveSlot: "savegame3" }, dataTimestamps: {} } }),
                app: { getPath: () => "userData" },
                applyResolvedMapBounds: (value) => value,
                applyFreshnessMeta: (snapshot) => snapshot,
                pushUxEvent() {},
                ERROR_CODES: { E_CACHE_FALLBACK: "cache" },
                updateLiveSectionBackup() {},
                updateLastGoodMergedSnapshot() {},
                broadcast: (id) => { seen.push(`broadcast-cache:${id}`); },
                hydrateLuaSnapshotFromDiskAtBoot: async (srv) => { seen.push(`hydrate-lua:${srv.id}`); },
                startLocalWatching: async (srv) => { seen.push(`watch:${srv.id}`); },
                startFtpPollingCoordinator() {},
                startVanillaFillTypeHudWarmup() {},
                shouldLoadDashboardUrl: () => false,
                mainWindow: null,
                setImmediate: (fn) => fn(),
                server: { listening: true },
                listenFarmdashHttp() {},
                getLanBindAddress: () => "127.0.0.1",
                PORT: 0,
            };
            installBoundSources(context);
            vm.createContext(context);
            vm.runInContext(bootSource, context);
            return { context, seen, run: (config) => {
                currentServers = config.servers || [];
                return context.bootServer(config, options);
            } };
        };
        const missing = bootFixture(null);
        await missing.run({ servers: [serversA[0], { id: "plain-local", mode: "local" }] });
        expect(missing.seen).toEqual(["stop", "hydrate-lua:plain-local", "watch:plain-local"]);
        expect(missing.context.serverStates["source-a"].configWarning.code).toBe("configuration-required");
        expect(missing.context.serverStates["source-a"].mergedData).toBeNull();
        expect(missing.context.serverStates["plain-local"].mergedData).toBeNull();

        const corruptProfile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-corrupt-boot-"));
        const corruptA = replicaRegistration.publishReplicaRegistration(corruptProfile, serversA);
        replicaRegistration.commitRegistrationPublication(corruptA);
        const corruptB = replicaRegistration.publishReplicaRegistration(corruptProfile, serversB);
        const corruptActive = fs.readFileSync(corruptB.path);
        const corruptJournal = fs.readFileSync(path.join(path.dirname(corruptB.path), "replicaSources.transaction.json"));
        fs.writeFileSync(path.join(path.dirname(corruptB.path), "replicaSources.xml.recovery"), "<truncated");
        const corrupt = bootFixture(corruptProfile);
        await corrupt.run({ servers: [serversA[0], { id: "plain-local", mode: "local" }] });
        expect(corrupt.seen.includes("reconcile")).toBe(true);
        expect(corrupt.seen.includes("broadcast-cache:source-a")).toBe(false);
        expect(corrupt.seen.includes("hydrate-lua:source-a")).toBe(false);
        expect(corrupt.seen.includes("watch:source-a")).toBe(false);
        expect(corrupt.seen.includes("broadcast-cache:plain-local")).toBe(false);
        expect(corrupt.context.serverStates["source-a"].configWarning.code).toBe("registration-recovery-required");
        expect(corrupt.context.serverStates["source-a"].mergedData).toBeNull();
        expect(fs.readFileSync(corruptB.path).equals(corruptActive)).toBe(true);
        expect(fs.readFileSync(path.join(path.dirname(corruptB.path), "replicaSources.transaction.json")).equals(corruptJournal)).toBe(true);

        const readyProfile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-ready-boot-"));
        const readyA = replicaRegistration.publishReplicaRegistration(readyProfile, serversA);
        replicaRegistration.commitRegistrationPublication(readyA);
        const ready = bootFixture(readyProfile);
        await ready.run({ servers: [serversA[0], { id: "plain-local", mode: "local" }] });
        expect(ready.seen).toEqual([
            "stop", "reconcile",
            "hydrate-lua:source-a", "hydrate-lua:plain-local",
            "watch:source-a", "watch:plain-local",
        ]);
        const deferred = bootFixture(readyProfile, { deferHydrate: true });
        await deferred.run({ servers: [serversA[0], { id: "plain-local", mode: "local" }] });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(deferred.seen[0]).toBe("stop");
        expect(deferred.seen[1]).toBe("reconcile");
        expect(deferred.seen.includes("broadcast-cache:source-a")).toBe(false);
        expect(deferred.seen.filter((event) => event === "watch:source-a")).toEqual(["watch:source-a"]);
        expect(deferred.seen.filter((event) => event === "watch:plain-local")).toEqual(["watch:plain-local"]);
        expect(deferred.seen.includes("hydrate-lua:plain-local")).toBe(true);
        expect(deferred.seen.includes("broadcast-cache:plain-local")).toBe(false);
    });

    test("activation stays owned across deferred failure, supersede, and a repeated save", async () => {
        const mainSource = fs.readFileSync(mainPath, "utf8");
        const bootSource = mainSource.slice(mainSource.indexOf("async function bootServer"), mainSource.indexOf("/** Same persistence + boot"));
        const applySource = mainSource.slice(mainSource.indexOf("async function applyFarmdashSetupConfig"), mainSource.indexOf("// ── Electron window"));
        const serverFor = (slot, pairing) => [{
            id: "source-a",
            mode: "local",
            localSubFolder: slot,
            replicaRegistration: { remoteSlot: slot, sessionPairing: pairing },
        }];
        const harness = () => {
            const queue = [];
            const events = [];
            const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-owned-"));
            const scope = runtimeActivation.createScope();
            let stored = { servers: serverFor("savegame3", "alpha") };
            let holdSlot = null;
            let releaseHold = null;
            let failSlot = null;
            let watchHold = null;
            let releaseWatch = null;
            let rejectWatch = null;
            const context = {
                runtimeActivation: scope,
                replicaRegistration,
                configNeedsServerReboot,
                resolveServersForSave,
                console,
                getFs25DocumentsRoot: () => profile,
                store: { get: () => stored, set: (_key, value) => { stored = value; } },
                stopAllWatchers: async () => { events.push("stop"); },
                serverStates: {},
                isLocalModeServer: () => true,
                resolveLocalWatchParts: (srv) => ({ basePath: profile, folderName: srv.localSubFolder || "slot" }),
                path,
                pathExists: async (target) => {
                    const text = String(target);
                    if (holdSlot && text.includes(holdSlot)) {
                        events.push(`pause:${holdSlot}`);
                        await new Promise((resolve) => { releaseHold = resolve; });
                    }
                    return true;
                },
                hydrateServerCacheFromDisk: (id) => { events.push(`cache:${id}`); },
                hydrateLuaSnapshotFromDiskAtBoot: async (srv) => { events.push(`lua:${srv.localSubFolder}`); },
                startLocalWatching: (srv) => {
                    events.push(`watch:${srv.localSubFolder}`);
                    if (failSlot === srv.localSubFolder) return Promise.reject(new Error("reviewer-watch-start-failed"));
                    if (watchHold === srv.localSubFolder) {
                        return new Promise((resolve, reject) => {
                            releaseWatch = resolve;
                            rejectWatch = reject;
                        });
                    }
                    return Promise.resolve();
                },
                startFtpPollingCoordinator() {},
                startVanillaFillTypeHudWarmup() {},
                shouldLoadDashboardUrl: () => false,
                mainWindow: null,
                server: { listening: true },
                listenFarmdashHttp() {},
                getLanBindAddress: () => "127.0.0.1",
                PORT: 0,
                setImmediate: (fn) => { queue.push(fn); },
            };
            installBoundSources(context);
            vm.createContext(context);
            vm.runInContext(`${bootSource}\n${applySource}`, context);
            return {
                context,
                scope,
                events,
                queue,
                hold(slot) { holdSlot = slot; },
                fail(slot) { failSlot = slot; },
                holdWatch(slot) { watchHold = slot; },
                release() { const resume = releaseHold; releaseHold = null; holdSlot = null; if (resume) resume(); },
                releaseWatcher() { const resume = releaseWatch; releaseWatch = null; rejectWatch = null; watchHold = null; if (resume) resume(); },
                rejectWatcher() {
                    const reject = rejectWatch;
                    releaseWatch = null;
                    rejectWatch = null;
                    watchHold = null;
                    if (reject) reject(new Error("stale-watch"));
                },
                async untilQueued() {
                    for (let i = 0; i < 20 && queue.length === 0; i += 1) await Promise.resolve();
                },
                async drain() {
                    await this.untilQueued();
                    while (queue.length) await queue.shift()();
                },
            };
        };

        const deferred = harness();
        deferred.fail("savegame4");
        const scheduled = await deferred.context.applyFarmdashSetupConfig({ servers: serverFor("savegame4", "beta") });
        expect(scheduled.rebooted).toBe(true);
        expect(scheduled.applied).toBe(false);
        await deferred.untilQueued();
        expect(deferred.scope.snapshot().phase).toBe("starting");
        expect(deferred.scope.snapshot().applied).toBe(false);
        expect(deferred.events.filter((event) => event.startsWith("watch:"))).toEqual([]);
        await deferred.drain();
        expect(deferred.scope.snapshot().phase).toBe("failed");
        expect(deferred.scope.snapshot().appliedSignature).toBeNull();
        deferred.fail(null);
        const failedStarts = deferred.events.filter((event) => event === "watch:savegame4").length;
        const recovered = await deferred.context.applyFarmdashSetupConfig({ servers: serverFor("savegame4", "beta") });
        expect(recovered.rebooted).toBe(true);
        await deferred.drain();
        expect(deferred.events.filter((event) => event === "watch:savegame4")).toHaveLength(failedStarts + 1);
        expect(deferred.scope.snapshot().applied).toBe(true);
        const repeat = await deferred.context.applyFarmdashSetupConfig({ servers: serverFor("savegame4", "beta") });
        expect(repeat.rebooted).toBe(false);
        expect(deferred.queue).toHaveLength(0);

        const duplicate = harness();
        duplicate.hold("savegame4");
        const firstSave = duplicate.context.applyFarmdashSetupConfig({ servers: serverFor("savegame4", "beta") });
        for (let i = 0; i < 10 && !duplicate.events.includes("pause:savegame4"); i += 1) await Promise.resolve();
        const secondSave = await duplicate.context.applyFarmdashSetupConfig({ servers: serverFor("savegame4", "beta") });
        expect(secondSave.shared).toBe(true);
        expect(duplicate.events.filter((event) => event === "stop")).toEqual(["stop"]);
        duplicate.release();
        await firstSave;
        await duplicate.drain();
        expect(duplicate.events.filter((event) => event === "watch:savegame4")).toEqual(["watch:savegame4"]);
        expect(duplicate.scope.snapshot().applied).toBe(true);

        const superseded = harness();
        superseded.hold("savegame4");
        const oldSave = superseded.context.applyFarmdashSetupConfig({ servers: serverFor("savegame4", "beta") });
        for (let i = 0; i < 10 && !superseded.events.includes("pause:savegame4"); i += 1) await Promise.resolve();
        const newSave = await superseded.context.applyFarmdashSetupConfig({ servers: serverFor("savegame5", "gamma") });
        expect(newSave.rebooted).toBe(true);
        await superseded.drain();
        expect(superseded.scope.snapshot().applied).toBe(true);
        const beforeResume = superseded.events.slice();
        superseded.release();
        await oldSave;
        await superseded.drain();
        expect(superseded.events.slice(beforeResume.length).filter((event) => event === "watch:savegame4" || event === "lua:savegame4" || event === "cache:source-a")).toEqual([]);
        expect(superseded.events.filter((event) => event === "watch:savegame5")).toEqual(["watch:savegame5"]);

        const late = harness();
        late.holdWatch("savegame4");
        const lateSave = late.context.applyFarmdashSetupConfig({ servers: serverFor("savegame4", "beta") });
        for (let i = 0; i < 10 && late.queue.length === 0; i += 1) await Promise.resolve();
        const lateStartup = late.queue.shift()();
        for (let i = 0; i < 10 && !late.events.includes("watch:savegame4"); i += 1) await Promise.resolve();
        const currentSave = await late.context.applyFarmdashSetupConfig({ servers: serverFor("savegame5", "gamma") });
        expect(currentSave.rebooted).toBe(true);
        await late.drain();
        expect(late.scope.snapshot().applied).toBe(true);
        late.releaseWatcher();
        await lateStartup;
        await lateSave;
        await late.drain();
        expect(late.scope.snapshot().applied).toBe(true);
        expect(late.events.filter((event) => event === "watch:savegame5")).toEqual(["watch:savegame5"]);
        expect(late.events.filter((event) => event === "watch:savegame4")).toEqual(["watch:savegame4"]);

        const rejected = harness();
        rejected.holdWatch("savegame4");
        const rejectedSave = rejected.context.applyFarmdashSetupConfig({ servers: serverFor("savegame4", "beta") });
        for (let i = 0; i < 10 && rejected.queue.length === 0; i += 1) await Promise.resolve();
        const rejectedStartup = rejected.queue.shift()();
        for (let i = 0; i < 10 && !rejected.events.includes("watch:savegame4"); i += 1) await Promise.resolve();
        await rejected.context.applyFarmdashSetupConfig({ servers: serverFor("savegame5", "gamma") });
        await rejected.drain();
        const appliedBeforeRejection = rejected.scope.snapshot();
        rejected.rejectWatcher();
        await rejectedStartup;
        await rejectedSave;
        expect(rejected.scope.snapshot()).toEqual(appliedBeforeRejection);
        expect(rejected.scope.snapshot().applied).toBe(true);
        expect(rejected.events.filter((event) => event === "watch:savegame5")).toEqual(["watch:savegame5"]);
    });

    test("late boot errors and real watcher resources stay with the current owner", async () => {
        const mainSource = fs.readFileSync(mainPath, "utf8");
        const bootSource = mainSource.slice(mainSource.indexOf("async function bootServer"), mainSource.indexOf("/** Same persistence + boot"));
        const applySource = mainSource.slice(mainSource.indexOf("async function applyFarmdashSetupConfig"), mainSource.indexOf("// ── Electron window"));
        const serverFor = (slot, pairing) => [{
            id: "source-a",
            mode: "local",
            localSubFolder: slot,
            replicaRegistration: { remoteSlot: slot, sessionPairing: pairing },
        }];
        const ownedHarness = () => {
            const events = [];
            const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-owned-stop-"));
            const scope = runtimeActivation.createScope();
            let stored = { servers: serverFor("savegame3", "alpha") };
            let holdNext = false;
            let rejectHeld = null;
            const queue = [];
            const context = {
                runtimeActivation: scope,
                replicaRegistration,
                configNeedsServerReboot,
                resolveServersForSave,
                console,
                getFs25DocumentsRoot: () => profile,
                store: { get: () => stored, set: (_key, value) => { stored = value; } },
                stopAllWatchers: () => {
                    events.push("stop");
                    if (!holdNext) return Promise.resolve();
                    holdNext = false;
                    return new Promise((_resolve, reject) => { rejectHeld = reject; });
                },
                serverStates: {},
                isLocalModeServer: () => true,
                resolveLocalWatchParts: (srv) => ({ basePath: profile, folderName: srv.localSubFolder || "slot" }),
                path,
                pathExists: async () => true,
                hydrateServerCacheFromDisk: (id) => { events.push(`cache:${id}`); },
                hydrateLuaSnapshotFromDiskAtBoot: async (srv) => { events.push(`lua:${srv.localSubFolder}`); },
                startLocalWatching: (srv) => { events.push(`watch:${srv.localSubFolder}`); return Promise.resolve(); },
                startFtpPollingCoordinator() {},
                startVanillaFillTypeHudWarmup() {},
                shouldLoadDashboardUrl: () => false,
                mainWindow: null,
                server: { listening: true },
                listenFarmdashHttp() {},
                getLanBindAddress: () => "127.0.0.1",
                PORT: 0,
                setImmediate: (fn) => { queue.push(fn); },
            };
            installBoundSources(context);
            vm.createContext(context);
            vm.runInContext(`${bootSource}\n${applySource}`, context);
            return {
                context,
                scope,
                hold() { holdNext = true; },
                reject(error) { const reject = rejectHeld; rejectHeld = null; if (reject) reject(error); },
                async drain() {
                    for (let i = 0; i < 20 && queue.length === 0; i += 1) await Promise.resolve();
                    while (queue.length) await queue.shift()();
                },
            };
        };

        const current = ownedHarness();
        current.hold();
        const currentSave = current.context.applyFarmdashSetupConfig({ servers: serverFor("savegame4", "beta") });
        for (let i = 0; i < 10; i += 1) await Promise.resolve();
        current.reject(new Error("reviewer-old-stop-failure"));
        await currentSave;
        for (let i = 0; i < 10; i += 1) await Promise.resolve();
        expect(current.scope.snapshot().phase).toBe("failed");
        expect(current.scope.snapshot().applied).toBe(false);
        const retried = await current.context.applyFarmdashSetupConfig({ servers: serverFor("savegame4", "beta") });
        expect(retried.rebooted).toBe(true);
        expect(retried.shared).not.toBe(true);

        const stale = ownedHarness();
        stale.hold();
        const staleSave = stale.context.applyFarmdashSetupConfig({ servers: serverFor("savegame4", "beta") });
        for (let i = 0; i < 10; i += 1) await Promise.resolve();
        await stale.context.applyFarmdashSetupConfig({ servers: serverFor("savegame5", "gamma") });
        await stale.drain();
        const beforeReject = stale.scope.snapshot();
        expect(beforeReject.applied).toBe(true);
        expect(beforeReject.generation).toBe(2);
        stale.reject(new Error("reviewer-old-stop-failure"));
        await staleSave;
        for (let i = 0; i < 10; i += 1) await Promise.resolve();
        expect(stale.scope.snapshot()).toEqual(beforeReject);

        const watcherSource = mainSource.slice(mainSource.indexOf("function releaseWatcherHandles"), mainSource.indexOf("// ── FTP polling"));
        const stopSource = mainSource.slice(mainSource.indexOf("async function stopAllWatchers"), mainSource.indexOf("function shouldLoadDashboardUrl"));
        const real = (options = {}) => {
            const queue = [];
            const events = [];
            const resources = [];
            const timers = [];
            const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-real-watch-"));
            const scope = runtimeActivation.createScope();
            let stored = { servers: serverFor("savegame3", "alpha") };
            let failMain = !!options.failMain;
            let filesReady = options.filesReady !== false;
            let dirtyFileExists = options.dirtyFileExists !== false;
            let holdFile = false;
            let holdDir = false;
            let releaseHold = null;
            let dirCalls = 0;
            let busts = 0;
            const dirtyFile = path.normalize(path.join(profile, "savegame4", "dirtyPens.json"));
            const dirtyDir = path.normalize(path.join(profile, "savegame4"));
            const context = {
                runtimeActivation: scope,
                replicaRegistration,
                configNeedsServerReboot,
                resolveServersForSave,
                console,
                getFs25DocumentsRoot: () => profile,
                store: { get: () => stored, set: (_key, value) => { stored = value; } },
                serverStates: {},
                serverCacheSaveTimers: {},
                persistAllServerCaches() {},
                clearFtpPollingTimers() {},
                isLocalModeServer: () => true,
                resolveLocalWatchParts: (srv) => ({
                    basePath: profile,
                    folderName: (srv.replicaRegistration && srv.replicaRegistration.remoteSlot) || "slot",
                }),
                path,
                pathExists: async (target) => {
                    const text = path.normalize(String(target));
                    if (text === dirtyFile) {
                        if (holdFile) {
                            events.push("pause:dirty-file");
                            await new Promise((resolve) => { releaseHold = resolve; });
                        }
                        return dirtyFileExists;
                    }
                    if (text === dirtyDir && holdDir) {
                        dirCalls += 1;
                        if (dirCalls > 1) {
                            events.push("pause:dirty-dir");
                            await new Promise((resolve) => { releaseHold = resolve; });
                        }
                    }
                    if (!filesReady && (text.endsWith("data.json") || text.endsWith("active.xml") || text.includes(`${path.sep}slot-`) || text.includes(`${path.sep}selection-`) || text.endsWith("selected.xml"))) {
                        return false;
                    }
                    return true;
                },
                fs: {
                    existsSync: () => filesReady,
                    promises: { stat: async () => ({ mtimeMs: 0 }) },
                    watch: (target, _options, listener) => {
                        events.push(`fs-watch:${target}`);
                        if (failMain && String(target).includes("replicas")) throw new Error("reviewer-fs-watch-ENOSPC");
                        const handle = {
                            path: String(target),
                            closed: false,
                            listener,
                            error: null,
                            on(event, fn) { if (event === "error") handle.error = fn; return handle; },
                            close() { handle.closed = false; handle.closed = true; },
                        };
                        resources.push(handle);
                        return handle;
                    },
                },
                ensureIdentityProposal: () => ({ status: "test-no-write" }),
                localIngressController: {
                    selectIngress: (srv) => ({
                        kind: "replica",
                        dir: path.join(profile, "replicas", srv.id),
                        configuredSlot: srv.replicaRegistration.remoteSlot,
                    }),
                },
                exportIngress: { ingestWatchedSlot: () => null },
                readLocalLuaJsonReady: async () => null,
                processLuaData() { events.push("read"); },
                livestockDetailModule: { bustDirtyIndexCache() { busts += 1; } },
                triggerXmlPoll: (id) => { events.push(`xml-poll:${id}`); },
                hydrateServerCacheFromDisk: (id) => { events.push(`cache:${id}`); },
                hydrateLuaSnapshotFromDiskAtBoot: async (srv) => { events.push(`lua:${srv.replicaRegistration.remoteSlot}`); },
                startFtpPollingCoordinator() {},
                startVanillaFillTypeHudWarmup() {},
                shouldLoadDashboardUrl: () => false,
                mainWindow: null,
                server: { listening: true },
                listenFarmdashHttp() {},
                getLanBindAddress: () => "127.0.0.1",
                PORT: 0,
                setImmediate: (fn) => { queue.push(fn); },
                setTimeout: (fn, ms) => { const timer = { kind: "timeout", ms, fn, cleared: false }; timers.push(timer); return timer; },
                setInterval: (fn, ms) => { const timer = { kind: "interval", ms, fn, cleared: false }; timers.push(timer); return timer; },
                clearTimeout: (timer) => { if (timer) timer.cleared = true; },
                clearInterval: (timer) => { if (timer) timer.cleared = true; },
            };
            installBoundSources(context);
            vm.createContext(context);
            vm.runInContext(`${watcherSource}\n${stopSource}\n${bootSource}\n${applySource}`, context);
            const live = (kind, ms) => timers.filter((timer) => timer.kind === kind && timer.ms === ms && !timer.cleared);
            return {
                context, scope, events, resources, timers, queue, profile,
                setFail(value) { failMain = value; },
                setFiles(value) { filesReady = value; },
                holdDirtyFile() { holdFile = true; dirtyFileExists = true; },
                holdDirtyDir() { holdDir = true; dirtyFileExists = false; },
                release() { const resume = releaseHold; releaseHold = null; holdFile = false; if (resume) resume(); },
                busts: () => busts,
                live,
                async untilQueued() { for (let i = 0; i < 20 && queue.length === 0; i += 1) await Promise.resolve(); },
                async drain() { await this.untilQueued(); while (queue.length) await queue.shift()(); },
                async settle() { for (let i = 0; i < 30; i += 1) await Promise.resolve(); },
            };
        };

        const failedWatch = real({ failMain: true });
        const failedSave = await failedWatch.context.applyFarmdashSetupConfig({ servers: serverFor("savegame4", "beta") });
        expect(failedSave.applied).toBe(false);
        await failedWatch.drain();
        expect(failedWatch.scope.snapshot().applied).toBe(false);
        expect(failedWatch.scope.snapshot().phase).toBe("starting");
        expect(failedWatch.context.serverStates["source-a"].watcher).toBeFalsy();
        expect(failedWatch.context.serverStates["source-a"].watchReadiness).toBe("retrying");
        expect(failedWatch.context.serverStates["source-a"].configWarning.code).toBe("watcher-start-failed");
        expect(failedWatch.live("timeout", 5000)).toHaveLength(1);
        const repeated = await failedWatch.context.applyFarmdashSetupConfig({ servers: serverFor("savegame4", "beta") });
        expect(repeated.shared).toBe(true);
        expect(failedWatch.live("timeout", 5000)).toHaveLength(1);
        failedWatch.setFail(false);
        const retryTimer = failedWatch.live("timeout", 5000)[0];
        retryTimer.fn();
        await failedWatch.settle();
        expect(failedWatch.scope.snapshot().applied).toBe(true);
        expect(failedWatch.resources.filter((handle) => handle.path.includes("replicas") && !handle.closed)).toHaveLength(1);
        expect(failedWatch.timers.filter((timer) => timer.kind === "timeout" && timer.ms === 5000)).toHaveLength(1);

        const waiting = real({ filesReady: false });
        await waiting.context.applyFarmdashSetupConfig({ servers: serverFor("savegame4", "beta") });
        await waiting.drain();
        expect(waiting.scope.snapshot().applied).toBe(false);
        expect(waiting.context.serverStates["source-a"].watchReadiness).toBe("waiting");
        expect(waiting.resources).toHaveLength(0);
        expect(waiting.live("timeout", 5000)).toHaveLength(1);
        waiting.setFiles(true);
        waiting.live("timeout", 5000)[0].fn();
        await waiting.settle();
        expect(waiting.scope.snapshot().applied).toBe(true);
        expect(waiting.resources.filter((handle) => !handle.closed)).toHaveLength(2);

        const late = real();
        late.holdDirtyFile();
        const lateSave = late.context.applyFarmdashSetupConfig({ servers: serverFor("savegame4", "beta") });
        await late.untilQueued();
        const lateStartup = late.queue.shift()();
        for (let i = 0; i < 20 && !late.events.includes("pause:dirty-file"); i += 1) await Promise.resolve();
        await late.context.applyFarmdashSetupConfig({ servers: serverFor("savegame5", "gamma") });
        await late.drain();
        const beforeResume = late.scope.snapshot();
        const pollsBefore = late.events.filter((event) => event.startsWith("xml-poll:")).length;
        const intervalsBefore = late.live("interval", 60000).length;
        late.release();
        await lateStartup;
        await lateSave;
        await late.settle();
        expect(late.scope.snapshot()).toEqual(beforeResume);
        expect(late.events.filter((event) => event.includes("savegame4") && event.includes("dirtyPens.json"))).toEqual([]);
        expect(late.events.filter((event) => event.startsWith("xml-poll:"))).toHaveLength(pollsBefore);
        expect(late.live("interval", 60000)).toHaveLength(intervalsBefore);
        expect(late.resources.filter((handle) => handle.path.includes("savegame5") && handle.path.includes("dirtyPens.json") && !handle.closed)).toHaveLength(1);

        const fallback = real();
        fallback.holdDirtyDir();
        const fallbackSave = fallback.context.applyFarmdashSetupConfig({ servers: serverFor("savegame4", "beta") });
        await fallback.untilQueued();
        const fallbackStartup = fallback.queue.shift()();
        for (let i = 0; i < 20 && !fallback.events.includes("pause:dirty-dir"); i += 1) await Promise.resolve();
        await fallback.context.applyFarmdashSetupConfig({ servers: serverFor("savegame5", "gamma") });
        await fallback.drain();
        const fallbackBefore = fallback.events.length;
        fallback.release();
        await fallbackStartup;
        await fallbackSave;
        await fallback.settle();
        expect(fallback.scope.snapshot().applied).toBe(true);
        expect(fallback.events.slice(fallbackBefore).filter((event) => event.includes("savegame4"))).toEqual([]);
        expect(fallback.resources.filter((handle) => handle.path.includes("savegame4") && !handle.closed)).toEqual([]);

        const retired = real();
        await retired.context.applyFarmdashSetupConfig({ servers: serverFor("savegame4", "beta") });
        await retired.drain();
        const oldHandles = retired.resources.slice();
        const oldIntervals = retired.timers.filter((timer) => timer.kind === "interval");
        const bustsBefore = retired.busts();
        const readsBefore = retired.events.filter((event) => event === "read").length;
        const polls = retired.events.filter((event) => event.startsWith("xml-poll:")).length;
        await retired.context.stopAllWatchers();
        oldHandles.forEach((handle) => { if (handle.listener) handle.listener(); if (handle.error) handle.error(new Error("retired")); });
        oldIntervals.forEach((timer) => timer.fn());
        await retired.settle();
        expect(retired.busts()).toBe(bustsBefore);
        expect(retired.events.filter((event) => event === "read")).toHaveLength(readsBefore);
        expect(retired.events.filter((event) => event.startsWith("xml-poll:"))).toHaveLength(polls);
        expect(oldHandles.every((handle) => handle.closed)).toBe(true);
        expect(oldIntervals.every((timer) => timer.cleared)).toBe(true);
    });

    test("source readiness is aggregate and each retry retires the previous attempt", async () => {
        const mainSource = fs.readFileSync(mainPath, "utf8");
        const watcherSource = mainSource.slice(mainSource.indexOf("function releaseWatcherHandles"), mainSource.indexOf("// ── FTP polling"));
        const stopSource = mainSource.slice(mainSource.indexOf("async function stopAllWatchers"), mainSource.indexOf("function shouldLoadDashboardUrl"));
        const bootSource = mainSource.slice(mainSource.indexOf("async function bootServer"), mainSource.indexOf("/** Same persistence + boot"));
        const applySource = mainSource.slice(mainSource.indexOf("async function applyFarmdashSetupConfig"), mainSource.indexOf("// ── Electron window"));
        const open = () => {
            const queue = [];
            const resources = [];
            const timers = [];
            const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-aggregate-"));
            const scope = runtimeActivation.createScope();
            let stored = { servers: [{ id: "source-a", mode: "local", localSubFolder: "savegame3", replicaRegistration: { remoteSlot: "savegame3", sessionPairing: "alpha" } }] };
            let failIds = new Set();
            let waitingIds = new Set();
            let holdFile = false;
            const holdWaiters = [];
            let warmups = 0;
            const context = {
                runtimeActivation: scope,
                replicaRegistration,
                configNeedsServerReboot,
                resolveServersForSave,
                console,
                getFs25DocumentsRoot: () => profile,
                store: { get: () => stored, set: (_key, value) => { stored = value; } },
                serverStates: {},
                serverCacheSaveTimers: {},
                persistAllServerCaches() {},
                clearFtpPollingTimers() {},
                isLocalModeServer: () => true,
                resolveLocalWatchParts: (srv) => ({
                    basePath: profile,
                    folderName: (srv.replicaRegistration && srv.replicaRegistration.remoteSlot) || srv.localSubFolder || "slot",
                }),
                path,
                pathExists: async (target) => {
                    const text = String(target);
                    if (holdFile && text.includes(`${path.sep}savegame4${path.sep}dirtyPens.json`)) {
                        await new Promise((resolve) => { holdWaiters.push(resolve); });
                    }
                    for (const id of waitingIds) {
                        if (text.includes(id) || text.includes(id === "source-b" ? "savegame5" : "savegame4")) return false;
                    }
                    return true;
                },
                fs: {
                    existsSync: () => true,
                    promises: { stat: async () => ({ mtimeMs: 0 }) },
                    watch: (target, _options, listener) => {
                        const id = String(target).includes("source-b") ? "source-b" : "source-a";
                        if (failIds.has(id) && String(target).includes("replicas")) throw new Error("reviewer-fs-watch-ENOSPC");
                        const handle = {
                            path: String(target),
                            closed: false,
                            listener,
                            error: null,
                            on(event, fn) { if (event === "error") handle.error = fn; return handle; },
                            close() { handle.closed = true; },
                        };
                        resources.push(handle);
                        return handle;
                    },
                },
                ensureIdentityProposal: () => ({ status: "test-no-write" }),
                localIngressController: {
                    selectIngress: (srv) => ({ kind: "replica", dir: path.join(profile, "replicas", srv.id), configuredSlot: srv.localSubFolder || "slot" }),
                },
                exportIngress: { ingestWatchedSlot: () => null },
                readLocalLuaJsonReady: async () => null,
                processLuaData() {},
                livestockDetailModule: { bustDirtyIndexCache() {} },
                triggerXmlPoll() {},
                hydrateServerCacheFromDisk() {},
                hydrateLuaSnapshotFromDiskAtBoot: async () => {},
                startFtpPollingCoordinator(_config, servers) {
                    if (servers && servers.length) warmups += 1;
                },
                startVanillaFillTypeHudWarmup() { warmups += 1; },
                shouldLoadDashboardUrl: () => false,
                mainWindow: null,
                server: { listening: true },
                listenFarmdashHttp() {},
                getLanBindAddress: () => "127.0.0.1",
                PORT: 0,
                setImmediate: (fn) => { queue.push(fn); },
                setTimeout: (fn, ms) => { const timer = { kind: "timeout", ms, fn, cleared: false, fired: false }; timers.push(timer); return timer; },
                setInterval: (fn, ms) => { const timer = { kind: "interval", ms, fn, cleared: false, fired: false }; timers.push(timer); return timer; },
                clearTimeout: (timer) => { if (timer) timer.cleared = true; },
                clearInterval: (timer) => { if (timer) timer.cleared = true; },
            };
            installBoundSources(context);
            vm.createContext(context);
            vm.runInContext(`${watcherSource}\n${stopSource}\n${bootSource}\n${applySource}`, context);
            const pair = (left, right) => ([
                { id: "source-a", mode: "local", localSubFolder: "savegame4", replicaRegistration: { remoteSlot: "savegame4", sessionPairing: left } },
                { id: "source-b", mode: "local", localSubFolder: "savegame5", replicaRegistration: { remoteSlot: "savegame5", sessionPairing: right } },
            ]);
            return {
                context, scope, resources, timers, profile,
                fail(ids) { failIds = new Set(ids); },
                wait(ids) { waitingIds = new Set(ids); },
                warmups: () => warmups,
                live: (kind, ms) => timers.filter((timer) => timer.kind === kind && timer.ms === ms && !timer.cleared && !timer.fired),
                async save(servers) {
                    const approvedPendingReplica = servers.find((server) => server.id === "source-b");
                    const result = await context.applyFarmdashSetupConfig({ servers }, { approvedPendingReplica });
                    for (let i = 0; i < 20 && queue.length === 0; i += 1) await Promise.resolve();
                    while (queue.length) await queue.shift()();
                    return result;
                },
                async drive(id) {
                    const timer = context.serverStates[id] && context.serverStates[id].retryTimer;
                    timer.fired = true;
                    timer.fn();
                    for (let i = 0; i < 30; i += 1) await Promise.resolve();
                },
                async drain() {
                    for (let i = 0; i < 20 && queue.length === 0; i += 1) await Promise.resolve();
                    while (queue.length) await queue.shift()();
                },
                startQueued() {
                    return queue.length ? queue.shift()() : null;
                },
                hold() { holdFile = true; },
                release() { holdFile = false; holdWaiters.splice(0).forEach((resume) => resume()); },
                pair,
            };
        };

        const both = open();
        both.fail(["source-a", "source-b"]);
        await both.save(both.pair("beta", "gamma"));
        expect(both.scope.snapshot().applied).toBe(false);
        expect(both.context.serverStates["source-a"].watchReadiness).toBe("retrying");
        expect(both.context.serverStates["source-b"].watchReadiness).toBe("retrying");
        both.fail(["source-b"]);
        await both.drive("source-a");
        expect(both.context.serverStates["source-a"].watchReadiness).toBe("armed");
        expect(both.context.serverStates["source-a"].configWarning).toBeNull();
        expect(both.context.serverStates["source-b"].watchReadiness).toBe("retrying");
        expect(both.scope.snapshot().applied).toBe(false);
        expect(both.warmups()).toBe(0);
        both.fail([]);
        await both.drive("source-b");
        expect(both.context.serverStates["source-b"].watchReadiness).toBe("armed");
        expect(both.scope.snapshot().applied).toBe(true);
        expect(both.warmups()).toBe(1);

        const reverse = open();
        reverse.fail(["source-a", "source-b"]);
        await reverse.save(reverse.pair("beta", "gamma"));
        reverse.fail(["source-a"]);
        await reverse.drive("source-b");
        expect(reverse.scope.snapshot().applied).toBe(false);
        reverse.fail([]);
        await reverse.drive("source-a");
        expect(reverse.scope.snapshot().applied).toBe(true);
        expect(reverse.warmups()).toBe(1);

        const waiting = open();
        waiting.wait(["source-b"]);
        await waiting.save(waiting.pair("beta", "gamma"));
        expect(waiting.context.serverStates["source-a"].watchReadiness).toBe("armed");
        expect(waiting.context.serverStates["source-b"].watchReadiness).toBe("waiting");
        expect(waiting.scope.snapshot().applied).toBe(false);
        waiting.wait([]);
        await waiting.drive("source-b");
        expect(waiting.context.serverStates["source-b"].watchReadiness).toBe("armed");
        expect(waiting.scope.snapshot().applied).toBe(true);
        expect(waiting.warmups()).toBe(1);

        const blocked = open();
        blocked.context.getFs25DocumentsRoot = () => null;
        blocked.fail(["source-a"]);
        const blockedBoot = blocked.context.bootServer({
            servers: [
                { id: "source-a", mode: "local", localSubFolder: "savegame4" },
                { id: "source-b", mode: "local", localSubFolder: "savegame5", replicaRegistration: { remoteSlot: "savegame5", sessionPairing: "gamma" } },
            ],
        }, { deferHydrate: true });
        await blocked.drain();
        await blockedBoot;
        blocked.fail([]);
        await blocked.drive("source-a");
        expect(blocked.context.serverStates["source-a"].watchReadiness).toBe("armed");
        expect(blocked.context.serverStates["source-b"].watcher).toBeFalsy();
        expect(blocked.scope.snapshot().applied).toBe(false);
        expect(blocked.scope.snapshot().phase).toBe("blocked");
        expect(blocked.warmups()).toBe(0);

        const peer = open();
        await peer.save(peer.pair("beta", "gamma"));
        const peerHandle = peer.context.serverStates["source-b"].watcher;
        const armedHandle = peer.resources.find((handle) => handle.path.includes(`${path.sep}source-a`) && !handle.closed);
        armedHandle.error(new Error("runtime"));
        expect(peer.scope.snapshot().applied).toBe(false);
        expect(peer.context.serverStates["source-a"].watchReadiness).toBe("retrying");
        expect(peer.context.serverStates["source-b"].watcher).toBe(peerHandle);
        expect(peerHandle.closed).toBe(false);
        await peer.drive("source-a");
        expect(peer.scope.snapshot().applied).toBe(true);
        expect(peer.context.serverStates["source-a"].configWarning).toBeNull();
        expect(peer.context.serverStates["source-b"].watcher).toBe(peerHandle);
        expect(peer.warmups()).toBe(1);

        const cycles = open();
        await cycles.save([{ id: "source-a", mode: "local", localSubFolder: "savegame4", replicaRegistration: { remoteSlot: "savegame4", sessionPairing: "beta" } }]);
        const baseline = () => ({
            main: cycles.resources.filter((handle) => handle.path.includes("replicas") && !handle.closed).length,
            dirty: cycles.resources.filter((handle) => handle.path.includes("dirtyPens.json") && !handle.closed).length,
            poll: cycles.live("interval", 10000).length,
            xml: cycles.live("interval", 60000).length,
            retry: cycles.live("timeout", 5000).length,
        });
        expect(baseline()).toEqual({ main: 1, dirty: 1, poll: 1, xml: 1, retry: 0 });
        for (let turn = 0; turn < 3; turn += 1) {
            const current = cycles.resources.find((handle) => handle.path.includes("replicas") && !handle.closed);
            current.error(new Error(`cycle-${turn}`));
            expect(cycles.scope.snapshot().applied).toBe(false);
            await cycles.drive("source-a");
            expect(cycles.scope.snapshot().applied).toBe(true);
            expect(baseline()).toEqual({ main: 1, dirty: 1, poll: 1, xml: 1, retry: 0 });
        }
        cycles.context.serverStates["source-a"].configWarning = { code: "localSubFolderMissing", message: "keep" };
        const stale = cycles.resources.find((handle) => handle.path.includes("replicas") && !handle.closed);
        stale.error(new Error("keep-warning"));
        await cycles.drive("source-a");
        expect(cycles.context.serverStates["source-a"].configWarning.code).toBe("localSubFolderMissing");
        expect(cycles.context.serverStates["source-a"].watchReadiness).toBe("armed");
        const retired = cycles.resources.find((handle) => handle.closed && handle.error);
        retired.error(new Error("stale"));
        expect(cycles.context.serverStates["source-a"].configWarning.code).toBe("localSubFolderMissing");
        expect(cycles.context.serverStates["source-a"].watchReadiness).toBe("armed");
        const retiredTimers = cycles.timers.slice();
        await cycles.context.stopAllWatchers();
        retiredTimers.forEach((timer) => timer.fn && timer.fn());
        expect(cycles.resources.every((handle) => handle.closed)).toBe(true);
        expect(cycles.timers.every((timer) => timer.cleared || timer.fired)).toBe(true);

        const late = open();
        late.hold();
        const lateServer = { id: "source-a", mode: "local", localSubFolder: "savegame4", replicaRegistration: { remoteSlot: "savegame4", sessionPairing: "beta" } };
        const lateSave = late.context.applyFarmdashSetupConfig({ servers: [lateServer] });
        for (let i = 0; i < 20; i += 1) await Promise.resolve();
        const firstStartup = late.startQueued();
        for (let i = 0; i < 20 && late.resources.filter((handle) => handle.path.includes("replicas")).length === 0; i += 1) await Promise.resolve();
        const secondStartup = late.context.startLocalWatching(lateServer);
        late.release();
        await firstStartup;
        await secondStartup;
        await lateSave;
        expect(late.resources.filter((handle) => handle.path.includes("dirtyPens.json") && !handle.closed)).toHaveLength(1);
        expect(late.scope.snapshot().applied).toBe(true);
    });

    test("remote monitoring starts independently of local readiness", async () => {
        const beforeBind = runtimeActivation.createScope();
        const beforeClaim = beforeBind.begin({ servers: [] });
        let beforeRuns = 0;
        beforeBind.setReadyContinuation(beforeClaim.generation, () => { beforeRuns += 1; });
        beforeBind.bindSources(beforeClaim.generation, []);
        expect(beforeBind.snapshot().applied).toBe(false);
        expect(beforeRuns).toBe(0);
        beforeBind.settleStartup(beforeClaim.generation);
        expect(beforeBind.snapshot().applied).toBe(true);
        expect(beforeRuns).toBe(1);
        beforeBind.setReadyContinuation(beforeClaim.generation, () => { beforeRuns += 10; });
        expect(beforeRuns).toBe(1);

        const afterBind = runtimeActivation.createScope();
        const afterClaim = afterBind.begin({ servers: [] });
        let afterRuns = 0;
        afterBind.bindSources(afterClaim.generation, []);
        afterBind.settleStartup(afterClaim.generation);
        expect(afterBind.snapshot().applied).toBe(false);
        afterBind.setReadyContinuation(afterClaim.generation, () => { afterRuns += 1; });
        expect(afterBind.snapshot().applied).toBe(true);
        expect(afterRuns).toBe(1);

        const mainSource = fs.readFileSync(mainPath, "utf8");
        const watcherSource = mainSource.slice(mainSource.indexOf("function releaseWatcherHandles"), mainSource.indexOf("// ── FTP polling"));
        const stopSource = mainSource.slice(mainSource.indexOf("async function stopAllWatchers"), mainSource.indexOf("function shouldLoadDashboardUrl"));
        const bootSource = mainSource.slice(mainSource.indexOf("async function bootServer"), mainSource.indexOf("/** Same persistence + boot"));
        const applySource = mainSource.slice(mainSource.indexOf("async function applyFarmdashSetupConfig"), mainSource.indexOf("// ── Electron window"));
        const open = () => {
            const queue = [];
            const resources = [];
            const ftpCalls = [];
            const events = [];
            const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-remote-"));
            const scope = runtimeActivation.createScope();
            let stored = { servers: [] };
            let throwRemote = false;
            let waiting = false;
            let failLocal = false;
            let warmups = 0;
            const context = {
                runtimeActivation: scope,
                replicaRegistration,
                resolveServersForSave,
                configNeedsServerReboot,
                store: { get: () => stored, set: (_key, value) => { stored = value; } },
                console,
                getFs25DocumentsRoot: () => profile,
                serverStates: {},
                serverCacheSaveTimers: {},
                persistAllServerCaches() {},
                clearFtpPollingTimers() {},
                isLocalModeServer(srv) {
                    if (!srv || typeof srv !== "object") return false;
                    if (srv.mode === "ftp") return false;
                    if (srv.mode === "local") return true;
                    return !!(srv.localPath || srv.path || srv.localSubFolder);
                },
                resolveLocalWatchParts: (srv) => ({ basePath: profile, folderName: srv.localSubFolder || "slot" }),
                path,
                pathExists: async (target) => {
                    const text = String(target);
                    if (!waiting) return true;
                    return text.endsWith(`${path.sep}savegame4`);
                },
                fs: {
                    existsSync: () => true,
                    promises: { stat: async () => ({ mtimeMs: 0 }) },
                    watch: (target, _options, listener) => {
                        if (failLocal && String(target).includes("replicas")) throw new Error("reviewer-fs-watch-ENOSPC");
                        const handle = {
                            path: String(target),
                            closed: false,
                            listener,
                            error: null,
                            on(event, fn) { if (event === "error") handle.error = fn; return handle; },
                            close() { handle.closed = true; },
                        };
                        resources.push(handle);
                        return handle;
                    },
                },
                ensureIdentityProposal: () => ({ status: "test-no-write" }),
                localIngressController: {
                    selectIngress: (srv) => ({ kind: "replica", dir: path.join(profile, "replicas", srv.id), configuredSlot: srv.localSubFolder || "slot" }),
                },
                exportIngress: { ingestWatchedSlot: () => null },
                readLocalLuaJsonReady: async () => null,
                processLuaData() {},
                livestockDetailModule: { bustDirtyIndexCache() {} },
                triggerXmlPoll() {},
                hydrateServerCacheFromDisk(id) { events.push(`cache:${id}`); },
                hydrateLuaSnapshotFromDiskAtBoot: async (srv) => { events.push(`lua:${srv.id}`); },
                startFtpPollingCoordinator(_config, servers) {
                    ftpCalls.push((servers || []).map((srv) => srv.id));
                    if (throwRemote) throw new Error("reviewer-ftp-start-failed");
                },
                startVanillaFillTypeHudWarmup() { warmups += 1; },
                shouldLoadDashboardUrl: () => false,
                mainWindow: null,
                server: { listening: true },
                listenFarmdashHttp() {},
                getLanBindAddress: () => "127.0.0.1",
                PORT: 0,
                setImmediate: (fn) => { queue.push(fn); },
                setTimeout: (fn, ms) => ({ kind: "timeout", ms, fn, cleared: false, fired: false }),
                setInterval: (fn, ms) => ({ kind: "interval", ms, fn, cleared: false, fired: false }),
                clearTimeout(timer) { if (timer) timer.cleared = true; },
                clearInterval(timer) { if (timer) timer.cleared = true; },
            };
            installBoundSources(context);
            vm.createContext(context);
            vm.runInContext(`${watcherSource}\n${stopSource}\n${bootSource}\n${applySource}`, context);
            const ftp = (id, host) => ({ id, mode: "ftp", ftpHost: host });
            const local = { id: "source-a", mode: "local", localSubFolder: "savegame4" };
            return {
                context, scope, resources, events, local, ftp,
                ftpCalls: () => ftpCalls.map((row) => row.slice()),
                warmups: () => warmups,
                fail() { failLocal = true; },
                heal() { failLocal = false; },
                wait() { waiting = true; },
                unwait() { waiting = false; },
                crashRemote() { throwRemote = true; },
                heal() { failLocal = false; throwRemote = false; },
                async save(servers) {
                    const result = await context.applyFarmdashSetupConfig({ servers });
                    for (let i = 0; i < 20 && queue.length === 0; i += 1) await Promise.resolve();
                    while (queue.length) await queue.shift()();
                    return result;
                },
                async drain() {
                    for (let i = 0; i < 20 && queue.length === 0; i += 1) await Promise.resolve();
                    while (queue.length) await queue.shift()();
                },
                async drive() {
                    const timer = context.serverStates["source-a"] && context.serverStates["source-a"].retryTimer;
                    timer.fired = true;
                    timer.fn();
                    for (let i = 0; i < 30; i += 1) await Promise.resolve();
                },
            };
        };

        const deferred = open();
        const deferredResult = await deferred.context.bootServer({
            servers: [deferred.ftp("remote-only", "fixture.invalid")],
        }, { deferHydrate: true });
        expect(deferredResult.applied).toBe(false);
        expect(deferred.ftpCalls()).toEqual([]);
        expect(deferred.scope.snapshot().applied).toBe(false);
        await deferred.drain();
        expect(deferred.ftpCalls()).toEqual([["remote-only"]]);
        expect(deferred.scope.snapshot().applied).toBe(true);
        expect(deferred.warmups()).toBe(1);
        expect(deferred.resources).toHaveLength(0);

        const immediate = open();
        const immediateResult = await immediate.context.bootServer({
            servers: [immediate.ftp("remote-only", "fixture.invalid")],
        });
        expect(immediateResult.applied).toBe(true);
        expect(immediate.ftpCalls()).toEqual([["remote-only"]]);
        expect(immediate.scope.snapshot().applied).toBe(true);

        const empty = open();
        const emptyResult = await empty.context.bootServer({ servers: [] });
        expect(emptyResult.applied).toBe(true);
        expect(empty.ftpCalls()).toEqual([[]]);
        expect(empty.warmups()).toBe(1);
        expect(empty.resources).toHaveLength(0);
        expect(empty.scope.snapshot().applied).toBe(true);

        const healthy = open();
        const healthyResult = await healthy.context.bootServer({
            servers: [healthy.local, healthy.ftp("remote-only", "fixture.invalid")],
        });
        expect(healthyResult.applied).toBe(true);
        expect(healthy.ftpCalls()).toEqual([["remote-only"]]);
        expect(healthy.context.serverStates["source-a"].watchReadiness).toBe("armed");
        expect(healthy.warmups()).toBe(1);

        const retrying = open();
        retrying.fail();
        await retrying.context.bootServer({
            servers: [retrying.local, retrying.ftp("remote-only", "fixture.invalid")],
        }, { deferHydrate: true });
        await retrying.drain();
        expect(retrying.ftpCalls()).toEqual([["remote-only"]]);
        expect(retrying.context.serverStates["source-a"].watchReadiness).toBe("retrying");
        expect(retrying.scope.snapshot().applied).toBe(false);
        expect(retrying.warmups()).toBe(0);
        retrying.heal();
        await retrying.drive();
        expect(retrying.ftpCalls()).toEqual([["remote-only"]]);
        expect(retrying.scope.snapshot().applied).toBe(true);
        expect(retrying.warmups()).toBe(1);

        const waiting = open();
        waiting.wait();
        await waiting.context.bootServer({
            servers: [waiting.local, waiting.ftp("remote-only", "fixture.invalid")],
        }, { deferHydrate: true });
        await waiting.drain();
        expect(waiting.ftpCalls()).toEqual([["remote-only"]]);
        expect(waiting.context.serverStates["source-a"].watchReadiness).toBe("waiting");
        expect(waiting.scope.snapshot().applied).toBe(false);
        expect(waiting.warmups()).toBe(0);
        waiting.unwait();
        await waiting.drive();
        expect(waiting.ftpCalls()).toEqual([["remote-only"]]);
        expect(waiting.scope.snapshot().applied).toBe(true);
        expect(waiting.warmups()).toBe(1);

        const blocked = open();
        blocked.context.getFs25DocumentsRoot = () => null;
        await blocked.context.bootServer({
            servers: [
                { id: "source-b", mode: "local", localSubFolder: "savegame5", replicaRegistration: { remoteSlot: "savegame5", sessionPairing: "gamma" } },
                blocked.ftp("remote-only", "fixture.invalid"),
            ],
        }, { deferHydrate: true });
        await blocked.drain();
        expect(blocked.ftpCalls()).toEqual([["remote-only"]]);
        expect(blocked.events.filter((event) => event.endsWith("source-b"))).toEqual([]);
        expect(blocked.events).toContain("lua:remote-only");
        expect(blocked.context.serverStates["source-b"].watcher).toBeFalsy();
        expect(blocked.scope.snapshot().applied).toBe(false);
        expect(blocked.scope.snapshot().phase).toBe("blocked");
        expect(blocked.warmups()).toBe(0);

        const shared = open();
        shared.fail();
        await shared.context.bootServer({
            servers: [shared.local, shared.ftp("remote-only", "fixture.invalid")],
        }, { deferHydrate: true });
        await shared.drain();
        const sharedAgain = await shared.context.bootServer({
            servers: [shared.local, shared.ftp("remote-only", "fixture.invalid")],
        }, { deferHydrate: true });
        await shared.drain();
        expect(sharedAgain.shared).toBe(true);
        expect(shared.ftpCalls()).toEqual([["remote-only"]]);

        const peer = open();
        await peer.context.bootServer({
            servers: [peer.local, peer.ftp("remote-only", "fixture.invalid")],
        });
        const currentHandle = peer.resources.find((handle) => handle.path.includes("replicas") && !handle.closed);
        currentHandle.error(new Error("runtime"));
        expect(peer.scope.snapshot().applied).toBe(false);
        expect(peer.ftpCalls()).toEqual([["remote-only"]]);
        await peer.drive();
        expect(peer.scope.snapshot().applied).toBe(true);
        expect(peer.ftpCalls()).toEqual([["remote-only"]]);
        expect(peer.warmups()).toBe(1);

        const replaced = open();
        const oldBoot = replaced.context.bootServer({
            servers: [replaced.ftp("remote-b", "old.invalid")],
        }, { deferHydrate: true });
        const newBoot = replaced.context.bootServer({
            servers: [replaced.ftp("remote-c", "new.invalid")],
        }, { deferHydrate: true });
        await replaced.drain();
        await oldBoot;
        await newBoot;
        expect(replaced.ftpCalls()).toEqual([["remote-c"]]);
        expect(replaced.scope.snapshot().applied).toBe(true);

        const broken = open();
        const failedConfig = [broken.ftp("remote-only", "fixture.invalid")];
        broken.crashRemote();
        const failedSave = await broken.save(failedConfig);
        expect(failedSave.shared).not.toBe(true);
        expect(broken.ftpCalls()).toEqual([["remote-only"]]);
        expect(broken.scope.snapshot().phase).toBe("failed");
        expect(broken.scope.snapshot().applied).toBe(false);
        expect(broken.scope.snapshot().error).toBe("service-start-failed");
        expect(broken.warmups()).toBe(0);
        broken.heal();
        const retry = await broken.context.applyFarmdashSetupConfig({ servers: failedConfig });
        expect(retry.shared).not.toBe(true);
        const during = await broken.context.applyFarmdashSetupConfig({ servers: failedConfig });
        expect(during.shared).toBe(true);
        await broken.drain();
        expect(broken.ftpCalls()).toEqual([["remote-only"], ["remote-only"]]);
        expect(broken.scope.snapshot().applied).toBe(true);
        expect(broken.scope.snapshot().error).toBeNull();
        const unchanged = await broken.context.applyFarmdashSetupConfig({ servers: failedConfig });
        expect(unchanged.rebooted).toBe(false);
        expect(unchanged.shared).not.toBe(true);
        expect(broken.ftpCalls()).toEqual([["remote-only"], ["remote-only"]]);

        const beside = open();
        beside.crashRemote();
        await beside.save([beside.local, beside.ftp("remote-only", "fixture.invalid")]);
        expect(beside.context.serverStates["source-a"].watchReadiness).toBe("armed");
        expect(beside.scope.snapshot().phase).toBe("failed");
        expect(beside.ftpCalls()).toEqual([["remote-only"]]);
        beside.heal();
        await beside.save([beside.local, beside.ftp("remote-only", "fixture.invalid")]);
        expect(beside.scope.snapshot().applied).toBe(true);
        expect(beside.scope.snapshot().error).toBeNull();
        expect(beside.ftpCalls()).toEqual([["remote-only"], ["remote-only"]]);
        expect(beside.warmups()).toBe(1);
    });
});
