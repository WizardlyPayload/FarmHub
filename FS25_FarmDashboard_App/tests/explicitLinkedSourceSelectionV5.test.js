/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
"use strict";

const { h, render } = require("../../NEW APP/node_modules/preact");
const { act } = require("../../NEW APP/node_modules/preact/test-utils");
const { productionTs } = require("./helpers/production-source.cjs");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const binding = (id, revision = 1) => ({
  bindingId: id, stateRevision: revision, stateStatus: "snapshot",
  publishedAt: "2026-10-12T08:00:00.000Z",
  exportIdentity: { careerId: "career", sessionId: "session", publicationSequence: revision, exportGeneration: revision },
});
const server = (id) => ({ id, name: id, sourceBinding: binding(`binding-${id}`) });
const payload = (id) => ({ mapTitle: id, dataSource: "lua_only", sourceBinding: binding(`binding-${id}`) });

function sourceHarness(linkedData) {
  const snapshots = [];
  const state = {
    servers: [server("montana")], activeServerId: "montana", activeFarmId: 1,
    payload: payload("montana"), connection: "ws", lastUpdated: "before",
    setServers(servers) { this.servers = servers; snapshots.push([this.activeServerId, this.payload?.mapTitle]); },
    setActiveServerId(id) { this.activeServerId = id; snapshots.push([this.activeServerId, this.payload?.mapTitle]); },
    setActiveFarmId(id) { this.activeFarmId = id; },
    setPayload(next) { this.payload = next; snapshots.push([this.activeServerId, this.payload?.mapTitle]); },
    setConnection(connection) { this.connection = connection; },
  };
  const useDashboardStore = Object.assign(() => state, {
    getState: () => state,
    setState: (patch) => { Object.assign(state, patch); snapshots.push([state.activeServerId, state.payload?.mapTitle]); },
  });
  const fetchServers = jest.fn(async () => [server("montana"), server("witcombe"), server("riverbend")]);
  const fetchDashboardData = jest.fn((id) => id === "witcombe" ? linkedData.promise : Promise.resolve(payload(id)));
  const realtime = productionTs("NEW APP/src/services/ws-client.ts", {
    "@/store/dashboard-store": {
      useDashboardStore,
      applyPayloadToStore: (next) => state.setPayload(next),
      readStoredFarmId: () => null, writeStoredServerId: (id) => localStorage.setItem("farmdash_active_server_v1", id),
      writeStoredFarmId: () => {},
    },
    "@/services/api-client": { fetchServers, fetchDashboardData, fetchLanWsToken: async () => null, wsUrl: () => "ws://local" },
    "@/lib/farm-scope": { getPlayerFarmRecords: () => [], isMultiFarmEnabled: () => false, resolveActiveFarmId: () => 1 },
    "@/platform/notifications": { setNotificationScope: () => {} },
    "@/platform/urgent-alerts": { buildAlertScopeKey: () => "scope", resolveSaveIdFromPayload: () => null },
    "@/platform/demo-source": { demoWritesAreLocked: () => false },
  });
  return { realtime, state, snapshots, fetchServers, fetchDashboardData };
}

beforeEach(() => localStorage.clear());

test("explicit link keeps Montana visible until Witcombe is bound, then commits source and payload together", async () => {
  const linkedData = deferred();
  const { realtime, state, snapshots, fetchDashboardData } = sourceHarness(linkedData);
  const intent = realtime.captureSourceSelectionIntent();
  const transition = realtime.selectApprovedLinkedSource("witcombe", intent);
  await Promise.resolve();
  await Promise.resolve();
  expect(fetchDashboardData).toHaveBeenCalledWith("witcombe", { retry: false });
  expect(state.activeServerId).toBe("montana");
  expect(state.payload.mapTitle).toBe("montana");
  expect(state.servers.map((row) => row.id)).toContain("witcombe");
  linkedData.resolve(payload("witcombe"));
  expect(await transition).toBe(true);
  expect(state.activeServerId).toBe("witcombe");
  expect(state.payload.mapTitle).toBe("witcombe");
  expect(localStorage.getItem("farmdash_active_server_v1")).toBe("witcombe");
  expect(snapshots).not.toContainEqual(["witcombe", "montana"]);
  expect(snapshots).not.toContainEqual(["witcombe", undefined]);
});

test("a manual source choice while the approved link hydrates is not overwritten", async () => {
  const linkedData = deferred();
  const { realtime, state } = sourceHarness(linkedData);
  const intent = realtime.captureSourceSelectionIntent();
  const transition = realtime.selectApprovedLinkedSource("witcombe", intent);
  await Promise.resolve();
  await Promise.resolve();
  await realtime.switchActiveServer("riverbend");
  linkedData.resolve(payload("witcombe"));
  expect(await transition).toBe(false);
  expect(state.activeServerId).toBe("riverbend");
  expect(state.payload.mapTitle).toBe("riverbend");
});

test("only the explicit successful Link button hands its approved sourceId to selection", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const select = jest.fn(async () => true);
  const capture = jest.fn(() => 42);
  const approvePendingReplicaSession = jest.fn(async () => ({ ok: true, sourceId: "witcombe" }));
  const api = {
    getPendingReplicaSession: async () => ({ state: "pending", session: {
      pendingId: "pending", serverName: "Witcombe", mapTitle: "Witcombe", sourceSlot: "savegame1",
    } }),
    approvePendingReplicaSession,
  };
  class PollController {
    beginPoll() { return 1; }
    isPollCurrent() { return true; }
    acceptNonRecoveryPoll() { return true; }
  }
  const { LinkServerPrompt } = productionTs("NEW APP/src/platform/LinkServerPrompt.tsx", {
    "@/i18n/i18n": { t: (key) => key },
    "@/components/ui": { Button: ({ children, onClick, disabled }) => h("button", { onClick, disabled }, children) },
    "@/lib/use-focus-trap": { useFocusTrap: () => null },
    "@/services/electron-bridge": { getFarmDashApi: () => api },
    "@/platform/ChangesModal": { showToast: jest.fn() },
    "@/platform/link-server-retry": { recoveryOfferView: () => "none", reopenRecoveryOffer: () => null },
    "@/platform/recovery-prompt-controller": { RecoveryPromptController: PollController },
    "@/services/source-selection-intent": { captureSourceSelectionIntent: capture },
    "@/services/ws-client": { selectApprovedLinkedSource: select },
  });
  try {
    act(() => render(h(LinkServerPrompt), container));
    await act(async () => { await Promise.resolve(); });
    expect(select).not.toHaveBeenCalled();
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent === "replicaLink.approve");
    expect(button).toBeTruthy();
    await act(async () => { button.click(); await Promise.resolve(); });
    expect(approvePendingReplicaSession).toHaveBeenCalledWith("pending");
    expect(capture).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith("witcombe", 42);
  } finally {
    act(() => render(null, container));
    container.remove();
  }
});
