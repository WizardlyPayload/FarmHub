/**
 * @jest-environment jsdom
 */
"use strict";

const { productionTs, preactRuntime } = require("./helpers/production-source.cjs");

const fetchDashboardData = jest.fn();
const fetchLanWsToken = jest.fn();
const state = {
    payload: { dataSource: "recorded-demo" },
    activeServerId: "local",
    connection: "connecting",
    setConnection(next) { state.connection = next; },
};
const useDashboardStore = Object.assign(
    (selector) => (selector ? selector(state) : state),
    { getState: () => state },
);
const demo = productionTs("NEW APP/src/platform/demo-source.ts");
const realtime = productionTs("NEW APP/src/services/ws-client.ts", {
    "@/store/dashboard-store": {
        useDashboardStore,
        applyPayloadToStore() {},
        readStoredFarmId() { return 1; },
        writeStoredFarmId() {},
    },
    "@/services/api-client": {
        fetchDashboardData,
        fetchLanWsToken,
        fetchServers: jest.fn(async () => []),
        wsUrl: () => "ws://127.0.0.1/ws",
    },
    "@/lib/farm-scope": {
        getPlayerFarmRecords: () => [],
        isMultiFarmEnabled: () => false,
        resolveActiveFarmId: () => 1,
    },
    "@/platform/notifications": { setNotificationScope() {} },
    "@/platform/urgent-alerts": {
        buildAlertScopeKey: () => "scope",
        resolveSaveIdFromPayload: () => "save",
    },
    "@/platform/demo-source": demo,
});

describe("recorded demo transport", () => {
    beforeEach(() => {
        fetchDashboardData.mockClear();
        fetchLanWsToken.mockClear();
        demo.setDemoWritesLocked(false);
        state.payload = { dataSource: "recorded-demo" };
    });

    test("a recorded payload does not open the live socket or poll", async () => {
        await realtime.connectWebSocket();
        await realtime.refreshDashboard();
        await realtime.bootstrapRealtime();
        expect(fetchLanWsToken).not.toHaveBeenCalled();
        expect(fetchDashboardData).not.toHaveBeenCalled();
    });

    test("a mounted recorded boot does not reconnect", async () => {
        const { h, render } = preactRuntime().preact;
        const { useEffect } = preactRuntime().hooks;
        function RecordedBoot() {
            useEffect(() => {
                void realtime.bootstrapRealtime();
            }, []);
            return h("p", null, "Recorded demo");
        }
        const host = document.createElement("div");
        document.body.appendChild(host);
        render(h(RecordedBoot, null), host);
        await Promise.resolve();
        await Promise.resolve();
        expect(host.textContent).toContain("Recorded demo");
        expect(fetchLanWsToken).not.toHaveBeenCalled();
        expect(fetchDashboardData).not.toHaveBeenCalled();
        render(null, host);
        host.remove();
    });
});

void preactRuntime;
