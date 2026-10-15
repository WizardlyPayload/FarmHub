/** @jest-environment jsdom */
"use strict";

const { productionTs } = require("./helpers/production-source.cjs");

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

const binding = (bindingId = "binding-one", stateRevision = 1, stateStatus = "snapshot", exportIdentity = {
    careerId: "career-one", sessionId: "session-one", publicationSequence: 1, exportGeneration: 1,
}) => ({ bindingId, stateRevision, stateStatus, publishedAt: "2026-10-09T00:00:00.000Z", exportIdentity });
const server = (id = "only", bindingId = "binding-one", revision = 1, status = "snapshot") => ({
    id, name: id, mode: "local", localSubFolder: "slot1", sourceBinding: binding(bindingId, revision, status),
});
const payload = (mapTitle, confidence, revision = 1, bindingId = "binding-one", status = "snapshot", identity) => ({
    dataSource: "lua_only", mapTitle,
    dataTimestamps: confidence ? { confidence } : {},
    sourceBinding: binding(bindingId, revision, status, identity),
});

async function flush() {
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

let harness;
beforeEach(() => { localStorage.clear(); });
afterEach(() => {
    harness?.realtime.stopRealtime();
    harness?.restore();
    harness = null;
    localStorage.clear();
});

function createHarness(options = {}) {
    const originalWebSocket = global.WebSocket;
    const sockets = [];
    class FakeWebSocket {
        static OPEN = 1;
        readyState = 0;
        handlers = {};
        constructor() { sockets.push(this); }
        addEventListener(kind, handler) { this.handlers[kind] = handler; }
        emit(kind, event = {}) { this.handlers[kind]?.(event); }
        open() { this.readyState = 1; this.emit("open"); }
        close() { this.readyState = 3; }
        sendData(serverId, data, timestamp = data.mapTitle) {
            this.emit("message", { data: JSON.stringify({ type: "data", serverId, timestamp, sourceBinding: data.sourceBinding, data }) });
        }
        sourceState(serverId, sourceBinding, removed = false) {
            this.emit("message", { data: JSON.stringify({ type: "source-state", serverId, sourceBinding, removed }) });
        }
    }
    global.WebSocket = FakeWebSocket;
    let serverList = options.servers || [server()];
    let dashboardResponder = options.dashboardResponder || (async () => payload("initial"));
    let tokenResponder = options.tokenResponder || (async () => "token");
    let serverResponder = options.serverResponder || (() => Promise.resolve(serverList));
    const fetchDashboardData = jest.fn((id) => dashboardResponder(id));
    const fetchLanWsToken = jest.fn(() => tokenResponder());
    const fetchServers = jest.fn(() => serverResponder());
    const state = {
        servers: [], activeServerId: null, activeFarmId: null, payload: null,
        connection: "connecting", lastUpdated: null,
        setServers(next) { this.servers = next; },
        setActiveServerId(id) {
            this.activeServerId = id;
            if (id) localStorage.setItem("farmdash_active_server_v1", id);
        },
        setActiveFarmId(id) { this.activeFarmId = id; },
        setPayload(next) { this.payload = next; },
        setConnection(next) { this.connection = next; },
    };
    const useDashboardStore = Object.assign(() => state, {
        getState: () => state,
        setState: (patch) => Object.assign(state, patch),
    });
    const realtime = productionTs("NEW APP/src/services/ws-client.ts", {
        "@/store/dashboard-store": {
            useDashboardStore,
            applyPayloadToStore: (next) => { state.setPayload(next); state.setConnection("ws"); },
            readStoredFarmId: () => null,
            writeStoredServerId: (id) => localStorage.setItem("farmdash_active_server_v1", id),
            writeStoredFarmId: () => {},
        },
        "@/services/api-client": {
            fetchDashboardData, fetchLanWsToken, fetchServers, wsUrl: () => "ws://local/ws",
        },
        "@/lib/farm-scope": {
            getPlayerFarmRecords: () => [], isMultiFarmEnabled: () => false, resolveActiveFarmId: () => 1,
        },
        "@/platform/notifications": { setNotificationScope: () => {} },
        "@/platform/urgent-alerts": { buildAlertScopeKey: () => "scope", resolveSaveIdFromPayload: () => null },
        "@/platform/demo-source": { demoWritesAreLocked: () => false },
    });
    harness = {
        realtime, state, sockets, fetchDashboardData, fetchLanWsToken, fetchServers,
        setDashboardResponder: (next) => { dashboardResponder = next; },
        setTokenResponder: (next) => { tokenResponder = next; },
        setServerResponder: (next) => { serverResponder = next; },
        setServerList: (next) => { serverList = next; },
        restore: () => { global.WebSocket = originalWebSocket; },
    };
    return harness;
}

test("later same-source WS delivery supersedes an in-flight HTTP response", async () => {
    const h = createHarness();
    await h.realtime.bootstrapRealtime();
    h.sockets[0].open();
    const slow = deferred();
    h.setDashboardResponder(() => slow.promise);
    const refresh = h.realtime.refreshDashboard();
    h.sockets[0].sendData("only", payload("new WS", undefined, 2));
    slow.resolve(payload("old HTTP", undefined, 1));
    await refresh;
    expect(h.state.payload.mapTitle).toBe("new WS");
    expect(h.state.connection).toBe("ws");
});

test("saved Witcombe waits through Riverbend-only list and selects Witcombe when it appears", async () => {
    localStorage.setItem("farmdash_active_server_v1", "witcombe");
    const h = createHarness({
        servers: [server("riverbend", "riverbend-binding")],
        dashboardResponder: async (id) => payload(id, undefined, 1, `${id}-binding`),
    });
    await h.realtime.bootstrapRealtime();
    expect(h.state.activeServerId).toBeNull();
    expect(h.state.payload).toBeNull();
    expect(h.fetchDashboardData).not.toHaveBeenCalled();
    expect(localStorage.getItem("farmdash_active_server_v1")).toBe("witcombe");
    h.sockets[0].sendData("riverbend", payload("wrong Riverbend WS", undefined, 2, "riverbend-binding"));
    expect(h.state.payload).toBeNull();

    h.setServerList([server("riverbend", "riverbend-binding"), server("witcombe", "witcombe-binding")]);
    await h.realtime.reloadServersFromApi();
    expect(h.state.activeServerId).toBe("witcombe");
    expect(h.state.payload.mapTitle).toBe("witcombe");
    expect(h.fetchDashboardData.mock.calls.map(([id]) => id)).toEqual(["witcombe"]);
    expect(localStorage.getItem("farmdash_active_server_v1")).toBe("witcombe");
});

test("later HTTP request wins when same-source responses complete in reverse order", async () => {
    const h = createHarness();
    await h.realtime.bootstrapRealtime();
    const older = deferred();
    const newer = deferred();
    let calls = 0;
    h.setDashboardResponder(() => (++calls === 1 ? older : newer).promise);
    const first = h.realtime.refreshDashboard();
    const second = h.realtime.refreshDashboard();
    newer.resolve(payload("new HTTP", undefined, 3));
    await second;
    older.resolve(payload("old HTTP", undefined, 2));
    await first;
    expect(h.state.payload.mapTitle).toBe("new HTTP");
});

test("equal commit is ignored and newer held revision for the same export is accepted", async () => {
    const h = createHarness();
    await h.realtime.bootstrapRealtime();
    h.sockets[0].sendData("only", payload("commit", "live", 2));
    h.sockets[0].sendData("only", payload("equal duplicate", "live", 2));
    expect(h.state.payload.mapTitle).toBe("commit");
    h.sockets[0].sendData("only", payload("held", "live", 3, "binding-one", "held"), "held-publication");
    expect(h.state.payload.dataTimestamps.confidence).toBe("held");
    expect(h.state.payload.dataTimestamps.isStale).toBe(true);
    h.setDashboardResponder(async () => payload("equal HTTP", "live", 3));
    await h.realtime.refreshDashboard();
    expect(h.state.payload.mapTitle).toBe("held");
    expect(h.state.payload.dataTimestamps.confidence).toBe("held");
});

test("open window reconciles a missed live publication after the same source starts a new session", async () => {
    jest.useFakeTimers();
    let h;
    try {
        h = createHarness();
        await h.realtime.bootstrapRealtime();
        h.sockets[0].open();
        const { resolveNavbarConnectionBadge } = productionTs("NEW APP/src/lib/connection-badge.ts");
        const lastLuaReceivedAt = new Date().toISOString();
        const freshness = { lastLuaReceivedAt, luaExportStaleMs: 345000 };
        h.sockets[0].sendData("only", {
            ...payload("held before restart", "held", 2, "binding-one", "held"),
            luaAvailable: true,
            xmlAvailable: false,
            dataTimestamps: freshness,
        });
        expect(resolveNavbarConnectionBadge({ ...h.state.payload, nowMs: Date.now() }).kind).toBe("snap");

        const nextIdentity = {
            careerId: "career-one", sessionId: "new-session", publicationSequence: 3, exportGeneration: 7,
        };
        const nextBinding = binding("binding-one", 3, "snapshot", nextIdentity);
        h.setServerList([{ ...server(), sourceBinding: nextBinding }]);
        h.setDashboardResponder(async () => ({
            ...payload("live after restart", "live", 3, "binding-one", "snapshot", nextIdentity),
            luaAvailable: true,
            xmlAvailable: false,
            dataTimestamps: freshness,
        }));
        // No live WS message: the still-open socket must recover through HTTP.
        jest.advanceTimersByTime(30000);
        await flush();
        expect(h.state.payload.mapTitle).toBe("live after restart");
        expect(h.state.payload.sourceBinding.exportIdentity.sessionId).toBe("new-session");
        expect(resolveNavbarConnectionBadge({ ...h.state.payload, nowMs: Date.now() }).kind).toBe("live");
    } finally {
        h?.realtime.stopRealtime();
        jest.useRealTimers();
    }
});

test("stop during bootstrap server-list await prevents all later store and socket effects", async () => {
    const servers = deferred();
    const h = createHarness({ serverResponder: () => servers.promise });
    const ready = jest.fn();
    const boot = h.realtime.bootstrapRealtime(ready);
    h.realtime.stopRealtime();
    servers.resolve([server()]);
    await boot;
    expect(h.state.servers).toEqual([]);
    expect(h.state.payload).toBeNull();
    expect(h.sockets).toHaveLength(0);
    expect(h.state.connection).toBe("connecting");
    expect(ready).not.toHaveBeenCalled();
});

test("stop during bootstrap dashboard await prevents payload, token and socket effects", async () => {
    const data = deferred();
    const h = createHarness({ dashboardResponder: () => data.promise });
    const ready = jest.fn();
    const boot = h.realtime.bootstrapRealtime(ready);
    await flush();
    expect(h.fetchDashboardData).toHaveBeenCalledTimes(1);
    h.realtime.stopRealtime();
    data.resolve(payload("late HTTP"));
    await boot;
    expect(h.state.payload).toBeNull();
    expect(h.fetchLanWsToken).not.toHaveBeenCalled();
    expect(h.sockets).toHaveLength(0);
    expect(h.state.connection).toBe("connecting");
    expect(ready).not.toHaveBeenCalled();
});

test("stop during token await prevents socket construction and onReady", async () => {
    const token = deferred();
    const h = createHarness({ tokenResponder: () => token.promise });
    const ready = jest.fn();
    const boot = h.realtime.bootstrapRealtime(ready);
    await flush();
    expect(h.fetchLanWsToken).toHaveBeenCalledTimes(1);
    h.realtime.stopRealtime();
    token.resolve("late-token");
    await boot;
    expect(h.sockets).toHaveLength(0);
    expect(h.state.connection).toBe("connecting");
    expect(ready).not.toHaveBeenCalled();
});

test("stop rejects pending refresh and late socket callbacks without false active connection", async () => {
    const h = createHarness();
    await h.realtime.bootstrapRealtime();
    const socket = h.sockets[0];
    socket.open();
    const slow = deferred();
    h.setDashboardResponder(() => slow.promise);
    const refresh = h.realtime.refreshDashboard();
    h.realtime.stopRealtime();
    socket.sendData("only", payload("late WS"));
    socket.emit("open");
    socket.emit("close");
    slow.resolve(payload("late HTTP"));
    await refresh;
    expect(h.state.payload.mapTitle).toBe("initial");
    expect(h.state.connection).toBe("connecting");
    expect(h.sockets).toHaveLength(1);
});

test("same-ID Settings and API rebinds clear held payload and reject old-socket delivery", async () => {
    const h = createHarness();
    await h.realtime.bootstrapRealtime();
    const originalSocket = h.sockets[0];
    const changedDraft = deferred();
    h.setDashboardResponder(() => changedDraft.promise);
    h.realtime.applyServersFromSettingsDraft([{ id: "only", name: "Only", mode: "local", localSubFolder: "slot2" }]);
    expect(h.state.payload).toBeNull();
    expect(h.state.connection).toBe("connecting");
    originalSocket.sendData("only", payload("old binding", undefined, 2));
    expect(h.state.payload).toBeNull();
    h.setServerList([server("only", "binding-two")]);
    const draftReload = h.realtime.reloadServersFromApi();
    await flush();
    changedDraft.resolve(payload("new binding", undefined, 1, "binding-two"));
    await draftReload;
    expect(h.state.payload.mapTitle).toBe("new binding");

    const changedApi = deferred();
    h.setDashboardResponder(() => changedApi.promise);
    h.setServerList([server("only", "binding-three")]);
    const reload = h.realtime.reloadServersFromApi();
    await flush();
    expect(h.state.payload).toBeNull();
    changedApi.resolve(payload("API binding", undefined, 1, "binding-three"));
    await reload;
    expect(h.state.payload.mapTitle).toBe("API binding");
});

test("HTTP on binding B wins; WS and late HTTP from binding A cannot retag it", async () => {
    const slow = deferred();
    const h = createHarness({ dashboardResponder: async () => payload("A", undefined, 1, "binding-one") });
    await h.realtime.bootstrapRealtime();
    h.sockets[0].open();
    h.setDashboardResponder(() => slow.promise);
    const oldRefresh = h.realtime.refreshDashboard();
    h.setServerList([server("only", "binding-two")]);
    h.setDashboardResponder(async () => payload("B", undefined, 1, "binding-two"));
    await h.realtime.reloadServersFromApi();
    expect(h.state.payload.mapTitle).toBe("B");
    const currentSocket = h.sockets.at(-1);
    expect(currentSocket).not.toBe(h.sockets[0]);
    currentSocket.open();
    currentSocket.sendData("only", payload("B WS", undefined, 2, "binding-two"));
    expect(h.state.payload.mapTitle).toBe("B WS");
    h.sockets[0].sendData("only", payload("late WS A", undefined, 9, "binding-one"));
    expect(h.state.payload.mapTitle).toBe("B WS");
    slow.resolve(payload("late HTTP A", undefined, 9, "binding-one"));
    await oldRefresh;
    expect(h.state.payload.mapTitle).toBe("B WS");
});

test("older server-list request cannot replace a newer Settings draft", async () => {
    const oldList = deferred();
    const h = createHarness();
    await h.realtime.bootstrapRealtime();
    h.setServerResponder(() => oldList.promise);
    const reload = h.realtime.reloadServersFromApi();
    h.realtime.applyServersFromSettingsDraft([{ id: "draft", name: "Draft", mode: "local" }]);
    oldList.resolve([server("only")]);
    await reload;
    expect(h.state.servers.map((row) => row.id)).toEqual(["draft"]);
    expect(h.state.payload).toBeNull();
});

test("source-state pending clears snapshot and removal refetches list", async () => {
    const h = createHarness();
    await h.realtime.bootstrapRealtime();
    const oldSocket = h.sockets[0];
    oldSocket.sourceState("only", binding("binding-one", 2, "pending", null));
    expect(h.state.payload).toBeNull();
    oldSocket.sendData("only", payload("old", undefined, 1));
    expect(h.state.payload).toBeNull();
    const oldHttp = deferred();
    h.setDashboardResponder(() => oldHttp.promise);
    const oldRefresh = h.realtime.refreshDashboard();
    h.setServerList([]);
    oldSocket.sourceState("only", binding("binding-one", 3, "blocked", null), true);
    await flush();
    oldSocket.sendData("only", payload("late old WS", undefined, 4));
    oldHttp.resolve(payload("late old HTTP", undefined, 5));
    await oldRefresh;
    await flush();
    expect(h.state.servers).toEqual([]);
    expect(h.state.payload).toBeNull();
    expect(h.state.activeServerId).toBeNull();
});

test("interleaved sources and missing contract fail closed; publication time alone never makes Live", async () => {
    const h = createHarness({ servers: [server("a"), server("b", "binding-two")] });
    await h.realtime.bootstrapRealtime();
    expect(h.state.activeServerId).toBeNull();
    await h.realtime.switchActiveServer("a");
    const oldSocket = h.sockets[0];
    const oldHttp = deferred();
    h.setDashboardResponder(() => oldHttp.promise);
    const oldRefresh = h.realtime.refreshDashboard();
    h.setDashboardResponder(async () => payload("B HTTP", undefined, 1, "binding-two"));
    await h.realtime.switchActiveServer("b", true);
    expect(h.state.payload.mapTitle).toBe("B HTTP");
    const currentSocket = h.sockets.at(-1);
    expect(currentSocket).not.toBe(oldSocket);
    currentSocket.open();
    oldSocket.sendData("a", payload("late A WS", undefined, 5));
    oldHttp.resolve(payload("late A HTTP", undefined, 5));
    await oldRefresh;
    expect(h.state.payload.mapTitle).toBe("B HTTP");
    currentSocket.sendData("a", payload("other source A", undefined, 6));
    expect(h.state.payload.mapTitle).toBe("B HTTP");
    currentSocket.sendData("b", payload("B", undefined, 2, "binding-two", "snapshot", null));
    expect(h.state.payload.mapTitle).toBe("B");
    expect(h.state.payload.dataTimestamps.isStale).toBe(true);
    currentSocket.sendData("b", { dataSource: "lua_only", luaAvailable: true, mapTitle: "unconfirmed", dataTimestamps: { lastLuaReceivedAt: new Date().toISOString() } });
    expect(h.state.payload).toBeNull();
});

test("approved link keeps the shared realtime lifecycle and rejects late old-source publications", async () => {
    localStorage.setItem("farmdash_active_server_v1", "montana");
    const h = createHarness({
        servers: [server("montana", "binding-montana")],
        dashboardResponder: async (id) => payload(`${id} initial`, undefined, 1, `binding-${id}`),
    });
    await h.realtime.bootstrapRealtime();
    expect(h.state.activeServerId).toBe("montana");
    const socket = h.sockets[0];
    const oldHttp = deferred();
    h.setDashboardResponder((id) => id === "montana" ? oldHttp.promise
        : Promise.resolve(payload("Witcombe initial", undefined, 1, "binding-witcombe")));
    const oldRefresh = h.realtime.refreshDashboard();
    h.setServerList([server("montana", "binding-montana"), server("witcombe", "binding-witcombe")]);
    const intent = h.realtime.captureSourceSelectionIntent();
    expect(await h.realtime.selectApprovedLinkedSource("witcombe", intent)).toBe(true);
    expect(h.state.activeServerId).toBe("witcombe");
    expect(h.state.payload.mapTitle).toBe("Witcombe initial");
    expect(h.state.connection).toBe("http");
    expect(h.sockets).toHaveLength(1);

    oldHttp.resolve(payload("late Montana HTTP", undefined, 2, "binding-montana"));
    await oldRefresh;
    socket.sendData("montana", payload("late Montana WS", undefined, 3, "binding-montana"));
    expect(h.state.payload.mapTitle).toBe("Witcombe initial");

    socket.open();
    socket.sendData("witcombe", payload("Witcombe WS", undefined, 2, "binding-witcombe"));
    expect(h.state.payload.mapTitle).toBe("Witcombe WS");
    expect(h.state.connection).toBe("ws");
    h.setDashboardResponder(async () => payload("Witcombe HTTP", undefined, 3, "binding-witcombe"));
    await h.realtime.refreshDashboard();
    expect(h.state.payload.mapTitle).toBe("Witcombe HTTP");
    expect(h.sockets).toHaveLength(1);
});
