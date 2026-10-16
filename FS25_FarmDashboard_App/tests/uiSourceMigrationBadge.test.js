/** @jest-environment jsdom */
"use strict";

const fs = require("fs");
const path = require("path");
const { productionTs } = require("./helpers/production-source.cjs");

const selection = productionTs("NEW APP/src/lib/active-server-selection.ts");
const { resolveNavbarConnectionBadge } = productionTs("NEW APP/src/lib/connection-badge.ts");
const servers = [{ id: "riverbend" }, { id: "witcombe" }];

function storage(values = {}) {
    const data = new Map(Object.entries(values));
    return {
        getItem: (key) => data.has(key) ? data.get(key) : null,
        setItem: (key, value) => data.set(key, String(value)),
    };
}

describe("NEW APP source selection", () => {
    test("valid new key wins over classic and server order", () => {
        const saved = storage({ farmdash_active_server_v1: "witcombe", dashboard_active_server: "riverbend" });
        expect(selection.resolveInitialServerId(servers, saved)).toBe("witcombe");
        expect(selection.resolveInitialServerId([...servers].reverse(), saved)).toBe("witcombe");
        expect(saved.getItem("farmdash_active_server_v1")).toBe("witcombe");
    });

    test("only an absent new key migrates a valid classic key", () => {
        const saved = storage({ dashboard_active_server: "witcombe" });
        expect(selection.resolveInitialServerId(servers, saved)).toBe("witcombe");
        expect(saved.getItem("farmdash_active_server_v1")).toBe("witcombe");
        expect(saved.getItem("dashboard_active_server")).toBe("witcombe");
    });

    test("invalid and removed IDs require choice with multiple sources", () => {
        const invalidNew = storage({ farmdash_active_server_v1: "removed", dashboard_active_server: "witcombe" });
        expect(selection.resolveInitialServerId(servers, invalidNew)).toBeNull();
        expect(invalidNew.getItem("farmdash_active_server_v1")).toBe("removed");
        expect(selection.resolveInitialServerId(servers, storage({ dashboard_active_server: "removed" }))).toBeNull();
        expect(selection.resolveInitialServerId(servers, storage())).toBeNull();
        expect(selection.resolveInitialServerId([{ id: "only" }], storage())).toBe("only");
        expect(selection.resolveInitialServerId([{ id: "only" }], invalidNew)).toBeNull();
        expect(selection.resolveInitialServerId([{ id: "only" }], storage({ dashboard_active_server: "removed" }))).toBeNull();
    });

    test("a temporarily absent saved source stays pending without rewriting its key", () => {
        const saved = storage({ farmdash_active_server_v1: "witcombe" });
        const write = jest.spyOn(saved, "setItem");
        expect(selection.resolveInitialServerId([{ id: "riverbend" }], saved)).toBeNull();
        expect(saved.getItem("farmdash_active_server_v1")).toBe("witcombe");
        expect(write).not.toHaveBeenCalled();
        expect(selection.resolveInitialServerId(servers, saved)).toBe("witcombe");
        expect(write).not.toHaveBeenCalled();

        const classic = storage({ dashboard_active_server: "witcombe" });
        expect(selection.resolveInitialServerId([{ id: "riverbend" }], classic)).toBeNull();
        expect(classic.getItem("farmdash_active_server_v1")).toBeNull();
        expect(selection.resolveInitialServerId(servers, classic)).toBe("witcombe");
        expect(classic.getItem("farmdash_active_server_v1")).toBe("witcombe");
    });

    test("bootstrap leaves multi-source data empty until a manual choice and filters WS by source", async () => {
        localStorage.clear();
        const originalWebSocket = global.WebSocket;
        let socket;
        class FakeWebSocket {
            static OPEN = 1;
            readyState = 1;
            handlers = {};
            constructor() { socket = this; }
            addEventListener(kind, handler) { this.handlers[kind] = handler; }
            sendData(serverId, mapTitle) {
                const row = state.servers.find((server) => server.id === serverId);
                const sourceBinding = row?.sourceBinding && {
                    ...row.sourceBinding,
                    stateRevision: row.sourceBinding.stateRevision + 1,
                };
                if (row && sourceBinding) row.sourceBinding = sourceBinding;
                this.handlers.message({ data: JSON.stringify({ type: "data", serverId, timestamp: mapTitle, sourceBinding, data: { dataSource: "lua_only", mapTitle } }) });
            }
            close() { this.readyState = 3; }
        }
        global.WebSocket = FakeWebSocket;
        const binding = (id, revision = 1) => ({ bindingId: id, stateRevision: revision, stateStatus: "snapshot", publishedAt: "2026-10-09T00:00:00.000Z", exportIdentity: { careerId: "career", sessionId: "session", publicationSequence: revision, exportGeneration: revision } });
        const bound = (rows) => rows.map((row) => ({ ...row, sourceBinding: binding(`binding-${row.id}`) }));
        let currentServers = bound(servers);
        const calls = [];
        const state = {
            servers: [], activeServerId: null, activeFarmId: null,
            payload: { dataSource: "lua_only", mapTitle: "stale Riverbend" }, connection: "connecting",
            setServers(next) { this.servers = next; },
            setActiveServerId(id) { this.activeServerId = id; if (id) localStorage.setItem("farmdash_active_server_v1", id); },
            setActiveFarmId(id) { this.activeFarmId = id; },
            setPayload(payload) { this.payload = payload; },
            setConnection(connection) { this.connection = connection; },
        };
        const useDashboardStore = Object.assign(() => state, {
            getState: () => state,
            setState: (patch) => Object.assign(state, patch),
        });
        const realtime = productionTs("NEW APP/src/services/ws-client.ts", {
            "@/store/dashboard-store": {
                useDashboardStore,
                applyPayloadToStore: (payload) => state.setPayload(payload),
                readStoredFarmId: () => null,
                writeStoredFarmId: () => {},
            },
            "@/services/api-client": {
                fetchDashboardData: async (id) => { calls.push(id); return { dataSource: "lua_only", mapTitle: `HTTP ${id}`, sourceBinding: binding(`binding-${id}`) }; },
                fetchLanWsToken: async () => "token",
                fetchServers: async () => currentServers,
                wsUrl: () => "ws://local/ws",
            },
            "@/lib/farm-scope": {
                getPlayerFarmRecords: () => [], isMultiFarmEnabled: () => false, resolveActiveFarmId: () => 1,
            },
            "@/platform/notifications": { setNotificationScope: () => {} },
            "@/platform/urgent-alerts": { buildAlertScopeKey: () => "scope", resolveSaveIdFromPayload: () => null },
            "@/platform/demo-source": { demoWritesAreLocked: () => false },
        });
        try {
            await realtime.bootstrapRealtime();
            expect(state.activeServerId).toBeNull();
            expect(state.payload).toBeNull();
            expect(calls).toEqual([]);
            socket.sendData("riverbend", "wrong WS");
            expect(state.payload).toBeNull();

            await realtime.switchActiveServer("witcombe");
            expect(state.activeServerId).toBe("witcombe");
            expect(localStorage.getItem("farmdash_active_server_v1")).toBe("witcombe");
            expect(calls).toEqual(["witcombe"]);
            socket.sendData("riverbend", "wrong WS");
            expect(state.payload.mapTitle).toBe("HTTP witcombe");
            socket.sendData("witcombe", "chosen WS");
            expect(state.payload.mapTitle).toBe("chosen WS");

            currentServers = bound([{ id: "riverbend" }, { id: "third" }]);
            await realtime.reloadServersFromApi();
            expect(state.activeServerId).toBeNull();
            expect(state.payload).toBeNull();
            expect(calls).toEqual(["witcombe"]);
            socket.sendData("riverbend", "wrong after removal");
            expect(state.payload).toBeNull();

            currentServers = bound([{ id: "third" }]);
            await realtime.reloadServersFromApi();
            expect(state.activeServerId).toBeNull();
            expect(state.payload).toBeNull();
            expect(localStorage.getItem("farmdash_active_server_v1")).toBe("witcombe");
            expect(calls).toEqual(["witcombe"]);
            await realtime.switchActiveServer("third");
            expect(state.activeServerId).toBe("third");
            expect(localStorage.getItem("farmdash_active_server_v1")).toBe("third");
            expect(calls).toEqual(["witcombe", "third"]);
        } finally {
            realtime.stopRealtime();
            global.WebSocket = originalWebSocket;
            localStorage.clear();
        }
    });
});

describe("badge provenance", () => {
    const nowMs = Date.parse("2026-06-23T12:00:00.000Z");
    const source = {
        dataSource: "lua_only", luaAvailable: false, xmlAvailable: false, nowMs,
        dataTimestamps: { lastLuaReceivedAt: "2026-06-23T11:59:30.000Z", lastXmlReceivedAt: null, isStale: true, confidence: "held" },
    };

    test("held, stale and other non-live Lua-only use truthful localized labels without XML claims", () => {
        const held = resolveNavbarConnectionBadge(source);
        expect(held.kind).toBe("snap");
        expect(held.labelKey).toBe("ux.freshness.held");
        expect(held.titleKey).toBe("ux.freshness.staleHint");
        const stale = resolveNavbarConnectionBadge({ ...source, dataTimestamps: { lastLuaReceivedAt: "2026-06-23T11:58:00.000Z", lastXmlReceivedAt: null } });
        expect(stale.labelKey).toBe("ux.freshness.stale");
        expect(stale.titleKey).toBe("ux.freshness.staleHint");
        const other = resolveNavbarConnectionBadge({ ...source, dataTimestamps: { lastLuaReceivedAt: "2026-06-23T11:59:30.000Z", lastXmlReceivedAt: null } });
        expect(other.labelKey).toBe("ux.state.stale");
        expect(other.titleKey).toBe("ux.freshness.staleHint");
        for (const badge of [held, stale, other]) {
            expect(badge.labelKey).not.toBe("nav.badgeSnapXml");
            expect(badge.labelKey).not.toBe("nav.badgeLiveApi");
            expect(badge.fallbackTitle).not.toMatch(/XML/i);
            expect(badge.fallbackTitle).toMatch(/not a live export/i);
        }
    });

    test("held XML says Held snapshot; non-held XML says Snap XML; fresh Lua-only says Live", () => {
        expect(resolveNavbarConnectionBadge({ ...source, dataSource: "xml_only", xmlAvailable: true }).labelKey).toBe("ux.freshness.held");
        expect(resolveNavbarConnectionBadge({ ...source, dataSource: "xml_only", xmlAvailable: true,
            dataTimestamps: { lastXmlReceivedAt: "2026-06-23T11:59:30.000Z" } }).labelKey).toBe("nav.badgeSnapXml");
        expect(resolveNavbarConnectionBadge({ ...source, dataSource: "merged", xmlAvailable: true }).titleKey).toBe("nav.badgeSnapXmlHeldTitle");
        const fresh = resolveNavbarConnectionBadge({ ...source, luaAvailable: true, dataTimestamps: { lastLuaReceivedAt: "2026-06-23T11:59:30.000Z" } });
        expect(fresh.kind).toBe("live");
        expect(fresh.labelKey).toBe("nav.badgeLiveApi");
    });

    test("English catalog uses only established translated keys and exact truthful wording", () => {
        const file = path.resolve(__dirname, "../web/locales/messages/en.json");
        const en = JSON.parse(fs.readFileSync(file, "utf8"));
        expect(en["nav.dataSource"]).toBe("Data source");
        expect(en["ux.freshness.held"]).toBe("Held snapshot");
        expect(en["ux.freshness.stale"]).toBe("Stale");
        expect(en["ux.state.stale"]).toBe("Showing last known data.");
        expect(en["ux.freshness.staleHint"]).toBe("This is last-known data, not a live export. Refresh after the game or dedicated server is writing again.");
        for (const key of ["nav.chooseSource", "nav.badgeLastSnapshot", "nav.badgeLastSnapshotTitle", "nav.badgeLastSnapshotHeldTitle", "nav.badgeLastSnapshotStaleTitle"]) {
            expect(en).not.toHaveProperty(key);
        }
    });
});
