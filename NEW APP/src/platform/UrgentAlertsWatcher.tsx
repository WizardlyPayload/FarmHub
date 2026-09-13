import { useEffect, useRef } from "preact/hooks";
import { useDashboardStore } from "@/store/dashboard-store";
import { addNotificationToHistory, setNotificationScope } from "@/platform/notifications";
import {
  buildAlertScopeKey,
  processUrgentAlertTransitions,
  resolveSaveIdFromPayload,
  type UrgentScanDashboard,
} from "@/platform/urgent-alerts";
import {
  diffMajorDeltas,
  takeMajorDeltaSnapshot,
  type MajorDeltaSnapshot,
} from "@/platform/major-deltas";
import { showToast } from "@/platform/ChangesModal";

/**
 * Watches store payload and emits major alert toasts + scoped notification history.
 * On server/farm/save switch: re-baselines urgently and economy deltas with zero toasts.
 */
export function UrgentAlertsWatcher() {
  const payload = useDashboardStore((s) => s.payload);
  const activeFarmId = useDashboardStore((s) => s.activeFarmId);
  const activeServerId = useDashboardStore((s) => s.activeServerId);
  const dashRef = useRef<UrgentScanDashboard>({});
  const scopeRef = useRef<string>("");
  const deltaSnapRef = useRef<MajorDeltaSnapshot | null>(null);
  const deltaScopeRef = useRef<string>("");

  useEffect(() => {
    if (!payload || payload.error) return;

    const farmId = activeFarmId ?? 1;
    const saveId = resolveSaveIdFromPayload(payload);
    const scopeKey = buildAlertScopeKey(activeServerId, farmId, saveId);

    // Keep bell history on the same scope as alerts.
    setNotificationScope(scopeKey);

    const pastures = (payload as { pastures?: unknown[] }).pastures;
    const fields = Array.isArray(payload.fields) ? payload.fields : [];

    dashRef.current.activeFarmId = farmId;
    dashRef.current.gameSettings = payload.gameSettings;
    dashRef.current.pastures = Array.isArray(pastures)
      ? (pastures as Array<Record<string, unknown>>)
      : [];
    dashRef.current.vehicles = payload.vehicles as UrgentScanDashboard["vehicles"];
    dashRef.current.fields = fields as Array<Record<string, unknown>>;
    dashRef.current.showAlert = (message, type) => showToast(message, type);
    dashRef.current.addNotificationToHistory = (n) => addNotificationToHistory(n);

    const scopeChanged = scopeRef.current !== "" && scopeRef.current !== scopeKey;
    if (scopeChanged) {
      // Force silent re-baseline inside processUrgentAlertTransitions.
      dashRef.current._urgentAlertsInitialized = false;
      dashRef.current._urgentAlertKeys = new Set();
    }
    scopeRef.current = scopeKey;

    processUrgentAlertTransitions(dashRef.current, undefined, scopeKey);

    // Major stock / bale / pallet / animal count deltas (never on scope switch).
    const nextSnap = takeMajorDeltaSnapshot({
      farmId,
      animals: payload.animals,
      stock: payload.stock,
      baleInventory: payload.baleInventory,
      vehicles: payload.vehicles,
    });

    if (deltaScopeRef.current !== scopeKey) {
      deltaScopeRef.current = scopeKey;
      deltaSnapRef.current = nextSnap;
      return;
    }

    const events = diffMajorDeltas(deltaSnapRef.current, nextSnap);
    deltaSnapRef.current = nextSnap;

    for (const ev of events.slice(0, 4)) {
      showToast(ev.message, ev.type);
      addNotificationToHistory({
        type: ev.type,
        title: ev.title,
        message: ev.message,
      });
    }
  }, [payload, activeFarmId, activeServerId]);

  return null;
}

/** Call from farm/server switch handlers to force silent re-baseline on next payload. */
export function resetUrgentAlertBaseline(): void {
  /* Watcher detects scope change via store; this is a no-op hook for ws-client. */
}
