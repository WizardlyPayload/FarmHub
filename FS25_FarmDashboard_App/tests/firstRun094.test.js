/**
 * @jest-environment node
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { encodeEnvelope } = require("../exportEnvelope");
const exportIngress = require("../exportIngress");
const ux = require("../uxContract.cjs");
const { resolveLuaExportStaleMs } = require("../liveExportFreshness");
const { productionFunctions, productionTs } = require("./helpers/production-source.cjs");

const APP_ROOT = path.resolve(__dirname, "../..");

function tempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-first-run-"));
}

function listTree(dir) {
    const out = [];
    const walk = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isSymbolicLink()) out.push(full + " -> link");
            else if (entry.isDirectory()) { out.push(full + path.sep); walk(full); }
            else out.push(full + " " + fs.statSync(full).size);
        }
    };
    walk(dir);
    return out.sort();
}

function career(dir, body) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "careerSavegame.xml"), body);
}

function careerXml(name, map) {
    return `<?xml version="1.0" encoding="utf-8" standalone="no"?>\n<careerSavegame revision="2" valid="true"><settings><savegameName>${name}</savegameName><mapTitle>${map}</mapTitle></settings></careerSavegame>`;
}

function writeAuthority(dir, careerId, payload, slotName) {
    fs.mkdirSync(path.join(dir, careerId), { recursive: true });
    fs.writeFileSync(path.join(dir, careerId, "slot-a.xml"), encodeEnvelope(JSON.stringify(payload), {
        careerId,
        sessionId: "session-a",
        publicationSequence: 1,
        exportGeneration: 1,
        simulationTimeMs: 10,
    }));
    fs.writeFileSync(path.join(dir, "active.xml"), `<farmDashboardRoute schema="1" careerId="${careerId}" sessionId="session-a" publicationSequence="1" slot="a" persistence="saved" sourceSlot="${slotName}"/>`);
}

function trackedFs(mutations) {
    const writes = ["writeFile", "appendFile", "rename", "unlink", "rm", "mkdir", "copyFile", "symlink"];
    return new Proxy(fs, {
        get(target, prop, receiver) {
            if (prop === "promises") {
                return new Proxy(target.promises, {
                    get(promiseTarget, promiseProp) {
                        const value = promiseTarget[promiseProp];
                        if (typeof value !== "function") return value;
                        if (writes.includes(String(promiseProp))) {
                            return (...args) => { mutations.push(String(promiseProp)); return value.apply(promiseTarget, args); };
                        }
                        return value.bind(promiseTarget);
                    },
                });
            }
            const value = Reflect.get(target, prop, receiver);
            if (typeof value !== "function") return value;
            if (writes.some((name) => String(prop) === name + "Sync")) {
                return (...args) => { mutations.push(String(prop)); return value.apply(target, args); };
            }
            return value.bind(target);
        },
    });
}

function scanner({ profiles, dashRoots, defaultProfile, fsImpl, reads }) {
    return productionFunctions("FS25_FarmDashboard_App/main.js", [
        "sameResolvedDirectory",
        "looksLikeSaveSlotId",
        "profileRootForDashboard",
        "discoveryLabel",
        "scanLocalSaves",
    ], {
        fs: fsImpl,
        exportIngress,
        ingressOrchestration: require("../ingressOrchestration"),
        replicaRegistration: require("../replicaRegistration"),
        getFs25DocumentsRoot: () => defaultProfile,
        getElectronDocumentsPath: () => null,
        collectFs25DocumentRoots: () => profiles,
        collectFarmDashboardModSettingsRoots: () => dashRoots,
        pathExists: async (file) => {
            try {
                await fs.promises.access(file);
                return true;
            } catch (error) {
                if (error && error.code === "ENOENT") return false;
                throw error;
            }
        },
        readFileUtf8WithRetryAsync: async (file) => {
            reads.push(path.resolve(file));
            return fs.readFileSync(file, "utf8");
        },
    });
}

describe("094 first-run discovery of saved careers with no export yet", () => {
    let root;
    let fixture;

    beforeAll(() => {
        root = tempDir();
        const dash = (profile) => path.join(profile, "modSettings", "FS25_FarmDashboard");
        const fresh = path.join(root, "fresh-profile");
        const noMod = path.join(root, "no-mod-profile");
        const exported = path.join(root, "exported-profile");
        const foreign = path.join(root, "foreign-profile");
        const unreadable = path.join(root, "unreadable-profile");
        fixture = {
            fresh, noMod, exported, foreign, unreadable,
            freshDash: dash(fresh), noModDash: dash(noMod), exportedDash: dash(exported), foreignDash: dash(foreign), unreadableDash: dash(unreadable),
        };

        // Fresh modSettings: the mod folder exists with config only, one empty slot folder, no exports.
        fs.mkdirSync(fixture.freshDash, { recursive: true });
        fs.writeFileSync(path.join(fixture.freshDash, "config.xml"), "<farmDashboard/>");
        career(path.join(fresh, "savegame1"), careerXml("Fresh Farm", "Riverbend Springs"));
        career(path.join(fresh, "savegame8"), careerXml("Second Farm", "Hutan Pantai"));
        fs.mkdirSync(path.join(fixture.freshDash, "savegame8"));
        fs.mkdirSync(path.join(fresh, "savegame2"));
        career(path.join(fresh, "savegame3"), "not xml at all");
        career(path.join(fresh, "savegame4"), "<careerSavegame revision=\"2\"><settings/></careerSavegame>");
        career(path.join(fresh, "savegameBackup"), careerXml("Backup Copy", "Riverbend Springs"));
        career(path.join(fresh, "savegame7"), careerXml("Mirrored Farm", "Riverbend Springs"));
        fs.mkdirSync(path.join(fixture.freshDash, "savegame7"));
        fs.writeFileSync(path.join(fixture.freshDash, "savegame7", "slot-a.xml"), "<not-an-envelope/>");
        fs.writeFileSync(path.join(fixture.freshDash, "savegame7", "selection-a.xml"), "<farmDashboardReplicaSelection/>");
        fs.writeFileSync(path.join(fixture.freshDash, "savegame7", "data.json"), JSON.stringify({ savegameName: "MIRROR-JSON" }));
        fs.mkdirSync(path.join(fresh, "savegame6", "careerSavegame.xml"), { recursive: true });
        const outside = path.join(root, "outside-career");
        career(outside, careerXml("Linked Farm", "Elmcreek"));
        fs.symlinkSync(outside, path.join(fresh, "savegame5"), "junction");
        fs.mkdirSync(path.join(fresh, "savegame9"));
        try {
            fs.symlinkSync(path.join(outside, "careerSavegame.xml"), path.join(fresh, "savegame9", "careerSavegame.xml"), "file");
        } catch (error) {
            // Windows without symlink privilege: a linked career directory above still covers link refusal.
            if (!error || error.code !== "EPERM") throw error;
        }

        // Missing mod folder entirely; same slot name as the fresh profile.
        career(path.join(noMod, "savegame1"), careerXml("Other Profile Farm", "Elmcreek"));

        // A profile that already exports keeps completed sources only.
        career(path.join(exported, "savegame1"), careerXml("Exported Farm", "Elmcreek"));
        career(path.join(exported, "savegame2"), careerXml("Unexported Farm", "Elmcreek"));
        writeAuthority(path.join(fixture.exportedDash, "savegame1"), "career-exported", { savegameName: "Exported Farm", mapTitle: "Elmcreek" }, "savegame1");

        // A dashboard root whose owning profile is not one of the known profile roots.
        career(path.join(foreign, "savegame1"), careerXml("Foreign Farm", "Elmcreek"));
        fs.mkdirSync(fixture.foreignDash, { recursive: true });

        career(path.join(unreadable, "savegame1"), careerXml("Unreadable Root Farm", "Elmcreek"));
        fs.mkdirSync(fixture.unreadableDash, { recursive: true });
    });

    function runScan(extra = {}) {
        const reads = [];
        const mutations = [];
        const api = scanner({
            profiles: [fixture.fresh, fixture.noMod, fixture.exported, fixture.unreadable],
            dashRoots: [fixture.freshDash, fixture.noModDash, fixture.exportedDash, fixture.freshDash, fixture.foreignDash],
            defaultProfile: fixture.fresh,
            fsImpl: trackedFs(mutations),
            reads,
            ...extra,
        });
        return { api, reads, mutations };
    }

    test("a saved career with clean modSettings and no export is discoverable, read-only", async () => {
        const before = listTree(root);
        const { api, reads, mutations } = runScan();
        const scan = await api.scanLocalSaves();
        const pending = scan.saves.filter((row) => row.awaitingFirstExport === true);
        expect(pending.map((row) => [row.localPath, row.localSubFolder, row.name])).toEqual([
            [fixture.freshDash, "savegame1", "Fresh Farm — Riverbend Springs"],
            [fixture.freshDash, "savegame8", "Second Farm — Hutan Pantai"],
            [fixture.noModDash, "savegame1", "Other Profile Farm — Elmcreek"],
        ]);
        const key = (dir) => path.normalize(dir).replace(/[\\/]+/g, "/").replace(/\/+$/g, "").toLowerCase();
        expect(pending[0].sourceKey).toBe(`local:${key(fixture.freshDash)}:savegame1`);
        expect(pending[2].sourceKey).toBe(`local:${key(fixture.noModDash)}:savegame1`);
        expect(pending[0].sourceKey).not.toBe(pending[2].sourceKey);
        for (const row of pending) {
            expect(row.mode).toBe("local");
            expect(row).not.toHaveProperty("careerId");
            expect(row).not.toHaveProperty("sessionId");
            expect(row).not.toHaveProperty("exportGeneration");
            expect(row.replicaRemoteSlot).toBeUndefined();
            expect(row.legacyJson).toBeUndefined();
        }
        expect(scan.missingRoots).toEqual([fixture.noModDash]);
        expect(mutations).toEqual([]);
        expect(listTree(root)).toEqual(before);
        expect(reads.every((file) => file.endsWith("careerSavegame.xml"))).toBe(true);
    });

    test("empty, malformed, linked, mirrored, cross-profile and repeated sources stay out", async () => {
        const { api } = runScan();
        const scan = await api.scanLocalSaves();
        const names = scan.saves.map((row) => row.savegameName);
        for (const refused of ["Backup Copy", "Mirrored Farm", "MIRROR-JSON", "Linked Farm", "Foreign Farm", "Unexported Farm"]) {
            expect(names).not.toContain(refused);
        }
        const freshSlots = scan.saves.filter((row) => row.localPath === fixture.freshDash).map((row) => row.localSubFolder);
        expect(freshSlots).toEqual(["savegame1", "savegame8"]);
        expect(scan.saves.filter((row) => row.localPath === fixture.foreignDash)).toEqual([]);
    });

    test("completed exports keep precedence and import exactly as before", async () => {
        const { api } = runScan();
        const scan = await api.scanLocalSaves();
        const exported = scan.saves.filter((row) => row.localPath === fixture.exportedDash);
        expect(exported).toHaveLength(1);
        expect(exported[0].localSubFolder).toBe("savegame1");
        expect(exported[0].savegameName).toBe("Exported Farm");
        expect(exported[0]).not.toHaveProperty("awaitingFirstExport");

        const { importDiscoveredSaves } = productionTs("NEW APP/src/lib/discovered-save.ts");
        const setupConfigMerge = require("../setupConfigMerge.cjs");
        const imported = importDiscoveredSaves([], scan.saves, { defaultDashboardRoot: scan.defaultDashboardRoot });
        expect(imported.added).toHaveLength(4);
        expect(imported.awaitingFirstExport).toHaveLength(3);
        for (const row of imported.added) expect(row).not.toHaveProperty("awaitingFirstExport");
        const completedRow = imported.added.find((row) => row.localPath === fixture.exportedDash);
        expect(imported.awaitingFirstExport).not.toContain(completedRow.id);
        const saved = setupConfigMerge.resolveServersForSave([], imported.added);
        expect(saved.servers.map((row) => row.localSubFolder)).toEqual(imported.added.map((row) => row.localSubFolder));
        const again = importDiscoveredSaves(saved.servers, scan.saves, { defaultDashboardRoot: scan.defaultDashboardRoot });
        expect(again.added).toEqual([]);
        expect(again.allDetected).toBe(true);
        expect(again.awaitingFirstExport).toEqual([]);
    });

    test("an unreadable dashboard root fails closed without hiding other profiles", async () => {
        const denied = new Proxy(fs, {
            get(target, prop, receiver) {
                if (prop === "promises") {
                    return new Proxy(target.promises, {
                        get(promiseTarget, promiseProp) {
                            if (promiseProp === "readdir") {
                                return async (dir, opts) => {
                                    if (path.resolve(String(dir)) === path.resolve(fixture.unreadableDash)) {
                                        const error = new Error("denied");
                                        error.code = "EACCES";
                                        throw error;
                                    }
                                    return promiseTarget.readdir(dir, opts);
                                };
                            }
                            const value = promiseTarget[promiseProp];
                            return typeof value === "function" ? value.bind(promiseTarget) : value;
                        },
                    });
                }
                const value = Reflect.get(target, prop, receiver);
                return typeof value === "function" ? value.bind(target) : value;
            },
        });
        const { api } = runScan({ fsImpl: denied, dashRoots: [fixture.unreadableDash, fixture.noModDash] });
        const scan = await api.scanLocalSaves();
        expect(scan.saves.filter((row) => row.localPath === fixture.unreadableDash)).toEqual([]);
        expect(scan.saves.filter((row) => row.localPath === fixture.noModDash).map((row) => row.savegameName)).toEqual(["Other Profile Farm"]);
    });
});

describe("094 saved local source waits for its first export", () => {
    function statusApi(memory, serverStates, httpListening = true) {
        const uxEventLog = ux.createUxEventLog();
        const api = productionFunctions("FS25_FarmDashboard_App/main.js", [
            "pushUxEvent",
            "statusSourceSelection",
            "getLuaExportStaleMs",
            "buildRuntimeSetupStatus",
            "runSetupHandshake",
        ], {
            store: { get: (key) => memory[key] },
            serverStates,
            uxEventLog,
            uxRequiresRestart: false,
            server: { listening: httpListening },
            ERROR_CODES: ux.ERROR_CODES,
            selectStatusSource: ux.selectStatusSource,
            sourceSetupEvidence: ux.sourceSetupEvidence,
            buildSetupStatus: ux.buildSetupStatus,
            resolveLuaExportStaleMs,
            getFtpPollingOptions: () => ({ intervalMinutes: 5 }),
            getLanSecurityFromStore: () => ({}),
            getLocalLuaJsonPathForServer: (srv) => path.join(os.tmpdir(), "farmdash-094-absent-" + process.pid, String(srv.localSubFolder), "data.json"),
            fs,
            console: { log() {}, warn() {}, error() {} },
        });
        return { api, uxEventLog };
    }

    const localConfig = {
        isConfigured: true,
        servers: [{ id: "srv_1", name: "Fresh Farm", mode: "local", localPath: "C:/x/modSettings/FS25_FarmDashboard", localSubFolder: "savegame1" }],
    };

    test("selected live mirror status does not inherit first save's missing-export guidance", () => {
        const now = Date.now();
        const config = {
            ...localConfig,
            servers: [
                ...localConfig.servers,
                { id: "mp-live", name: "Witcombe", mode: "local", localPath: "C:/x/modSettings/FS25_FarmDashboard/replicas/mp-live", localSubFolder: "savegame1" },
            ],
        };
        const states = {
            srv_1: { active: true },
            "mp-live": {
                active: true,
                mergedData: { fields: [{ id: 1 }], vehicles: [], luaAvailable: true, exportGeneration: 4 },
                lastLuaReceivedAt: new Date(now).toISOString(),
            },
        };
        const { api } = statusApi({ config, simHubLiveContext: { serverId: "srv_1" } }, states);
        expect(api.buildRuntimeSetupStatus({ setupTokenValid: true }).waitingFor).toBe("first-export");
        const selected = api.buildRuntimeSetupStatus({ setupTokenValid: true, sourceId: "mp-live" });
        expect(selected.sourceId).toBe("mp-live");
        expect(selected.status).toBe("ready");
        expect(selected.nextStep).toBeNull();
        const unknown = api.buildRuntimeSetupStatus({ setupTokenValid: true, sourceId: "unknown" });
        expect(unknown.sourceId).toBe("unknown");
        expect(unknown.status).not.toBe("ready");
    });

    test("valid saved config with no generation reports waiting, not a network error", async () => {
        const { api, uxEventLog } = statusApi({ config: localConfig }, { srv_1: { active: true } });
        const status = api.buildRuntimeSetupStatus({ setupTokenValid: true });
        expect(status.status).toBe("incomplete");
        expect(status.lastErrorCode).toBe("E_LUA_STALE");
        expect(status.waitingFor).toBe("first-export");
        expect(status.nextAction).toBe("start_game");
        expect(status.nextStep).toContain("no dashboard export yet");
        const handshake = await api.runSetupHandshake(true);
        expect(handshake.waitingFor).toBe("first-export");
        const codes = uxEventLog.list().map((row) => row.code);
        expect(codes).not.toContain("E_NETWORK");
        expect(codes).toContain("E_LUA_STALE");
    });

    test("a successful save does not record a network event and drops pre-save events", () => {
        const uxEventLog = ux.createUxEventLog();
        uxEventLog.push({ code: "E_CONFIG_INCOMPLETE", message: "No servers", source: "setup" });
        const { setupSaveOutcome } = productionFunctions("FS25_FarmDashboard_App/main.js", ["setupSaveOutcome"], { uxEventLog });
        expect(setupSaveOutcome({ appliedDeferred: false })).toEqual({ ok: true, saveState: "saved", appliedDeferred: false });
        expect(uxEventLog.list()).toEqual([]);
        uxEventLog.push({ code: "E_IDENTITY_RECOVERY", message: "kept", source: "setup" });
        expect(setupSaveOutcome({ recoveryPending: true }).saveState).toBe("saved-with-recovery-pending");
        expect(uxEventLog.list()).toHaveLength(1);
        expect(setupSaveOutcome({ ok: false, error: "recovery-required" })).toEqual({ ok: false, error: "recovery-required", recoveryPending: true });
        const source = fs.readFileSync(path.join(APP_ROOT, "FS25_FarmDashboard_App/main.js"), "utf8");
        expect(source).not.toMatch(/E_NETWORK,\s*'Setup config saved'/);
    });

    test("genuine failures stay actionable and are not relabelled as waiting", async () => {
        const offline = statusApi({ config: localConfig }, { srv_1: { active: true } }, false).api.buildRuntimeSetupStatus({ setupTokenValid: true });
        expect(offline.lastErrorCode).toBe("E_SERVER_OFFLINE");
        expect(offline.status).toBe("degraded");
        expect(offline.waitingFor).toBeUndefined();

        const token = statusApi({ config: localConfig }, { srv_1: { active: true } }).api.buildRuntimeSetupStatus({ setupTokenValid: false });
        expect(token.lastErrorCode).toBe("E_INVALID_TOKEN");
        expect(token.nextAction).toBe("reset_token");
        expect(token.waitingFor).toBeUndefined();

        const ftpConfig = { isConfigured: true, servers: [{ id: "ftp_1", mode: "ftp", ftpHost: "files.example", localSubFolder: "savegame1" }] };
        const ftp = statusApi({ config: ftpConfig }, { ftp_1: { active: true } }).api.buildRuntimeSetupStatus({ setupTokenValid: true });
        expect(ftp.lastErrorCode).toBe("E_LUA_STALE");
        expect(ftp.waitingFor).toBeUndefined();
        expect(ftp.nextStep).toBeNull();

        const provisioning = statusApi({ config: localConfig }, { srv_1: { active: true, identityProvision: "provisioning-required" } }).api.buildRuntimeSetupStatus({ setupTokenValid: true });
        expect(provisioning.lastErrorCode).toBe("E_PROVISION_REQUIRED");
        expect(provisioning.waitingFor).toBeUndefined();

        const empty = statusApi({ config: { servers: [] } }, {}).api.buildRuntimeSetupStatus({ setupTokenValid: true });
        expect(empty.lastErrorCode).toBe("E_CONFIG_INCOMPLETE");
        expect(empty.waitingFor).toBeUndefined();

        const live = statusApi({ config: localConfig }, {
            srv_1: { active: true, lastLuaReceivedAt: new Date().toISOString(), mergedData: { exportGeneration: 4, fields: [{ id: 1 }], vehicles: [] } },
        }).api.buildRuntimeSetupStatus({ setupTokenValid: true });
        expect(live.status).toBe("ready");
        expect(live.waitingFor).toBeUndefined();

        const offlineHandshake = statusApi({ config: localConfig }, { srv_1: { active: true } }, false);
        await offlineHandshake.api.runSetupHandshake(true);
        expect(offlineHandshake.uxEventLog.list().map((row) => row.code)).toContain("E_SERVER_OFFLINE");
    });
});
