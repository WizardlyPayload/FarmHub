"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { encodeEnvelope } = require("../exportEnvelope");
const exportIngress = require("../exportIngress");
const localIngress = require("../localIngressController");
const ingressOrchestration = require("../ingressOrchestration");
const { mergeData } = require("../dataMerger");
const { isExplicitReplicaXmlSource } = require("../xmlCollector");
const mergedSnapshotHold = require("../mergedSnapshotHold");
const { resolveLuaExportStaleMs, isLuaExportStale } = require("../liveExportFreshness");
const ux = require("../uxContract.cjs");
const { productionFunctions } = require("./helpers/production-source.cjs");

function routeXml(fields) {
    const body = Object.entries(fields).map(([name, value]) => `${name}="${value}"`).join(" ");
    return `<farmDashboardRoute ${body}/>`;
}

function writeGeneration(dir, generation, payload, careerId, slotName) {
    fs.mkdirSync(path.join(dir, careerId), { recursive: true });
    fs.writeFileSync(path.join(dir, careerId, "slot-a.xml"), encodeEnvelope(JSON.stringify(payload), {
        careerId,
        sessionId: "session-a",
        publicationSequence: generation,
        exportGeneration: generation,
        simulationTimeMs: 10,
    }));
    fs.writeFileSync(path.join(dir, "active.xml"), routeXml({
        schema: "1",
        careerId,
        sessionId: "session-a",
        publicationSequence: String(generation),
        slot: "a",
        persistence: "saved",
        sourceSlot: slotName,
    }));
}

function settle() {
    return new Promise((resolve) => setImmediate(resolve));
}

describe("source orchestration chain", () => {
    test("registered replica never reads a colliding local save slot", () => {
        const basePath = path.join(os.tmpdir(), "farmdash-replica-precedence");
        const paired = {
            id: "mp-live",
            localSubFolder: "savegame1",
            replicaRegistration: { remoteSlot: "savegame1", sessionPairing: "test-key" },
        };
        const local = { id: "local-save", localSubFolder: "savegame1" };
        const parts = { basePath, folderName: "savegame1" };
        const targets = localIngress.resolveTargets(paired, parts);
        const authority = targets.authorityXml;
        const replica = path.join(targets.replicaDir, "selection-b.xml");
        const withReplica = (filePath) => filePath === authority || filePath === replica;

        const selected = localIngress.selectIngress(paired, parts, withReplica);
        expect(selected.kind).toBe("replica");
        expect(selected.dir).toBe(targets.replicaDir);
        expect(selected.configuredSlot).toBe("savegame1");

        const withoutReplica = localIngress.selectIngress(paired, parts, (filePath) => filePath === authority);
        expect(withoutReplica.kind).toBe("none");
        expect(withoutReplica.dir).toBeNull();
        expect(withoutReplica.reason).toBe("replica-unavailable");

        expect(localIngress.selectIngress(local, parts, withReplica).kind).toBe("authority");
    });

    test("actual ingest, apply, and status stay on the selected source", async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-orchestration-"));
        const dash = path.join(root, "modSettings", "FS25_FarmDashboard");
        const slotA = path.join(dash, "savegame1");
        const slotB = path.join(dash, "savegame2");
        const calls = { rebuild: 0, broadcast: 0, persist: 0, hydrate: 0, warns: [] };
        const serverStates = {};
        const config = {
            isConfigured: true,
            servers: [
                { id: "source-a", mode: "local", enabled: true, localPath: dash, localSubFolder: "savegame1" },
                { id: "source-b", mode: "local", enabled: true, localPath: dash, localSubFolder: "savegame2" },
            ],
        };
        const memory = { config, simHubLiveContext: { serverId: "source-b" } };
        const store = { get: (key) => memory[key] };
        const api = productionFunctions("FS25_FarmDashboard_App/main.js", [
            "stripUtf8Bom",
            "parseLuaJsonObject",
            "processLuaData",
            "clearUnprovenReplicaXml",
            "rebuildMerged",
            "getServersFromStore",
            "getLuaExportStaleMs",
            "stampLuaExportFreshness",
            "outlineMemoKeyFromMerged",
            "mapFillResultForMerged",
            "mapFillCatalogForMerged",
            "mapFillTitlesForMerged",
            "statusSourceSelection",
            "buildPublicStatusPayload",
            "buildRuntimeSetupStatus",
        ], {
            serverStates,
            boundSources: { snapshot: () => null },
            store,
            SESSION_USER_DATA_DIR: root,
            mergeData,
            isExplicitReplicaXmlSource,
            exportIngress,
            ingressOrchestration,
            selectStatusSource: ux.selectStatusSource,
            sourceSetupEvidence: ux.sourceSetupEvidence,
            buildSetupStatus: ux.buildSetupStatus,
            publicStatusForSource: ux.publicStatusForSource,
            ERROR_CODES: ux.ERROR_CODES,
            shouldIgnoreMinimalLuaExport: mergedSnapshotHold.shouldIgnoreMinimalLuaExport,
            liftSectionOutcomes: mergedSnapshotHold.liftSectionOutcomes,
            buildHeldPayloadFromState: mergedSnapshotHold.buildHeldPayloadFromState,
            applyFreshnessMeta: ux.applyFreshnessMeta,
            console: {
                log: console.log.bind(console),
                error: console.error.bind(console),
                warn: (...args) => {
                    calls.warns.push(args.map((part) => String(part)).join(" "));
                    console.warn(...args);
                },
            },
            applyLiveSectionHold: mergedSnapshotHold.applyLiveSectionHold,
            applyMergedSnapshotIfStaleExport: mergedSnapshotHold.applyMergedSnapshotIfStaleExport,
            updateLiveSectionBackup: mergedSnapshotHold.updateLiveSectionBackup,
            updateLastGoodMergedSnapshot: mergedSnapshotHold.updateLastGoodMergedSnapshot,
            resolveLuaExportStaleMs,
            isLuaExportStale,
            getFtpPollingOptions: () => ({ intervalMinutes: 5 }),
            isLocalModeServer: (srv) => !srv || srv.mode !== "ftp",
            hydrateLuaDataAnimalsFromDetailsAsync: async (data) => {
                calls.hydrate += 1;
                return data;
            },
            getLocalLuaJsonPathForServer: () => null,
            app: { getPath: () => root, getVersion: () => "5.0.0.14" },
            buildFieldLiveFingerprints: () => ({}),
            appendFieldHistory: (history) => history || {},
            safeFsIdentity: { sanitizeSaveSlot: (value, fallback) => value || fallback },
            triggerXmlPoll: () => {},
            broadcast: () => { calls.broadcast += 1; },
            schedulePersistServerCache: () => { calls.persist += 1; },
            pushUxEvent: () => {},
            warmupMapFieldOutlines: () => {},
            warmupMapFillTypes: () => {},
            hydrateServerCacheFromDisk: () => {},
            supplementRedTapeCropRotation: (merged) => merged,
            getVanillaFillTypeCatalog: () => ({}),
            mapFillTypeMemo: new Map(),
            vanillaFillTypeHudEpoch: 0,
            getLanSecurityFromStore: () => ({}),
            uxRequiresRestart: false,
            uxEventLog: { list: () => [] },
            editionPolicy: { isV5ProductLine: () => true },
            PRODUCT_LINE: "v5",
            PORT: 8780,
            server: { listening: true },
        });

        serverStates["source-a"] = { active: true };
        serverStates["source-b"] = { active: true };
        writeGeneration(slotA, 1, {
            savegameName: "FARM-A",
            mapTitle: "MAP-A",
            serverInfo: { mapName: "MAP-A" },
            fields: [{ id: 1, hectares: 1 }],
            vehicles: [],
        }, "career-a", "savegame1");
        const first = exportIngress.ingestWatchedSlot(slotA, { sourceId: "source-a", configuredSlot: "savegame1" });
        expect(first.status).toBe("valid");
        expect(first.identity.exportGeneration).toBe(1);
        const selectedA = localIngress.selectIngress(config.servers[0], { basePath: dash, folderName: "savegame1" }, fs.existsSync);
        expect(selectedA.kind).toBe("authority");
        expect(localIngress.applyWatchedIngress(serverStates["source-a"], config.servers[0], first, api.processLuaData)).toBe(true);
        await settle();
        await settle();

        writeGeneration(slotA, 2, {
            savegameName: "FARM-A",
            mapTitle: "MAP-A",
            serverInfo: { mapName: "MAP-A" },
            fields: [{ id: 1, hectares: 2 }, { id: 2, hectares: 1 }],
            vehicles: [],
        }, "career-a", "savegame1");
        const second = exportIngress.ingestWatchedSlot(slotA, {
            sourceId: "source-a",
            configuredSlot: "savegame1",
            previous: serverStates["source-a"].exportIngress,
        });
        expect(second.identity.exportGeneration).toBe(2);
        expect(localIngress.applyWatchedIngress(serverStates["source-a"], config.servers[0], second, api.processLuaData)).toBe(true);
        await settle();
        await settle();
        expect(serverStates["source-a"].exportIdentity.exportGeneration).toBe(2);
        expect(serverStates["source-a"].exportIdentity.careerId).toBe("career-a");
        expect(calls.hydrate).toBeGreaterThan(0);
        expect(calls.broadcast).toBeGreaterThan(0);
        memory.simHubLiveContext = { serverId: "source-a" };
        expect(api.buildPublicStatusPayload().mapTitle).toBe("MAP-A");
        api.processLuaData("source-a", JSON.stringify({ savegameName: "STALE", mapTitle: "STALE", fields: [], vehicles: [] }), second.identity);
        await settle();
        expect(api.buildPublicStatusPayload().mapTitle).toBe("MAP-A");
        memory.simHubLiveContext = { serverId: "source-b" };

        writeGeneration(slotB, 1, {
            savegameName: "FARM-B",
            mapTitle: "MAP-B",
            serverInfo: { mapName: "MAP-B" },
            fields: [],
            vehicles: [],
        }, "career-b", "savegame2");
        const empty = exportIngress.ingestWatchedSlot(slotB, { sourceId: "source-b", configuredSlot: "savegame2" });
        expect(empty.status).toBe("valid");
        expect(empty.identity.exportGeneration).toBe(1);
        expect(localIngress.applyWatchedIngress(serverStates["source-b"], config.servers[1], empty, api.processLuaData)).toBe(true);
        await settle();
        await settle();
        const evidence = ux.sourceSetupEvidence(serverStates["source-b"], { nowMs: Date.now(), staleMs: 600000 });
        const setupB = api.buildRuntimeSetupStatus({ setupTokenValid: true });
        expect(setupB.sourceId).toBe("source-b");
        expect(evidence.hasMergedData).toBe(true);
        const publicB = api.buildPublicStatusPayload();
        expect(publicB.mapTitle).toBe("MAP-B");
        expect(publicB.careerId).toBe("career-b");
        expect(publicB.savegameName).toBeUndefined();
        expect(publicB.nextStep).toBeUndefined();
        expect(publicB.localPath).toBeUndefined();

        serverStates["source-a"].active = false;
        memory.simHubLiveContext = { serverId: "source-a" };
        const stopped = api.buildPublicStatusPayload();
        expect(stopped.mapTitle).toBeUndefined();
        expect(stopped.careerId).toBeUndefined();

        const broken = path.join(dash, "savegame6");
        fs.mkdirSync(broken, { recursive: true });
        fs.writeFileSync(path.join(broken, "active.xml"), "<farmDashboardRoute");
        fs.writeFileSync(path.join(broken, "data.json"), JSON.stringify({ savegameName: "OLD-JSON", mapTitle: "OLD-MAP" }));
        const refused = exportIngress.ingestWatchedSlot(broken, { sourceId: "savegame6", configuredSlot: "savegame6" });
        expect(refused.payload).toBeNull();
        serverStates["source-c"] = { active: true };
        expect(localIngress.applyWatchedIngress(serverStates["source-c"], { id: "source-c" }, refused, api.processLuaData)).toBe(false);
        expect(serverStates["source-c"].mergedData).toBeUndefined();

        memory.simHubLiveContext = { serverId: "source-b" };
        serverStates["source-b"].identityProvision = "provisioning-required";
        const provision = api.buildRuntimeSetupStatus({ setupTokenValid: true });
        expect(provision.sourceId).toBe("source-b");
        expect(provision.lastErrorCode).toBe("E_PROVISION_REQUIRED");
        expect(provision.nextStep).toContain("Automatic FTP creation is not available");
        const tokenFirst = api.buildRuntimeSetupStatus({ setupTokenValid: false });
        expect(tokenFirst.lastErrorCode).toBe(ux.ERROR_CODES.E_INVALID_TOKEN);
        expect(tokenFirst.nextStep).toBeNull();
    });
});
