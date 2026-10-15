"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { encodeEnvelope } = require("../exportEnvelope");
const exportIngress = require("../exportIngress");
const localIngressController = require("../localIngressController");
const ingressOrchestration = require("../ingressOrchestration");
const { createBoundSourcePublication, statusForPayload } = require("../boundSourcePublication.cjs");
const { mergeData, buildFieldLiveFingerprints } = require("../dataMerger");
const { isExplicitReplicaXmlSource } = require("../xmlCollector");
const mergedSnapshotHold = require("../mergedSnapshotHold");
const { resolveLuaExportStaleMs, isLuaExportStale } = require("../liveExportFreshness");
const ux = require("../uxContract.cjs");
const { productionFunctions } = require("./helpers/production-source.cjs");

function writeCommit(dir, sourceSlot, generation, mapTitle, minimal = false) {
    const careerId = "career-first-run";
    fs.mkdirSync(path.join(dir, careerId), { recursive: true });
    const payload = minimal
        ? { savegameName: "MINIMAL", mapTitle, fields: [], vehicles: [] }
        : { exportGeneration: generation, mapTitle,
            serverInfo: { mapName: mapTitle, saveSlot: sourceSlot },
            fields: [{ id: 1, hectares: 1 }], vehicles: [] };
    fs.writeFileSync(path.join(dir, careerId, "slot-a.xml"), encodeEnvelope(JSON.stringify(payload), {
        careerId, sessionId: "session-first-run", publicationSequence: generation,
        exportGeneration: generation, simulationTimeMs: 1000,
    }));
    fs.writeFileSync(path.join(dir, "active.xml"),
        `<farmDashboardRoute schema="1" careerId="${careerId}" sessionId="session-first-run" ` +
        `publicationSequence="${generation}" slot="a" persistence="saved" sourceSlot="${sourceSlot}"/>`);
}

async function until(predicate, message) {
    const deadline = Date.now() + 3000;
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error(message);
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
}

describe("local folder appearing after V5 boot", () => {
    let root;
    let states;
    let api;

    afterEach(() => {
        if (states) for (const state of Object.values(states)) api.disposeLocalWatcherState(state);
        if (root) fs.rmSync(root, { recursive: true, force: true });
    });

    function harness() {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-first-run-"));
        const basePath = path.join(root, "modSettings", "FS25_FarmDashboard");
        const source = { id: "local-one", mode: "local", enabled: true, localPath: basePath, localSubFolder: "savegame1" };
        const config = { isConfigured: true, servers: [source] };
        const memory = { config, simHubLiveContext: { serverId: source.id } };
        const boundSources = createBoundSourcePublication({ sameBinding: (a, b) => JSON.stringify(a) === JSON.stringify(b) });
        let generation = 1;
        states = { [source.id]: {
            active: true, activationGeneration: 1, ingressGeneration: 0, intervals: [],
            configWarning: { code: "localSubFolderMissing", expected: path.join(basePath, "savegame1") },
        } };
        boundSources.beginActivation(config.servers, 1);
        boundSources.attach(source.id, states[source.id], 1);
        boundSources.clearOwned(states[source.id], "blocked");
        const events = [];
        const store = { get: (key) => memory[key] };
        const runtimeActivation = { matches: (token) => token === generation, noteSource: () => {} };
        const broadcast = (id, payload, state) => {
            const published = boundSources.publish(id, state, state.activationGeneration,
                payload, statusForPayload(state, payload));
            if (published?.changed) events.push(published);
        };
        api = productionFunctions("FS25_FarmDashboard_App/main.js", [
            "resolveServerLocalPath", "isLocalModeServer", "resolveLocalWatchParts",
            "clearRecoveredLocalFolderWarning", "releaseWatcherHandles", "disposeLocalWatcherState",
            "startLocalWatching", "getServersFromStore", "stripUtf8Bom", "parseLuaJsonObject",
            "processLuaData", "rebuildMerged", "getLuaExportStaleMs", "stampLuaExportFreshness",
            "statusSourceSelection", "buildPublicStatusPayload", "buildRuntimeSetupStatus",
            "explicitRequestServerId", "requestSourceEligible", "resolveServerIdForRequest", "getDataForServer",
        ], {
            fs, path, serverStates: states, store, boundSources, runtimeActivation,
            exportIngress, localIngressController, ingressOrchestration,
            mergeData, buildFieldLiveFingerprints, isExplicitReplicaXmlSource,
            shouldIgnoreMinimalLuaExport: mergedSnapshotHold.shouldIgnoreMinimalLuaExport,
            liftSectionOutcomes: mergedSnapshotHold.liftSectionOutcomes,
            buildHeldPayloadFromState: mergedSnapshotHold.buildHeldPayloadFromState,
            applyLiveSectionHold: mergedSnapshotHold.applyLiveSectionHold,
            applyMergedSnapshotIfStaleExport: mergedSnapshotHold.applyMergedSnapshotIfStaleExport,
            resolveLuaExportStaleMs, isLuaExportStale,
            applyFreshnessMeta: ux.applyFreshnessMeta,
            pathExists: async (target) => fs.existsSync(target),
            ensureIdentityProposal: () => ({ status: "ready" }),
            broadcast,
            triggerXmlPoll: () => {},
            getFtpPollingOptions: () => ({ intervalMinutes: 5 }),
            getLocalLuaJsonPathForServer: () => null,
            hydrateLuaDataAnimalsFromDetailsAsync: async (data) => data,
            mapFillResultForMerged: () => ({}),
            mapFillCatalogForMerged: () => ({}),
            mapFillTitlesForMerged: () => ({}),
            mapFillTypeMemo: new Map(),
            vanillaFillTypeHudEpoch: 0,
            supplementRedTapeCropRotation: (data) => data,
            getVanillaFillTypeCatalog: () => ({}),
            appendFieldHistory: (history) => history || {},
            safeFsIdentity: { sanitizeSaveSlot: (slot, fallback) => slot || fallback },
            hydrateServerCacheFromDisk: () => {},
            updateLiveSectionBackup: () => {},
            updateLastGoodMergedSnapshot: () => {},
            schedulePersistServerCache: () => {},
            warmupMapFieldOutlines: () => {},
            warmupMapFillTypes: () => {},
            SESSION_USER_DATA_DIR: root,
            livestockDetailModule: {
                dirtyIndexWatchPath: () => null,
                reconcileDirtyWatch: async () => {},
            },
            selectStatusSource: ux.selectStatusSource,
            publicStatusForSource: ux.publicStatusForSource,
            sourceSetupEvidence: ux.sourceSetupEvidence,
            buildSetupStatus: ux.buildSetupStatus,
            editionPolicy: { isV5ProductLine: () => true },
            PRODUCT_LINE: "v5", PORT: 8766, app: { getVersion: () => "5.0.45" },
            server: { listening: true },
            getLuaExportStaleMs: () => 60000,
            getLanSecurityFromStore: () => ({}),
            uxRequiresRestart: false, uxEventLog: { list: () => [] },
            ERROR_CODES: ux.ERROR_CODES,
            setTimeout: (fn, ms) => setTimeout(fn, ms === 5000 ? 30 : ms),
            setInterval, clearInterval,
        });
        return { source, basePath, boundSources, events, setGeneration: (value) => { generation = value; } };
    }

    test("a committed export for the exact slot unblocks API data and status without restart", async () => {
        const { source, basePath, boundSources, events } = harness();
        expect((await api.startLocalWatching(source)).status).toBe("waiting");
        expect(api.buildPublicStatusPayload().hasData).toBe(false);
        expect(boundSources.snapshot(source.id).sourceBinding.stateStatus).toBe("blocked");

        writeCommit(path.join(basePath, "savegame2"), "savegame2", 1, "WRONG SAVE");
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(events).toHaveLength(0);
        expect(states[source.id].configWarning.code).toBe("localSubFolderMissing");

        const slot = path.join(basePath, "savegame1");
        writeCommit(slot, "savegame2", 1, "WRONG ROUTE");
        await until(() => states[source.id].watchReadiness === "armed", "watcher did not arm after folder appeared");
        await new Promise((resolve) => setTimeout(resolve, 450));
        expect(events).toHaveLength(0);
        expect(states[source.id].configWarning.code).toBe("localSubFolderMissing");

        writeCommit(slot, "savegame1", 2, "MINIMAL SAVE", true);
        await until(() => states[source.id].exportIngress?.identity?.exportGeneration === 2,
            "minimal envelope was not ingested");
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(states[source.id].configWarning.code).toBe("localSubFolderMissing");
        expect(boundSources.snapshot(source.id).payload).toBeNull();

        writeCommit(slot, "savegame1", 3, "RIGHT SAVE");
        await until(() => boundSources.snapshot(source.id).sourceBinding.stateStatus === "snapshot", "new commit did not publish");
        expect(states[source.id].configWarning).toBeNull();
        expect(api.buildPublicStatusPayload()).toMatchObject({ mapTitle: "RIGHT SAVE", hasData: true });
        expect(api.buildRuntimeSetupStatus({ setupTokenValid: true }).sourceId).toBe(source.id);
        expect(api.getDataForServer({ query: { serverId: source.id } }).mapTitle).toBe("RIGHT SAVE");
        expect(boundSources.snapshot(source.id).payload.mapTitle).toBe("RIGHT SAVE");
        expect(boundSources.snapshot(source.id).sourceBinding.stateRevision).toBeGreaterThan(2);
    });

    test("superseded activation cannot clear warning or publish an old source", async () => {
        const { source, basePath, boundSources, events, setGeneration } = harness();
        expect((await api.startLocalWatching(source)).status).toBe("waiting");
        const old = states[source.id];
        setGeneration(2);
        states[source.id] = { active: true, activationGeneration: 2, configWarning: { code: "localSubFolderMissing" } };
        boundSources.beginActivation([source], 2);
        boundSources.attach(source.id, states[source.id], 2);
        writeCommit(path.join(basePath, "savegame1"), "savegame1", 1, "OLD ACTIVATION");
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(old.configWarning.code).toBe("localSubFolderMissing");
        expect(events).toHaveLength(0);
        expect(boundSources.snapshot(source.id).payload).toBeNull();
        expect(api.buildPublicStatusPayload().hasData).toBe(false);
    });
});
