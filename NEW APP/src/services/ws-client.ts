import type { DashboardPayload, FarmDashServer, WsDataMessage } from "@/types/dashboard";
import {
  applyPayloadToStore,
  readStoredFarmId,
  useDashboardStore,
  writeStoredFarmId,
} from "@/store/dashboard-store";
import { fetchDashboardData, fetchLanWsToken, fetchServers, wsUrl } from "@/services/api-client";
import { getPlayerFarmRecords, isMultiFarmEnabled, resolveActiveFarmId } from "@/lib/farm-scope";
import { setNotificationScope } from "@/platform/notifications";
import { buildAlertScopeKey, resolveSaveIdFromPayload } from "@/platform/urgent-alerts";

type Listener = () => void;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastFingerprint = "";
let started = false;
let ingestGeneration = 0;
let bootstrapPromise: Promise<void> | null = null;

function fingerprint(msg: WsDataMessage): string {
  return `${msg.serverId}:${msg.timestamp}:${msg.data?.lastUpdated ?? ""}`;
}

/** Align notification scope immediately on switch (watcher also syncs on payload). */
function syncNotificationScopeForContext(
  serverId: string | null | undefined,
  farmId: number | null | undefined,
  payload?: DashboardPayload | null,
): void {
  const saveId = resolveSaveIdFromPayload(payload ?? useDashboardStore.getState().payload);
  setNotificationScope(buildAlertScopeKey(serverId, farmId, saveId));
}

/**
 * Keep activeFarmId valid for the payload (MP farm list + localStorage).
 * When the selected farm owns no fields/livestock, infer from ownership counts (legacy apiStorage).
 */
export function syncActiveFarmForPayload(payload: DashboardPayload | null | undefined): void {
  if (!payload || payload.error) return;
  const state = useDashboardStore.getState();
  const farms = getPlayerFarmRecords(payload.farmInfo);
  const serverId = state.activeServerId;
  const mpFarmSwitch = isMultiFarmEnabled(payload.farmInfo);
  const stored = mpFarmSwitch ? readStoredFarmId(serverId) : null;
  const current = Number(state.activeFarmId ?? 0);
  const ids = new Set(
    farms
      .map((f) => Number(f.id ?? f.farmId))
      .filter((id) => Number.isFinite(id) && id > 0)
  );

  let preferred = current > 0 && (ids.size === 0 || ids.has(current)) ? current : 0;
  if (!preferred && stored && (ids.size === 0 || ids.has(stored))) preferred = stored;
  if (!preferred && farms.length > 0) {
    const first = Number(farms[0].id ?? farms[0].farmId);
    if (Number.isFinite(first) && first > 0) preferred = first;
  }
  if (!preferred) preferred = 1;

  const next = resolveActiveFarmId({
    preferred,
    farms: payload.farmInfo,
    fields: payload.fields,
    animals: payload.animals,
    vehicles: payload.vehicles,
  });

  if (state.activeFarmId !== next) {
    state.setActiveFarmId(next);
  }
  if (mpFarmSwitch) {
    writeStoredFarmId(serverId, next);
  }
}

function ingestPayload(payload: DashboardPayload, expectedServerId?: string | null): void {
  const active = useDashboardStore.getState().activeServerId;
  if (expectedServerId && active && String(expectedServerId) !== String(active)) return;
  applyPayloadToStore(payload);
  syncActiveFarmForPayload(payload);
}

function handleMessage(raw: string) {
  let msg: WsDataMessage;
  try {
    msg = JSON.parse(raw) as WsDataMessage;
  } catch {
    return;
  }
  if (msg.type !== "data" || !msg.data) return;
  const active = useDashboardStore.getState().activeServerId;
  if (active && msg.serverId !== active) return;
  const fp = fingerprint(msg);
  if (fp === lastFingerprint) return;
  lastFingerprint = fp;
  ingestPayload(msg.data, msg.serverId);
}

async function pollOnce() {
  const gen = ingestGeneration;
  const serverId = useDashboardStore.getState().activeServerId;
  try {
    const data = await fetchDashboardData(serverId, { retry: false });
    if (gen !== ingestGeneration) return;
    if (serverId && useDashboardStore.getState().activeServerId !== serverId) return;
    ingestPayload(data, serverId);
    useDashboardStore.getState().setConnection("http");
  } catch {
    if (gen !== ingestGeneration) return;
    useDashboardStore.getState().setConnection("error");
  }
}

/** User-triggered refresh (helper panel / stale chip). Uses the shared retry policy once. */
export async function refreshDashboard(): Promise<void> {
  const gen = ingestGeneration;
  const serverId = useDashboardStore.getState().activeServerId;
  try {
    const data = await fetchDashboardData(serverId, { retry: true });
    if (gen !== ingestGeneration) return;
    if (serverId && useDashboardStore.getState().activeServerId !== serverId) return;
    ingestPayload(data, serverId);
    useDashboardStore
      .getState()
      .setConnection(socket?.readyState === WebSocket.OPEN ? "ws" : "http");
  } catch {
    if (gen !== ingestGeneration) return;
    useDashboardStore.getState().setConnection("error");
  }
}

/** Switch server tab and load that save's payload (HTTP); WS continues filtering by activeServerId. */
export async function switchActiveServer(serverId: string): Promise<void> {
  const state = useDashboardStore.getState();
  if (String(state.activeServerId) === String(serverId)) return;
  ingestGeneration += 1;
  const gen = ingestGeneration;
  lastFingerprint = "";
  state.setActiveServerId(String(serverId));
  state.setPayload(null);
  const storedFarm = readStoredFarmId(serverId);
  if (storedFarm) state.setActiveFarmId(storedFarm);
  syncNotificationScopeForContext(serverId, storedFarm ?? state.activeFarmId, null);
  try {
    const data = await fetchDashboardData(serverId, { retry: true });
    if (gen !== ingestGeneration) return;
    if (useDashboardStore.getState().activeServerId !== String(serverId)) return;
    ingestPayload(data, serverId);
    syncNotificationScopeForContext(serverId, useDashboardStore.getState().activeFarmId, data);
    useDashboardStore
      .getState()
      .setConnection(socket?.readyState === WebSocket.OPEN ? "ws" : "http");
  } catch {
    if (gen !== ingestGeneration) return;
    useDashboardStore.getState().setConnection("error");
  }
}

export function switchActiveFarm(farmId: number): void {
  const id = Number(farmId);
  if (!Number.isFinite(id) || id <= 0) return;
  const state = useDashboardStore.getState();
  state.setActiveFarmId(id);
  writeStoredFarmId(state.activeServerId, id);
  syncNotificationScopeForContext(state.activeServerId, id, state.payload);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

/** Push the Settings save list into the top bar immediately (no app restart). */
export function applyServersFromSettingsDraft(
  draft: Array<{ id?: string; name?: string; mode?: string; localSubFolder?: string | null }>,
): void {
  const servers: FarmDashServer[] = (Array.isArray(draft) ? draft : [])
    .filter((row) => row && row.id != null && String(row.id).trim() !== "")
    .map((row) => ({
      id: String(row.id),
      name: String(row.name || row.id),
      mode: row.mode || "local",
      localSubFolder: row.localSubFolder || undefined,
    }));
  const state = useDashboardStore.getState();
  state.setServers(servers);
  const active = state.activeServerId;
  const stillThere = servers.some((srv) => String(srv.id) === String(active));
  if ((!active || !stillThere) && servers.length) {
    void switchActiveServer(String(servers[0].id));
  }
}

/** Re-read /api/servers after Settings persist (retries while the HTTP server reboots). */
export async function reloadServersFromApi(): Promise<FarmDashServer[]> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const servers = await fetchServers();
      const state = useDashboardStore.getState();
      state.setServers(servers);
      const active = state.activeServerId;
      const stillThere = servers.some((srv) => String(srv.id) === String(active));
      if (!stillThere && servers.length) {
        await switchActiveServer(String(servers[0].id));
      }
      return servers;
    } catch (err) {
      lastError = err;
      await sleep(200 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("reload_servers_failed");
}

function startHttpFallback() {
  if (pollTimer) return;
  void pollOnce();
  pollTimer = setInterval(() => void pollOnce(), 8000);
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectWebSocket();
  }, 3000);
}

export async function connectWebSocket() {
  if (socket?.readyState === WebSocket.OPEN) return;
  try {
    socket?.close();
  } catch {
    /* ignore */
  }

  const token = await fetchLanWsToken();
  socket = new WebSocket(wsUrl(token));

  socket.addEventListener("open", () => {
    useDashboardStore.getState().setConnection("ws");
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  });

  socket.addEventListener("message", (ev) => {
    if (typeof ev.data === "string") handleMessage(ev.data);
  });

  socket.addEventListener("close", () => {
    useDashboardStore.getState().setConnection("connecting");
    startHttpFallback();
    scheduleReconnect();
  });

  socket.addEventListener("error", () => {
    socket?.close();
  });
}

export async function bootstrapRealtime(onReady?: Listener) {
  if (started && bootstrapPromise) return bootstrapPromise;
  started = true;
  bootstrapPromise = (async () => {
    try {
      const servers = await fetchServers();
      useDashboardStore.getState().setServers(servers);
      const storedId = useDashboardStore.getState().activeServerId;
      const storedOk =
        !!storedId && servers.some((s) => String(s.id) === String(storedId));
      if (servers.length) {
        const nextId = storedOk ? String(storedId) : String(servers[0].id);
        if (String(useDashboardStore.getState().activeServerId || "") !== nextId) {
          useDashboardStore.getState().setActiveServerId(nextId);
        }
      }

      const serverIdForFetch = useDashboardStore.getState().activeServerId;
      try {
        const data = await fetchDashboardData(serverIdForFetch, { retry: true });
        if (useDashboardStore.getState().activeServerId !== serverIdForFetch) return;
        ingestPayload(data, serverIdForFetch);
      } catch {
        useDashboardStore.getState().setConnection("error");
      }

      await connectWebSocket();
      onReady?.();
    } catch {
      started = false;
      bootstrapPromise = null;
      useDashboardStore.getState().setConnection("error");
      throw new Error("bootstrap_failed");
    }
  })();
  await bootstrapPromise;
}

export function stopRealtime() {
  started = false;
  bootstrapPromise = null;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (pollTimer) clearInterval(pollTimer);
  reconnectTimer = null;
  pollTimer = null;
  try {
    socket?.close();
  } catch {
    /* ignore */
  }
  socket = null;
}
