"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { encodeEnvelope } = require("../exportEnvelope");
const exportIngress = require("../exportIngress");
const { writeStrictPair } = require("../replicaPairContract.cjs");
const localIngressController = require("../localIngressController");
const { recordIngress } = require("../ingressOrchestration");
const replicaRegistration = require("../replicaRegistration");
const runtimeActivation = require("../runtimeActivation");
const { configNeedsServerReboot } = require("../setupConfigMerge.cjs");
const { createBoundSourcePublication, statusForPayload } = require("../boundSourcePublication.cjs");
const { isLuaExportStale } = require("../liveExportFreshness");
const ux = require("../uxContract.cjs");
const { productionFunctions } = require("./helpers/production-source.cjs");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
const scratch = [];

afterEach(() => {
    for (const root of scratch.splice(0)) {
        if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("farmdash-bound-replica-")) {
            throw new Error("Refusing to remove a non-fixture path");
        }
        fs.rmSync(root, { recursive: true, force: true });
    }
});

function commit(dir, sequence, generation, letter, revision, at, sourceSlot = "savegame3") {
    const envelope = encodeEnvelope(JSON.stringify({ vehicles: [{ id: generation }] }), {
        careerId: "career-a", sessionId: "session-a",
        publicationSequence: sequence, exportGeneration: generation, simulationTimeMs: 10,
    });
    writeStrictPair(dir, envelope, {
        sourceId: "source-a", sourceSlot, connectionEpoch: "1", slot: letter, replicaRevision: revision,
    });
    for (const name of [`slot-${letter}.xml`, `selection-${letter}.xml`]) {
        fs.utimesSync(path.join(dir, name), at, at);
    }
}

function actualBroadcast(boundSources, frames) {
    const start = mainSource.indexOf("function broadcast(");
    const end = mainSource.indexOf("\nfunction ", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return new Function("boundSources", "cloneMergedDataWithFieldExclusions", "lastBroadcastHashByServer",
        "clients", "WebSocket", "statusForPayload", `${mainSource.slice(start, end)}; return broadcast;`)(
        boundSources, (data) => data, {},
        new Set([{ readyState: 1, send: (frame) => frames.push(JSON.parse(frame)) }]),
        { OPEN: 1 }, statusForPayload,
    );
}

function apiData(boundSources) {
    const routes = {};
    const source = mainSource.slice(
        mainSource.indexOf("expressApp.get('/api/data'"),
        mainSource.indexOf("expressApp.get('/api/animals'"),
    );
    new Function("expressApp", "resolveServerIdForRequest", "boundSources", "console", source)(
        { get: (route, handler) => { routes[route] = handler; } },
        () => "source-a", boundSources, console,
    );
    let value;
    routes["/api/data"]({ query: {} }, { json: (result) => { value = result; } });
    return value;
}

async function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-bound-replica-"));
    scratch.push(root);
    const basePath = path.join(root, "modSettings", "FS25_FarmDashboard");
    const replicaDir = path.join(basePath, "replicas", "source-a");
    fs.mkdirSync(replicaDir, { recursive: true });
    const server = {
        id: "source-a", mode: "local", enabled: true,
        localPath: basePath, localSubFolder: "savegame1",
        replicaRegistration: { remoteSlot: "savegame3", sessionPairing: "test-pair" },
    };
    const registration = replicaRegistration.publishReplicaRegistration(root, [server]);
    expect(registration.ok).toBe(true);
    expect(replicaRegistration.commitRegistrationPublication(registration).ok).toBe(true);

    const boundSources = createBoundSourcePublication({
        sameBinding: (before, after) => !configNeedsServerReboot({ servers: [before] }, { servers: [after] }),
    });
    const events = [];
    const context = {
        boundSources,
        broadcastSourceState: (event) => { events.push(event); },
        replicaRegistration,
        runtimeActivation: runtimeActivation.createScope(),
        getFs25DocumentsRoot: () => root,
        stopAllWatchers: async () => {},
        serverStates: {},
        isLocalModeServer: (srv) => srv?.mode === "local",
        resolveLocalWatchParts: (srv) => ({ basePath: srv.localPath, folderName: srv.localSubFolder }),
        path,
        pathExists: async (target) => fs.existsSync(target),
        console,
        hydrateServerCacheFromDisk() {},
        hydrateLuaSnapshotFromDiskAtBoot: async () => {},
        startLocalWatching: async () => ({ status: "armed" }),
        startFtpPollingCoordinator() {},
        startVanillaFillTypeHudWarmup() {},
        shouldLoadDashboardUrl: () => false,
        mainWindow: null,
        setImmediate: () => {},
        server: { listening: true },
        listenFarmdashHttp() {},
        getLanBindAddress: () => "127.0.0.1",
        PORT: 0,
    };
    vm.createContext(context);
    const bootSource = mainSource.slice(
        mainSource.indexOf("async function bootServer("),
        mainSource.indexOf("/** Same persistence + boot as ipcMain save-settings"),
    );
    vm.runInContext(bootSource, context);
    await context.bootServer({ servers: [server] }, { deferHydrate: true });
    const state = context.serverStates[server.id];
    expect(state).toBeDefined();
    expect(state).not.toHaveProperty("serverId");
    expect(state.configWarning).toBeNull();
    expect(boundSources.snapshot(server.id).sourceBinding.stateStatus).toBe("pending");
    expect(fs.existsSync(path.join(basePath, "savegame1"))).toBe(false);

    const frames = [];
    const broadcast = actualBroadcast(boundSources, frames);
    const { stampLuaExportFreshness } = productionFunctions("FS25_FarmDashboard_App/main.js", ["stampLuaExportFreshness"], {
        getLuaExportStaleMs: () => 90000,
        isLuaExportStale,
        applyFreshnessMeta: ux.applyFreshnessMeta,
    });
    const accept = (previous) => {
        const selected = localIngressController.selectIngress(server,
            { basePath, folderName: server.localSubFolder }, fs.existsSync);
        expect(selected.kind).toBe("replica");
        const ingress = exportIngress.ingestWatchedSlot(selected.dir, {
            sourceId: server.id, configuredSlot: selected.configuredSlot,
            previous, tracker: previous?.tracker,
        });
        const applied = localIngressController.applyWatchedIngress(state, server, ingress,
            (_id, raw, transport) => recordIngress(state, JSON.parse(raw), transport));
        return { selected, ingress, applied };
    };
    const publish = () => {
        const payload = stampLuaExportFreshness({
            serverId: server.id, dataSource: "merged", luaAvailable: true, xmlAvailable: false,
            vehicles: state.luaData?.vehicles || [],
            dataTimestamps: { lastLuaReceivedAt: state.lastLuaReceivedAt },
        }, state);
        broadcast(server.id, payload, state);
        return payload;
    };
    return { root, basePath, replicaDir, server, state, boundSources, events, frames, accept, publish };
}

test("real boot and committed replica publish old held data, then a new valid generation becomes live", async () => {
    const f = await fixture();
    commit(f.replicaDir, 161, 30, "a", 1, new Date(Date.now() - 5 * 60 * 1000));
    const old = f.accept();
    expect(old.ingress.status).toBe("replica");
    expect(old.applied).toBe(true);
    const oldPayload = f.publish();
    const oldApi = apiData(f.boundSources);
    expect(oldPayload.dataTimestamps.isStale).toBe(true);
    expect(oldApi.sourceBinding.stateStatus).toBe("held");
    expect(oldApi.sourceBinding.exportIdentity).toMatchObject({ publicationSequence: 161, exportGeneration: 30 });
    expect(oldApi.dataTimestamps.lastLuaReceivedAt).toBe(f.state.lastLuaReceivedAt);
    expect(Date.parse(oldApi.dataTimestamps.lastLuaReceivedAt)).toBeLessThan(Date.now() - 4 * 60 * 1000);
    expect(f.frames[0].sourceBinding).toEqual(oldApi.sourceBinding);
    expect(f.frames[0].data.dataTimestamps.lastLuaReceivedAt).toBe(oldApi.dataTimestamps.lastLuaReceivedAt);

    commit(f.replicaDir, 162, 31, "b", 2, new Date());
    const fresh = f.accept(old.ingress);
    expect(fresh.ingress.status).toBe("replica");
    expect(fresh.ingress.freshness).toBe("live");
    expect(fresh.applied).toBe(true);
    const freshPayload = f.publish();
    const freshApi = apiData(f.boundSources);
    expect(freshPayload.dataTimestamps.isStale).toBe(false);
    expect(freshApi.sourceBinding.stateStatus).toBe("snapshot");
    expect(freshApi.sourceBinding.exportIdentity).toMatchObject({ publicationSequence: 162, exportGeneration: 31 });
    expect(Date.parse(freshApi.dataTimestamps.lastLuaReceivedAt)).toBeGreaterThan(Date.parse(oldApi.dataTimestamps.lastLuaReceivedAt));
    expect(f.frames).toHaveLength(2);
    expect(f.frames[1].sourceBinding).toEqual(freshApi.sourceBinding);
    expect(f.frames[1].data.dataTimestamps.lastLuaReceivedAt).toBe(freshApi.dataTimestamps.lastLuaReceivedAt);
});

test.each(["wrong-slot", "invalid-pair"])("real boot rejects %s replica when authority is missing", async (problem) => {
    const f = await fixture();
    commit(f.replicaDir, 161, 30, "a", 1, new Date(), problem === "wrong-slot" ? "savegame4" : "savegame3");
    if (problem === "invalid-pair") fs.writeFileSync(path.join(f.replicaDir, "slot-a.xml"), "broken-pair");
    const result = f.accept();
    expect(result.applied).toBe(false);
    expect(result.ingress?.payload).toBeNull();
    expect(f.boundSources.snapshot(f.server.id).sourceBinding.stateStatus).toBe("pending");
    expect(apiData(f.boundSources)).toMatchObject({ error: "Waiting for data..." });
    expect(f.frames).toHaveLength(0);
});

test("public status does not expose cached data for a blocked source", async () => {
    const f = await fixture();
    f.state.mergedData = {
        mapTitle: "PRIVATE-BLOCKED-MAP",
        fields: [{ id: 1 }],
        vehicles: [],
        luaAvailable: true,
    };
    f.boundSources.clearOwned(f.state, "blocked");
    const start = mainSource.indexOf("function buildPublicStatusPayload()");
    const end = mainSource.indexOf("expressApp.get('/api/status'", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const status = new Function(
        "statusSourceSelection", "boundSources", "publicStatusForSource",
        "editionPolicy", "PRODUCT_LINE", "PORT", "app", "ingressOrchestration",
        `${mainSource.slice(start, end)}; return buildPublicStatusPayload();`,
    )(
        () => ({ id: f.server.id, state: f.state }), f.boundSources, ux.publicStatusForSource,
        { isV5ProductLine: () => true }, "rf", 8768, { getVersion: () => "test" },
        { projectStatus: () => ({}) },
    );
    expect(status.hasData).toBe(false);
    expect(status.mapTitle).toBeUndefined();
});
