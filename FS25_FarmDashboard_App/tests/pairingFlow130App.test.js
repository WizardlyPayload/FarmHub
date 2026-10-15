"use strict";

/**
 * FARMHUB-20261006-PAIRING-FLOW-130, desktop side, from a clean temp profile: the game's pending record is read
 * strictly, approval publishes replicaSources.xml through replicaRegistration, the game binds with exactly what
 * the app wrote, Local scan finds the stored copy, freshness is honest, and the session token never leaves the
 * main process (renderer view, setup-config GET, public status).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const exportIngress = require("../exportIngress");
const { createFreshnessTracker } = require("../exportEnvelope");
const replicaRegistration = require("../replicaRegistration");
const pending = require("../pendingReplicaSession.cjs");
const { mergeServersPreserveSecrets } = require("../setupConfigMerge.cjs");
const { runDedicated, DEDICATED_PRELUDE } = require("./helpers/dedicatedHarness");
const { productionFunctions, productionTs } = require("./helpers/production-source.cjs");

const repoRoot = path.resolve(__dirname, "../..");
const observedConfig = path.join(repoRoot, "Pipeline/runs/FARMHUB-20261006-DEDICATED-CODEX/server-config.xml");
const FALLBACK_CONFIG = `<farmDashboard>
    <settings enabled="true" updateInterval="10000" collectionCycleMs="60000" diagnostics="false" postLoadCollectionGraceSec="45" sliceBudgetMs="4" jsonTopLevelKeysPerFrame="1"/>
    <modules vehicles="true" fields="true" weather="true" economy="true" animals="true" production="true" finance="true"/>
</farmDashboard>`;
const configXml = fs.existsSync(observedConfig) ? fs.readFileSync(observedConfig, "utf8") : FALLBACK_CONFIG;

// Records attribute order of every saved client document so the files can be rendered as the engine writes them.
const CAPTURE = `
local ORDER, OPEN = {}, {}
local create, setS, setI, save = REAL.createXMLFile, REAL.setXMLString, REAL.setXMLInt, REAL.saveXMLFile
REAL.createXMLFile = function(n, p, root) local h = create(n, p, root); OPEN[h] = { path = p, keys = {} }; return h end
REAL.setXMLString = function(h, k, v) if OPEN[h] then table.insert(OPEN[h].keys, k) end; return setS(h, k, v) end
REAL.setXMLInt = function(h, k, v) if OPEN[h] then table.insert(OPEN[h].keys, k) end; return setI(h, k, v) end
REAL.saveXMLFile = function(h) local ok = save(h); if ok and OPEN[h] then ORDER[OPEN[h].path] = OPEN[h].keys end; return ok end
local function q(s) return string.format("%q", tostring(s)) end
local function snapshot(profile, sub)
    local prefix = profile .. "modSettings/FS25_FarmDashboard/"
    local files = {}
    for p, f in pairs(FILES) do
        local rel = string.sub(p, #prefix + 1)
        if string.sub(p, 1, #prefix) == prefix and ORDER[p] and string.sub(rel, 1, #sub) == sub then
            local list = {}
            for _, k in ipairs(ORDER[p]) do
                if f[k] ~= nil then list[#list + 1] = "[" .. q(k) .. "," .. q(f[k]) .. "]" end
            end
            files[#files + 1] = q(rel) .. ":[" .. table.concat(list, ",") .. "]"
        end
    end
    return "{" .. table.concat(files, ",") .. "}"
end
local function gen(f) return tonumber(f and f["farmDashboardExport#exportGeneration"]) or 0 end
local function settle(c) runUntil(function() return not c.M.FarmDashboardExportMirror:hasReceiveWork() end, 300, 16) end
local function hasPending(c) return FILES[c.E.PROFILE .. "modSettings/FS25_FarmDashboard/replicaPending.xml"] ~= nil end
`;

function escapeAttr(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderXml(entries) {
    let root = null;
    const rootAttrs = [];
    const children = new Map();
    for (const [key, value] of entries) {
        const flat = key.match(/^([A-Za-z]+)#([A-Za-z]+)$/);
        const nested = key.match(/^([A-Za-z]+)\.([A-Za-z]+)\((\d+)\)#([A-Za-z]+)$/);
        if (flat) {
            root = flat[1];
            rootAttrs.push(`${flat[2]}="${escapeAttr(value)}"`);
        } else if (nested) {
            root = nested[1];
            const id = `${nested[2]}|${nested[3]}`;
            if (!children.has(id)) children.set(id, { name: nested[2], attrs: [] });
            children.get(id).attrs.push(`${nested[4]}="${escapeAttr(value)}"`);
        } else {
            throw new Error(`unrendered key ${key}`);
        }
    }
    const head = `<?xml version="1.0" encoding="utf-8" standalone="no"?>\n`;
    const open = rootAttrs.length ? `<${root} ${rootAttrs.join(" ")}` : `<${root}`;
    if (children.size === 0) return `${head}${open}/>\n`;
    const body = Array.from(children.values()).map((c) => `    <${c.name} ${c.attrs.join(" ")}/>`).join("\n");
    return `${head}${open}>\n${body}\n</${root}>\n`;
}

function writeSnapshot(dashRoot, files) {
    for (const [rel, entries] of Object.entries(files)) {
        const full = path.join(dashRoot, ...rel.split("/"));
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, renderXml(entries));
    }
}

/** replicaSources.xml as written by the app -> the flat keys the engine's XML reader exposes to the mod. */
function registrationToLua(xmlText) {
    const parsed = replicaRegistration.parseRegistrationDocument(xmlText);
    if (!parsed.ok) throw new Error(parsed.error);
    return "{ " + parsed.rows.map((row, i) => [
        `["farmDashboardReplicaSources.source(${i})#sourceId"] = ${JSON.stringify(row.sourceId)}`,
        `["farmDashboardReplicaSources.source(${i})#remoteSlot"] = ${JSON.stringify(row.remoteSlot)}`,
        `["farmDashboardReplicaSources.source(${i})#serverKey"] = ${JSON.stringify(row.sessionPairing)}`,
    ].join(", ")).join(", ") + " }";
}

function scanApi(dashRoot, profile) {
    return productionFunctions("FS25_FarmDashboard_App/main.js", [
        "sameResolvedDirectory",
        "looksLikeSaveSlotId",
        "profileRootForDashboard",
        "discoveryLabel",
        "scanLocalSaves",
    ], {
        fs,
        ingressOrchestration: require("../ingressOrchestration"),
        replicaRegistration,
        getFs25DocumentsRoot: () => profile,
        exportIngress,
        getElectronDocumentsPath: () => null,
        collectFs25DocumentRoots: () => [profile],
        collectFarmDashboardModSettingsRoots: () => [dashRoot],
        pathExists: async (file) => {
            try {
                await fs.promises.access(file);
                return true;
            } catch (error) {
                if (error && error.code === "ENOENT") return false;
                throw error;
            }
        },
        readFileUtf8WithRetryAsync: async (file) => fs.readFileSync(file, "utf8"),
    });
}

function pendingXml(fields, extra = "") {
    const order = ["schema", "pendingId", "serverKey", "careerId", "sourceSlot", "mapTitle", "serverName", "check"];
    const attrs = order.filter((k) => fields[k] !== undefined).map((k) => `${k}="${escapeAttr(fields[k])}"`).join(" ");
    return `<?xml version="1.0" encoding="utf-8" standalone="no"?>\n<farmDashboardPendingSession ${attrs}${extra}/>\n`;
}

function goodFields(over = {}) {
    const fields = {
        schema: "1",
        pendingId: "0123456789abcdef",
        serverKey: "join-token-1",
        careerId: "fd-1a2b3c4d5e6f7a8b-1",
        sourceSlot: "savegame1",
        mapTitle: "Witcombe",
        serverName: "Wizard's farm",
        ...over,
    };
    fields.check = over.check || pending.pendingCheck(fields);
    return fields;
}

jest.setTimeout(300000);

describe("pending record parsing (130)", () => {
    test("a well-formed record parses; the renderer view has no session token", () => {
        const parsed = pending.parsePendingDocument(pendingXml(goodFields()));
        expect(parsed.ok).toBe(true);
        const view = pending.publicView(parsed.session);
        expect(view).toEqual({
            pendingId: "0123456789abcdef", careerId: "fd-1a2b3c4d5e6f7a8b-1", sourceSlot: "savegame1",
            mapTitle: "Witcombe", serverName: "Wizard's farm",
        });
        expect(JSON.stringify(view)).not.toContain("join-token-1");
    });

    test("malformed, oversized, duplicate, unexpected, missing, path-like and tampered records are refused", () => {
        const base = goodFields();
        const cases = {
            tooLarge: pendingXml(base) + " ".repeat(pending.MAX_BYTES),
            duplicate: pendingXml(base, ` careerId="${base.careerId}"`),
            unexpected: pendingXml(base, ' sourceId="../../escape"'),
            missing: pendingXml({ ...base, serverName: undefined }),
            pathCareer: pendingXml(goodFields({ careerId: "../replicas" })),
            slashSlot: pendingXml(goodFields({ sourceSlot: "a/b" })),
            badToken: pendingXml(goodFields({ serverKey: "tok en" })),
            badPendingId: pendingXml(goodFields({ pendingId: "XYZ" })),
            longLabel: pendingXml(goodFields({ mapTitle: "m".repeat(81) })),
            controlLabel: pendingXml(goodFields({ serverName: "a\u0001b" })),
            schema: pendingXml(goodFields({ schema: "2" })),
            tampered: pendingXml({ ...base, careerId: "fd-ffffffffffffffff-1" }),
            twoRoots: pendingXml(base) + "<farmDashboardPendingSession/>",
            child: pendingXml(base).replace("/>", "><x/></farmDashboardPendingSession>"),
            notXml: "hello",
        };
        const errors = {};
        for (const [name, text] of Object.entries(cases)) {
            const parsed = pending.parsePendingDocument(text);
            expect(parsed.ok).toBe(false);
            errors[name] = parsed.error;
        }
        expect(errors.tooLarge).toBe("too-large");
        expect(errors.duplicate).toBe("duplicate-field");
        expect(errors.unexpected).toBe("unexpected-field");
        expect(errors.missing).toBe("missing-field");
        expect(errors.tampered).toBe("check");
    });

    test("readPendingSession: missing file, a directory in its place and a corrupt file are honest states", async () => {
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-pending-"));
        try {
            expect((await pending.readPendingSession(profile)).state).toBe("none");
            const file = pending.pendingPathFor(profile);
            fs.mkdirSync(file, { recursive: true });
            expect((await pending.readPendingSession(profile)).state).toBe("invalid");
            fs.rmSync(file, { recursive: true });
            fs.writeFileSync(file, "<farmDashboardPendingSession");
            expect(await pending.readPendingSession(profile)).toEqual({ state: "invalid", error: "malformed" });
            fs.writeFileSync(file, pendingXml(goodFields()));
            const read = await pending.readPendingSession(profile);
            expect(read.state).toBe("pending");
            expect(read.session.serverKey).toBe("join-token-1");
            expect((await pending.readPendingSession(null)).state).toBe("unavailable");
        } finally {
            fs.rmSync(profile, { recursive: true, force: true });
        }
    });

    test("approved rows get locally generated source IDs: same career twice never shares a folder; a linked token is refused", () => {
        const profile = path.join(os.tmpdir(), "farmdash-profile-x");
        const a = pending.approvedServerRow(goodFields(), profile, []);
        const b = pending.approvedServerRow(goodFields({ serverKey: "join-token-2" }), profile, [a.row]);
        expect(a.ok && b.ok).toBe(true);
        expect(a.row.id).toMatch(/^mp-[0-9a-f]{12}$/);
        expect(b.row.id).toMatch(/^mp-[0-9a-f]{12}$/);
        expect(a.row.id).not.toBe(b.row.id);
        expect(a.row.id).not.toContain("1a2b3c4d");
        expect(a.row).toMatchObject({
            mode: "local", name: "Wizard's farm", localSubFolder: "savegame1", replicaRemoteSlot: "savegame1",
            localPath: path.join(profile, "modSettings", "FS25_FarmDashboard"),
            replicaRegistration: { remoteSlot: "savegame1", sessionPairing: "join-token-1" },
        });
        expect(pending.approvedServerRow(goodFields(), profile, [a.row])).toEqual({ ok: false, error: "already-linked", sourceId: a.row.id });
    });
});

describe("Lua and JS agree on the pending checksum", () => {
    test("labels with UTF-8 and apostrophes", () => {
        const out = runDedicated({
            configXml,
            vehicles: 0,
            script: `
local P = FarmDashboardReplicaPairing
local f = { schema = "1", pendingId = "0123456789abcdef", serverKey = "join-token-1", careerId = "fd-1a2b3c4d5e6f7a8b-1",
    sourceSlot = "savegame1", mapTitle = P._label("Riverbend Springs \\195\\169t\\195\\169"), serverName = P._label("Wizard's <farm> & co") }
return P.pendingCheck(f) .. "|" .. f.mapTitle .. "|" .. f.serverName
`,
        });
        const [check, mapTitle, serverName] = out.split("|");
        expect(serverName).toBe("Wizard's farm  co");
        const fields = goodFields({ mapTitle, serverName });
        expect(pending.pendingCheck(fields)).toBe(check);
        expect(pending.parsePendingDocument(pendingXml(fields)).ok).toBe(true);
    });
});

describe("end to end from a clean client profile (130)", () => {
    test("join -> pending -> app approval publishes replicaSources.xml -> game binds it -> scan finds it -> freshness", async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-130-"));
        try {
            const profile = path.join(root, "profile");
            const dashRoot = path.join(profile, "modSettings", "FS25_FarmDashboard");
            fs.mkdirSync(dashRoot, { recursive: true });

            // Phase 1: the game joins and only writes the pending record.
            const first = JSON.parse(runDedicated({
                configXml,
                vehicles: 8,
                script: DEDICATED_PRELUDE + CAPTURE + `
bootLikeServerLog()
runUntil(function() return commitsLogged() >= 1 end, 200, 100)
local c = joinClient("clientA", nil)
runUntil(function() return hasPending(c) end, 200, 100)
return "{" .. q("pending") .. ":" .. snapshot(c.E.PROFILE, "replicaPending.xml") .. "," .. q("replicas") .. ":" .. snapshot(c.E.PROFILE, "replicas/") .. "}"
`,
            }));
            expect(Object.keys(first.replicas)).toEqual([]);
            writeSnapshot(dashRoot, first.pending);
            expect(fs.readdirSync(dashRoot)).toEqual(["replicaPending.xml"]);

            const read = await pending.readPendingSession(profile);
            expect(read.state).toBe("pending");
            expect(read.session.serverKey).toBe("join-clientA");

            // The app's approval path: build row, validate, publish through the journal, commit.
            const built = pending.approvedServerRow(read.session, profile, []);
            expect(built.ok).toBe(true);
            const servers = [built.row];
            expect(replicaRegistration.validateSnapshot(servers).ok).toBe(true);
            const published = replicaRegistration.publishReplicaRegistration(profile, servers);
            expect(published.ok).toBe(true);
            expect(replicaRegistration.commitRegistrationPublication(published).ok).toBe(true);
            const registrationText = fs.readFileSync(path.join(dashRoot, "replicaSources.xml"), "utf8");
            const sourceId = built.row.id;

            // Phase 2: same join; the published file appears while the client waits, and it binds in-session.
            const second = JSON.parse(runDedicated({
                configXml,
                vehicles: 8,
                script: DEDICATED_PRELUDE + CAPTURE + `
bootLikeServerLog()
runUntil(function() return commitsLogged() >= 1 end, 200, 100)
local c = joinClient("clientA", nil)
runUntil(function() return hasPending(c) end, 200, 100)
local published = ${registrationToLua(registrationText)}
FILES[c.E.PROFILE .. "modSettings/FS25_FarmDashboard/replicaSources.xml"] = published
runUntil(function() return replicaOf(c, ${JSON.stringify(sourceId)}) ~= nil end, 300, 100)
settle(c)
local g1 = gen(replicaOf(c, ${JSON.stringify(sourceId)}))
local s1 = snapshot(c.E.PROFILE, "replicas/")
runUntil(function() return gen(replicaOf(c, ${JSON.stringify(sourceId)})) > g1 end, 400, 100)
settle(c)
local s2 = snapshot(c.E.PROFILE, "replicas/")
return "{" .. q("g1") .. ":" .. g1 .. "," .. q("pendingLeft") .. ":" .. tostring(hasPending(c)) .. "," .. q("s1") .. ":" .. s1 .. "," .. q("s2") .. ":" .. s2 .. "}"
`,
            }));
            expect(second.g1).toBeGreaterThanOrEqual(1);
            expect(second.pendingLeft).toBe(false);
            expect(Object.keys(second.s1)).toContain(`replicas/${sourceId}/selected.xml`);
            fs.rmSync(pending.pendingPathFor(profile));
            writeSnapshot(dashRoot, second.s1);

            const scan = await scanApi(dashRoot, profile).scanLocalSaves();
            const rows = scan.saves.filter((row) => row.id === sourceId);
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({ mode: "local", localPath: dashRoot, replicaRemoteSlot: "savegame1", localSubFolder: "savegame1" });
            expect(rows[0].bindingStatus).toBeUndefined();

            // Auto-Detect after approval does not add a second copy of the linked server.
            const { importDiscoveredSaves, discoveryContextFromScan } = productionTs("NEW APP/src/lib/discovered-save.ts");
            const imported = importDiscoveredSaves(servers, scan.saves, discoveryContextFromScan(scan));
            expect(imported.added.map((s) => s.id)).not.toContain(sourceId);

            let clock = 1000;
            const tracker = createFreshnessTracker({ now: () => clock, staleAfterMs: 60000 });
            const dir = path.join(dashRoot, "replicas", sourceId);
            const read1 = exportIngress.ingestWatchedSlot(dir, { sourceId, tracker });
            expect(read1.status).toBe("replica");
            expect(read1.identity.sourceId).toBe(sourceId);
            expect(read1.freshness).toBe("unconfirmed");
            writeSnapshot(dashRoot, second.s2);
            clock += 10000;
            const read2 = exportIngress.ingestWatchedSlot(dir, { sourceId, tracker, previous: read1 });
            expect(read2.identity.exportGeneration).toBeGreaterThan(read1.identity.exportGeneration);
            expect(read2.freshness).toBe("live");
            clock += 61000;
            const read3 = exportIngress.ingestWatchedSlot(dir, { sourceId, tracker, previous: read2 });
            expect(read3.status).toBe("replica");
            expect(read3.freshness).toBe("stale");
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("a damaged replicaSources.xml is never overwritten by an approval", () => {
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-130-damaged-"));
        try {
            const dashRoot = path.join(profile, "modSettings", "FS25_FarmDashboard");
            fs.mkdirSync(dashRoot, { recursive: true });
            const file = path.join(dashRoot, "replicaSources.xml");
            fs.writeFileSync(file, "<farmDashboardReplicaSources");
            const built = pending.approvedServerRow(goodFields(), profile, []);
            const published = replicaRegistration.publishReplicaRegistration(profile, [built.row]);
            expect(published.ok).toBe(false);
            expect(fs.readFileSync(file, "utf8")).toBe("<farmDashboardReplicaSources");
        } finally {
            fs.rmSync(profile, { recursive: true, force: true });
        }
    });
});

describe("session token stays out of unauthenticated surfaces (130)", () => {
    const row = {
        id: "mp-0a1b2c3d4e5f", name: "Farm", mode: "local", localPath: "/p", localSubFolder: "savegame1",
        replicaRemoteSlot: "savegame1", replicaRegistration: { remoteSlot: "savegame1", sessionPairing: "secret-join-token" },
    };

    test("setup-config GET redacts the pairing token; a POST of that redacted copy keeps the stored token", () => {
        const { redactConfigSecrets } = productionFunctions("FS25_FarmDashboard_App/main.js", ["redactConfigSecrets"], {});
        const redacted = redactConfigSecrets({ servers: [row] });
        expect(JSON.stringify(redacted)).not.toContain("secret-join-token");
        expect(redacted.servers[0].replicaRegistration).toEqual({ remoteSlot: "savegame1", sessionPairingSet: true });
        const merged = mergeServersPreserveSecrets([row], redacted.servers);
        expect(merged[0].replicaRegistration).toEqual({ remoteSlot: "savegame1", sessionPairing: "secret-join-token" });
        expect(replicaRegistration.validateSnapshot(merged).ok).toBe(true);
        const fresh = mergeServersPreserveSecrets([], redacted.servers);
        expect(fresh[0].replicaRegistration).toEqual({ remoteSlot: "savegame1" });
    });

    test("public server list and demo routes carry no registration or pending data", () => {
        const main = fs.readFileSync(path.join(repoRoot, "FS25_FarmDashboard_App/main.js"), "utf8");
        const projector = main.slice(main.indexOf("function projectConfiguredServerRow"), main.indexOf("function configuredServerList"));
        expect(projector).not.toMatch(/replicaRegistration|sessionPairing/);
        const { DEMO_READ_API_PATHS } = require("../publicDemoHostPolicy.cjs");
        for (const p of DEMO_READ_API_PATHS) expect(p).not.toMatch(/pending|pair|replica|setup/i);
        expect(main).not.toMatch(/expressApp\.(get|post)\([^)]*pending/i);
    });
});
