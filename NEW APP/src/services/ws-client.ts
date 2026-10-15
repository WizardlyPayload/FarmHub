import type { DashboardPayload, FarmDashServer, WsDataMessage } from "@/types/dashboard";
import {
  applyPayloadToStore,
  readStoredFarmId,
  useDashboardStore,
  writeStoredServerId,
  writeStoredFarmId,
} from "@/store/dashboard-store";
import { fetchDashboardData, fetchLanWsToken, fetchServers, wsUrl } from "@/services/api-client";
import { getPlayerFarmRecords, isMultiFarmEnabled, resolveActiveFarmId } from "@/lib/farm-scope";
import { setNotificationScope } from "@/platform/notifications";
import { buildAlertScopeKey, resolveSaveIdFromPayload } from "@/platform/urgent-alerts";
import { demoWritesAreLocked } from "@/platform/demo-source";
import { resolveAvailableServerId, resolveInitialServerId } from "@/lib/active-server-selection";
import {
  captureSourceSelectionIntent as readSourceSelectionIntent,
  invalidateSourceSelectionIntent,
} from "@/services/source-selection-intent";

type Listener = () => void;

type SourceStatus = "pending" | "snapshot" | "held" | "cache" | "blocked";
type SourceBinding = {
  bindingId: string;
  stateRevision: number;
  stateStatus: SourceStatus;
  publishedAt: string;
  exportIdentity: {
    careerId: string;
    sessionId: string;
    publicationSequence: number;
    exportGeneration: number;
  } | null;
};
type BoundServer = FarmDashServer & { sourceBinding?: unknown };
type BoundPayload = DashboardPayload & { sourceBinding?: unknown };
type SourceMessage = WsDataMessage & { sourceBinding?: unknown };

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let started = false;
let ingestGeneration = 0;
let lifecycleEpoch = 0;
let connectAttempt = 0;
let serverListTicket = 0;
let bindingRefetchPending = false;
let acceptedBindingId: string | null = null;
let acceptedRevision = -1;
let requiredRevision = -1;
let bootstrapPromise: Promise<void> | null = null;
let foregroundRefreshHooked = false;
let lastForegroundRefreshAt = 0;

function resetIngestContext(): void {
  ingestGeneration += 1;
  acceptedBindingId = null;
  acceptedRevision = -1;
  requiredRevision = -1;
}

function sourceBinding(value: unknown): SourceBinding | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.bindingId !== "string" || !row.bindingId.trim()
    || !Number.isSafeInteger(row.stateRevision) || Number(row.stateRevision) < 0
    || !["pending", "snapshot", "held", "cache", "blocked"].includes(String(row.stateStatus))
    || typeof row.publishedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(row.publishedAt)
    || Number.isNaN(Date.parse(row.publishedAt))) return null;
  if (row.exportIdentity !== null) {
    if (!row.exportIdentity || typeof row.exportIdentity !== "object" || Array.isArray(row.exportIdentity)) return null;
    const identity = row.exportIdentity as Record<string, unknown>;
    if (typeof identity.careerId !== "string" || !identity.careerId.trim()
      || typeof identity.sessionId !== "string" || !identity.sessionId.trim()
      || !Number.isSafeInteger(identity.publicationSequence) || Number(identity.publicationSequence) < 0
      || !Number.isSafeInteger(identity.exportGeneration) || Number(identity.exportGeneration) < 0) return null;
  }
  return row as SourceBinding;
}

function selectedBinding(serverId: string): SourceBinding | null {
  const matches = useDashboardStore.getState().servers.filter((server) => String(server.id) === serverId);
  return matches.length === 1 ? sourceBinding((matches[0] as BoundServer).sourceBinding) : null;
}

function clearPublishedPayload(): void {
  useDashboardStore.getState().setPayload(null);
  useDashboardStore.getState().setConnection("connecting");
  useDashboardStore.setState({ lastUpdated: null });
}

function refetchBindingList(): void {
  if (bindingRefetchPending) return;
  bindingRefetchPending = true;
  void reloadServersFromApi().catch(() => {
    useDashboardStore.getState().setConnection("error");
  }).finally(() => { bindingRefetchPending = false; });
}

function rejectUnconfirmedBinding(refetch = true): void {
  resetIngestContext();
  clearPublishedPayload();
  haltLiveTransport();
  if (refetch) refetchBindingList();
}

/** Backend binding and publication revision, not HTTP arrival order, own freshness. */
function acceptPublication(
  payload: DashboardPayload,
  bindingValue: unknown,
  serverId: string,
  epoch: number,
  generation: number,
): boolean {
  if (epoch !== lifecycleEpoch || generation !== ingestGeneration || recordedMode()
    || useDashboardStore.getState().activeServerId !== serverId) return false;
  const binding = sourceBinding(bindingValue);
  const selected = selectedBinding(serverId);
  if (!binding || !selected || binding.bindingId !== selected.bindingId
    || (acceptedBindingId !== null && acceptedBindingId !== selected.bindingId)) {
    rejectUnconfirmedBinding();
    return false;
  }
  if (binding.stateRevision < selected.stateRevision
    || binding.stateRevision < requiredRevision
    || (binding.stateRevision === selected.stateRevision && binding.stateStatus !== selected.stateStatus)
    || binding.stateRevision <= acceptedRevision) return false;
  acceptedBindingId = binding.bindingId;
  acceptedRevision = binding.stateRevision;
  requiredRevision = Math.max(requiredRevision, binding.stateRevision);
  if (binding.stateStatus === "pending" || binding.stateStatus === "blocked") {
    clearPublishedPayload();
    return true;
  }
  // A publication time is not a game-export receive time. Held/cache or an
  // unidentified export must never become Live via an HTTP response timestamp.
  const safePayload = safePayloadForBinding(payload, binding);
  ingestPayload(safePayload, serverId);
  return true;
}

function safePayloadForBinding(payload: DashboardPayload, binding: SourceBinding): DashboardPayload {
  if (binding.stateStatus === "snapshot" && binding.exportIdentity !== null) return payload;
  return {
    ...payload,
    dataTimestamps: {
      ...payload.dataTimestamps,
      isStale: true,
      confidence: binding.stateStatus === "cache" ? "cache" : "held",
    },
  };
}

function canReportHttpError(serverId: string, epoch: number, generation: number): boolean {
  return epoch === lifecycleEpoch && generation === ingestGeneration && !recordedMode()
    && useDashboardStore.getState().activeServerId === serverId
    && useDashboardStore.getState().payload === null;
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
  if (!active || !expectedServerId || String(expectedServerId) !== String(active)) return;
  applyPayloadToStore(payload);
  syncActiveFarmForPayload(payload);
}

function handleMessage(raw: string) {
  let msg: SourceMessage | { type: "source-state"; serverId?: string; sourceBinding?: unknown; removed?: boolean };
  try {
    msg = JSON.parse(raw) as typeof msg;
  } catch {
    return;
  }
  const active = useDashboardStore.getState().activeServerId;
  if (!active || String(msg.serverId) !== String(active)) return;
  if (msg.type === "source-state") {
    const binding = sourceBinding(msg.sourceBinding);
    const selected = selectedBinding(active);
    if (msg.removed === true) {
      // A removal is not a blocked publication. Invalidate pending HTTP and
      // the old socket before the authoritative server list is fetched again.
      rejectUnconfirmedBinding();
      return;
    }
    if (!binding || !selected || binding.bindingId !== selected.bindingId) {
      rejectUnconfirmedBinding();
      return;
    }
    if (binding.stateRevision <= acceptedRevision) return;
    requiredRevision = Math.max(requiredRevision, binding.stateRevision);
    if (binding.stateStatus === "pending" || binding.stateStatus === "blocked") {
      acceptedBindingId = binding.bindingId;
      acceptedRevision = binding.stateRevision;
    }
    clearPublishedPayload();
    if (binding.stateStatus !== "pending" && binding.stateStatus !== "blocked") void refreshDashboard();
    return;
  }
  if (msg.type !== "data" || !msg.data) return;
  acceptPublication(msg.data, msg.sourceBinding, active, lifecycleEpoch, ingestGeneration);
}

function recordedMode(): boolean {
  if (demoWritesAreLocked()) return true;
  return useDashboardStore.getState().payload?.dataSource === "recorded-demo";
}

function haltLiveTransport(): void {
  connectAttempt += 1;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  const oldSocket = socket;
  socket = null;
  try {
    oldSocket?.close();
  } catch {
    /* ignore */
  }
}

/** Leave an invalid or removed stored ID in place until the user chooses a source. */
function clearActiveServerSelection(): void {
  resetIngestContext();
  useDashboardStore.setState({
    activeServerId: null,
    activeFarmId: null,
    payload: null,
    lastUpdated: null,
    connection: "connecting",
  });
  syncNotificationScopeForContext(null, null, null);
}

async function pollOnce(expectedEpoch = lifecycleEpoch) {
  if (expectedEpoch !== lifecycleEpoch) return;
  if (recordedMode()) {
    haltLiveTransport();
    return;
  }
  const gen = ingestGeneration;
  const serverId = useDashboardStore.getState().activeServerId;
  if (!serverId) return;
  try {
    const data = await fetchDashboardData(serverId, { retry: false });
    if (!acceptPublication(data, (data as BoundPayload).sourceBinding, serverId, expectedEpoch, gen)) return;
    useDashboardStore.getState().setConnection(socket?.readyState === WebSocket.OPEN ? "ws" : "http");
  } catch {
    if (canReportHttpError(serverId, expectedEpoch, gen)
      && socket?.readyState !== WebSocket.OPEN) useDashboardStore.getState().setConnection("error");
  }
}

/** User-triggered refresh (helper panel / stale chip). Uses the shared retry policy once. */
export async function refreshDashboard(): Promise<void> {
  if (recordedMode()) {
    haltLiveTransport();
    return;
  }
  const epoch = lifecycleEpoch;
  const gen = ingestGeneration;
  const serverId = useDashboardStore.getState().activeServerId;
  if (!serverId) return;
  try {
    const data = await fetchDashboardData(serverId, { retry: true });
    if (!acceptPublication(data, (data as BoundPayload).sourceBinding, serverId, epoch, gen)) return;
    useDashboardStore
      .getState()
      .setConnection(socket?.readyState === WebSocket.OPEN ? "ws" : "http");
  } catch {
    if (canReportHttpError(serverId, epoch, gen)
      && socket?.readyState !== WebSocket.OPEN) useDashboardStore.getState().setConnection("error");
  }
}

/** Switch server tab and load that save's payload (HTTP); WS continues filtering by activeServerId. */
export async function switchActiveServer(serverId: string, forceReload = false): Promise<void> {
  if (recordedMode()) {
    haltLiveTransport();
    return;
  }
  // The top-bar picker uses this path. A choice made during link approval or hydration wins.
  invalidateSourceSelectionIntent();
  const state = useDashboardStore.getState();
  if (!resolveAvailableServerId(state.servers, serverId)
    || !state.servers.some((server) => String(server.id) === String(serverId))) return;
  if (!forceReload && String(state.activeServerId) === String(serverId)) return;
  if (forceReload) haltLiveTransport();
  resetIngestContext();
  const epoch = lifecycleEpoch;
  const gen = ingestGeneration;
  state.setActiveServerId(String(serverId));
  state.setPayload(null);
  state.setConnection("connecting");
  useDashboardStore.setState({ lastUpdated: null });
  const storedFarm = readStoredFarmId(serverId);
  state.setActiveFarmId(storedFarm ?? null);
  syncNotificationScopeForContext(serverId, storedFarm, null);
  if (!selectedBinding(String(serverId))) {
    refetchBindingList();
    return;
  }
  try {
    const data = await fetchDashboardData(serverId, { retry: true });
    if (!acceptPublication(data, (data as BoundPayload).sourceBinding, String(serverId), epoch, gen)) return;
    syncNotificationScopeForContext(serverId, useDashboardStore.getState().activeFarmId, data);
    useDashboardStore
      .getState()
      .setConnection(socket?.readyState === WebSocket.OPEN ? "ws" : "http");
    if (forceReload) await connectWebSocket(epoch);
  } catch {
    if (canReportHttpError(String(serverId), epoch, gen)
      && socket?.readyState !== WebSocket.OPEN) useDashboardStore.getState().setConnection("error");
    if (forceReload && epoch === lifecycleEpoch) startHttpFallback(epoch);
  }
}

/** Capture the current user-choice epoch before awaiting the explicit Link approval. */
export function captureSourceSelectionIntent(): number {
  return readSourceSelectionIntent();
}

/**
 * A successful, user-initiated link is not a background registration. Keep the previous
 * source painted until the new source has a matching, usable bound publication, then
 * commit source and payload in one store update. Never override a later picker choice.
 */
export async function selectApprovedLinkedSource(sourceId: string, intent: number): Promise<boolean> {
  const targetId = String(sourceId || "").trim();
  if (!targetId || recordedMode()) return false;
  const previousId = useDashboardStore.getState().activeServerId;
  const epoch = lifecycleEpoch;
  const stillWanted = () => epoch === lifecycleEpoch && readSourceSelectionIntent() === intent
    && useDashboardStore.getState().activeServerId === previousId && !recordedMode();

  // A first export can follow the in-game post-load grace. The new row appears in the
  // picker immediately, but the existing view stays intact while its data catches up.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (!stillWanted()) return false;
    try {
      const servers = await fetchServers();
      if (!stillWanted()) return false;
      const matches = servers.filter((server) => String(server.id) === targetId);
      if (matches.length === 1) {
        useDashboardStore.getState().setServers(servers);
        const listed = sourceBinding((matches[0] as BoundServer).sourceBinding);
        if (listed && listed.stateStatus !== "pending" && listed.stateStatus !== "blocked") {
          const data = await fetchDashboardData(targetId, { retry: false });
          if (!stillWanted()) return false;
          const published = sourceBinding((data as BoundPayload).sourceBinding);
          if (!data.error && published && published.exportIdentity !== null
            && published.stateStatus !== "pending" && published.stateStatus !== "blocked"
            && published.bindingId === listed.bindingId
            && published.stateRevision >= listed.stateRevision
            && (published.stateRevision !== listed.stateRevision || published.stateStatus === listed.stateStatus)) {
            const safePayload = safePayloadForBinding(data, published);
            const farmId = readStoredFarmId(targetId);
            serverListTicket += 1;
            resetIngestContext();
            acceptedBindingId = published.bindingId;
            acceptedRevision = published.stateRevision;
            requiredRevision = published.stateRevision;
            writeStoredServerId(targetId);
            syncNotificationScopeForContext(targetId, farmId, safePayload);
            useDashboardStore.setState({
              servers,
              activeServerId: targetId,
              activeFarmId: farmId,
              payload: safePayload,
              lastUpdated: safePayload.lastUpdated ?? new Date().toISOString(),
              connection: socket?.readyState === WebSocket.OPEN ? "ws" : "http",
            });
            // Retain the normal label enrichment and farm inference after the atomic paint.
            applyPayloadToStore(safePayload);
            syncActiveFarmForPayload(safePayload);
            syncNotificationScopeForContext(targetId, useDashboardStore.getState().activeFarmId, safePayload);
            // applyPayloadToStore marks successful payloads as WS; this one came from HTTP.
            // Keep the shared socket only if it is actually open for future publications.
            useDashboardStore.getState().setConnection(socket?.readyState === WebSocket.OPEN ? "ws" : "http");
            return true;
          }
        }
      }
    } catch {
      // Config publication and first export can arrive separately; retry without blanking the old view.
    }
    if (attempt < 29) await sleep(2000);
  }
  return false;
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
  if (recordedMode()) return;
  const servers: FarmDashServer[] = (Array.isArray(draft) ? draft : [])
    .filter((row) => row && row.id != null && String(row.id).trim() !== "")
    .map((row) => ({
      id: String(row.id),
      name: String(row.name || row.id),
      mode: row.mode || "local",
      localSubFolder: row.localSubFolder || undefined,
    }));
  serverListTicket += 1;
  resetIngestContext();
  haltLiveTransport();
  const state = useDashboardStore.getState();
  state.setServers(servers);
  clearPublishedPayload();
  const active = state.activeServerId;
  const stillThere = servers.some((srv) => String(srv.id) === String(active));
  if (!active || !stillThere) {
    clearActiveServerSelection();
    const nextId = resolveInitialServerId(servers);
    if (nextId) state.setActiveServerId(nextId);
  }
}

/** Re-read /api/servers after Settings persist (retries while the HTTP server reboots). */
export async function reloadServersFromApi(): Promise<FarmDashServer[]> {
  if (recordedMode()) {
    haltLiveTransport();
    return useDashboardStore.getState().servers;
  }
  const epoch = lifecycleEpoch;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (epoch !== lifecycleEpoch) return useDashboardStore.getState().servers;
    try {
      const ticket = ++serverListTicket;
      const servers = await fetchServers();
      if (epoch !== lifecycleEpoch || ticket !== serverListTicket || recordedMode()) {
        return useDashboardStore.getState().servers;
      }
      const state = useDashboardStore.getState();
      state.setServers(servers);
      const active = state.activeServerId;
      const stillThere = servers.some((srv) => String(srv.id) === String(active));
      if (!stillThere) {
        clearActiveServerSelection();
        const nextId = resolveInitialServerId(servers);
        if (nextId) await switchActiveServer(nextId);
      } else if (active) {
        const binding = selectedBinding(active);
        if (!binding) {
          rejectUnconfirmedBinding(false);
        } else if (acceptedBindingId !== binding.bindingId) {
          await switchActiveServer(active, true);
        } else if (binding.stateRevision > acceptedRevision) {
          if (binding.stateStatus === "pending" || binding.stateStatus === "blocked") {
            acceptedRevision = binding.stateRevision;
            requiredRevision = binding.stateRevision;
            clearPublishedPayload();
          } else {
            requiredRevision = binding.stateRevision;
            clearPublishedPayload();
            await refreshDashboard();
          }
        }
      }
      return servers;
    } catch (err) {
      if (epoch !== lifecycleEpoch) return useDashboardStore.getState().servers;
      lastError = err;
      await sleep(200 * (attempt + 1));
      if (epoch !== lifecycleEpoch) return useDashboardStore.getState().servers;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("reload_servers_failed");
}

function startHttpPolling(expectedEpoch: number, intervalMs: number) {
  if (expectedEpoch !== lifecycleEpoch || recordedMode()) return;
  if (pollTimer) clearInterval(pollTimer);
  void pollOnce(expectedEpoch);
  pollTimer = setInterval(() => {
    if (expectedEpoch === lifecycleEpoch) void pollOnce(expectedEpoch);
  }, intervalMs);
}

function startHttpFallback(expectedEpoch = lifecycleEpoch) {
  startHttpPolling(expectedEpoch, 8000);
}

function startHttpReconciliation(expectedEpoch = lifecycleEpoch) {
  // A connected socket can miss a publication without closing. Keep a slower
  // authoritative binding check so an old held snapshot cannot persist forever.
  // /api/data alone cannot reconcile a changed source binding or a newer
  // server-list revision that the open socket missed.
  if (expectedEpoch !== lifecycleEpoch || recordedMode()) return;
  if (pollTimer) clearInterval(pollTimer);
  void pollOnce(expectedEpoch);
  pollTimer = setInterval(() => {
    if (expectedEpoch !== lifecycleEpoch || recordedMode()) return;
    void reloadServersFromApi().catch(() => {
      // Preserve the data-only fallback when the server list is temporarily unavailable.
      void pollOnce(expectedEpoch);
    });
  }, 30000);
}

function ensureForegroundRefreshHook() {
  if (foregroundRefreshHooked || typeof window === "undefined" || typeof document === "undefined") return;
  foregroundRefreshHooked = true;
  const refreshOnForeground = () => {
    if (!started || document.visibilityState === "hidden" || recordedMode()) return;
    const now = Date.now();
    if (now - lastForegroundRefreshAt < 1500) return;
    lastForegroundRefreshAt = now;
    void reloadServersFromApi().catch(() => {
      void refreshDashboard();
    });
  };
  window.addEventListener("focus", refreshOnForeground);
  document.addEventListener("visibilitychange", refreshOnForeground);
}

function scheduleReconnect(expectedEpoch = lifecycleEpoch) {
  if (expectedEpoch !== lifecycleEpoch || recordedMode()) return;
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (expectedEpoch === lifecycleEpoch) void connectWebSocket(expectedEpoch);
  }, 3000);
}

export async function connectWebSocket(expectedEpoch = lifecycleEpoch) {
  if (expectedEpoch !== lifecycleEpoch) return;
  if (recordedMode()) {
    haltLiveTransport();
    return;
  }
  if (socket?.readyState === WebSocket.OPEN) return;
  const attempt = ++connectAttempt;
  const oldSocket = socket;
  socket = null;
  try {
    oldSocket?.close();
  } catch {
    /* ignore */
  }

  const token = await fetchLanWsToken();
  if (expectedEpoch !== lifecycleEpoch || attempt !== connectAttempt || recordedMode()) return;
  const currentSocket = new WebSocket(wsUrl(token));
  socket = currentSocket;

  currentSocket.addEventListener("open", () => {
    if (expectedEpoch !== lifecycleEpoch || socket !== currentSocket || recordedMode()) return;
    useDashboardStore.getState().setConnection("ws");
    startHttpReconciliation(expectedEpoch);
  });

  currentSocket.addEventListener("message", (ev) => {
    if (expectedEpoch !== lifecycleEpoch || socket !== currentSocket || recordedMode()) return;
    if (typeof ev.data === "string") handleMessage(ev.data);
  });

  currentSocket.addEventListener("close", () => {
    if (expectedEpoch !== lifecycleEpoch || socket !== currentSocket || recordedMode()) return;
    socket = null;
    useDashboardStore.getState().setConnection("connecting");
    startHttpFallback(expectedEpoch);
    scheduleReconnect(expectedEpoch);
  });

  currentSocket.addEventListener("error", () => {
    if (expectedEpoch === lifecycleEpoch && socket === currentSocket) currentSocket.close();
  });
}

export async function bootstrapRealtime(onReady?: Listener) {
  if (recordedMode()) {
    haltLiveTransport();
    onReady?.();
    return;
  }
  if (started && bootstrapPromise) return bootstrapPromise;
  started = true;
  ensureForegroundRefreshHook();
  const epoch = ++lifecycleEpoch;
  resetIngestContext();
  bootstrapPromise = (async () => {
    try {
      const ticket = ++serverListTicket;
      const servers = await fetchServers();
      if (epoch !== lifecycleEpoch || ticket !== serverListTicket || recordedMode()) return;
      useDashboardStore.getState().setServers(servers);
      const nextId = resolveInitialServerId(servers);
      if (useDashboardStore.getState().activeServerId !== nextId || !nextId) {
        clearActiveServerSelection();
        if (nextId) useDashboardStore.getState().setActiveServerId(nextId);
      }

      const serverIdForFetch = useDashboardStore.getState().activeServerId;
      if (serverIdForFetch && selectedBinding(serverIdForFetch)) {
        const fetchGeneration = ingestGeneration;
        try {
          const data = await fetchDashboardData(serverIdForFetch, { retry: true });
          acceptPublication(data, (data as BoundPayload).sourceBinding, serverIdForFetch, epoch, fetchGeneration);
        } catch {
          if (canReportHttpError(serverIdForFetch, epoch, fetchGeneration)) {
            useDashboardStore.getState().setConnection("error");
          }
        }
      }

      if (epoch !== lifecycleEpoch || recordedMode()) return;
      await connectWebSocket(epoch);
      if (epoch !== lifecycleEpoch || recordedMode()) return;
      onReady?.();
    } catch {
      if (epoch !== lifecycleEpoch) return;
      started = false;
      bootstrapPromise = null;
      useDashboardStore.getState().setConnection("error");
      throw new Error("bootstrap_failed");
    }
  })();
  await bootstrapPromise;
}

export function stopRealtime() {
  lifecycleEpoch += 1;
  serverListTicket += 1;
  resetIngestContext();
  started = false;
  bootstrapPromise = null;
  haltLiveTransport();
  if (!recordedMode()) useDashboardStore.getState().setConnection("connecting");
}
