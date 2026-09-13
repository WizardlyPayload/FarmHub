/**
 * Major-only urgent alerts — pasture danger, critical fuel/damage, ADS breakdowns,
 * withered / harvest-ready fields. Scoped baselines live in UrgentAlertsWatcher.
 */

import { t } from "@/i18n/i18n";

const SKIP_FUEL_TYPE_NAMES = new Set(["highPressureWasher", "High Pressure Washer"]);
const MAX_ALERTS_PER_SCAN = 6;

/** Field actions that are major enough to toast (no plow/cultivate/weed spam). */
const MAJOR_FIELD_ACTIONS = new Set(["harvest", "withered", "wither"]);

export interface UrgentAlert {
  key: string;
  type: string;
  category: string;
  title: string;
  message: string;
}

export interface UrgentScanDashboard {
  activeFarmId?: number;
  gameSettings?: Record<string, unknown>;
  pastures?: Array<Record<string, unknown>>;
  vehicles?: Array<Record<string, unknown>> | Record<string, unknown>;
  fields?: Array<Record<string, unknown>>;
  showAlert?: (message: string, type: string) => void;
  addNotificationToHistory?: (n: {
    type: string;
    title: string;
    message: string;
  }) => void;
  _urgentAlertsInitialized?: boolean;
  _urgentAlertKeys?: Set<string>;
  /** Scope key `${server}::${farm}::${save}` — when it changes, re-baseline silently. */
  _urgentAlertScope?: string;
}

function pastureMatchesFarm(pasture: Record<string, unknown>, farmId: number): boolean {
  const fid = Number(pasture?.farmId ?? pasture?.ownerFarmId ?? 0);
  if (!Number.isFinite(fid) || fid <= 0) return true;
  return fid === farmId;
}

function vehicleList(vehicles: UrgentScanDashboard["vehicles"]): Array<Record<string, unknown>> {
  if (Array.isArray(vehicles)) return vehicles;
  if (vehicles && typeof vehicles === "object") {
    const list = (vehicles as { list?: unknown }).list;
    if (Array.isArray(list)) return list as Array<Record<string, unknown>>;
  }
  return [];
}

function vehicleMatchesActiveFarm(vehicle: Record<string, unknown>, farmId: number): boolean {
  const fid = Number(vehicle.ownerFarmId ?? vehicle.farmId ?? 0);
  if (!Number.isFinite(fid) || fid <= 0) return true;
  return fid === farmId;
}

function isUsedEquipmentYardStock(vehicle: Record<string, unknown>): boolean {
  return !!(vehicle.isUsedEquipmentYardStock || vehicle.usedEquipmentYard);
}

function resolveVehicleDisplayName(vehicle: Record<string, unknown>): string {
  return String(vehicle.name || vehicle.typeName || vehicle.id || "Vehicle");
}

export function getVehicleFuelPercent(vehicle: Record<string, unknown>): number {
  if (!vehicle?.isMotorized) return -1;
  const typeName = String(vehicle.typeName ?? "");
  if (SKIP_FUEL_TYPE_NAMES.has(typeName)) return -1;
  const fuelCapacity = Number(vehicle.fuelCapacity);
  const fuelLevel = Number(vehicle.fuelLevel);
  if (fuelCapacity > 0 && fuelLevel >= 0) {
    return Math.round((fuelLevel / fuelCapacity) * 100);
  }
  const diesel = (vehicle.fillLevels as { DIESEL?: { capacity?: number; level?: number } } | undefined)
    ?.DIESEL;
  if (diesel && Number(diesel.capacity) > 0) {
    return Math.round((Number(diesel.level) / Number(diesel.capacity)) * 100);
  }
  if (fuelCapacity > 0 || diesel) return 0;
  return -1;
}

function getVehicleDamageFraction(vehicle: Record<string, unknown>): number {
  const d = Number(vehicle.damage ?? vehicle.wear ?? 0);
  if (!Number.isFinite(d)) return 0;
  return d > 1 ? d / 100 : d;
}

function countActiveAdsBreakdowns(vehicle: Record<string, unknown>): number {
  const ads = vehicle.ads as { breakdownParts?: unknown[] } | undefined;
  if (!ads?.breakdownParts) return 0;
  return ads.breakdownParts.length;
}

function filterFieldsForFarmView(
  fields: Array<Record<string, unknown>>,
  farmId: number,
): Array<Record<string, unknown>> {
  return fields.filter((f) => Number(f?.ownerFarmId ?? f?.farmId ?? 0) === farmId);
}

/** Major field suggestion only — harvest-ready or withered. */
function getMajorFieldSuggestion(field: Record<string, unknown>): {
  action?: string;
  actionKey?: string;
  reason?: string;
  score: number;
} | null {
  const withered =
    field.withered === true ||
    field.isWithered === true ||
    String(field.fruitTypeState || field.growthStateName || "")
      .toLowerCase()
      .includes("wither");
  if (withered) {
    return {
      action: "Clear",
      actionKey: "withered",
      reason: "Crop withered",
      score: 90,
    };
  }
  const harvestReady =
    field.harvestReady === true ||
    field.isHarvestReady === true ||
    (field.fruitType != null &&
      field.growthState != null &&
      Number(field.growthState) >= 7 &&
      !field.needsPlowing &&
      !field.needsCultivating);
  if (harvestReady) {
    return {
      action: "Harvest",
      actionKey: "harvest",
      reason: "Ready to harvest",
      score: 85,
    };
  }
  return null;
}

export function collectUrgentAlerts(dashboard: UrgentScanDashboard | null | undefined): UrgentAlert[] {
  const alerts: UrgentAlert[] = [];
  if (!dashboard) return alerts;

  const farmId = Number(dashboard.activeFarmId ?? 1);

  for (const pasture of dashboard.pastures || []) {
    if (!pastureMatchesFarm(pasture, farmId)) continue;
    const penName = String(pasture.name || `Pen ${pasture.id}`);

    // Major-only: danger severity (not warning / lactation / pregnancy info).
    const warnings = Array.isArray(pasture.allWarnings)
      ? (pasture.allWarnings as Array<Record<string, unknown>>)
      : [];
    for (const warning of warnings) {
      if (warning.severity !== "danger") continue;
      if (warning.type === "data_unavailable") continue;
      const msg = String(warning.message || warning.type || "");
      alerts.push({
        key: `pasture:${pasture.id}:${warning.type}:danger:${warning.subtype || ""}`,
        type: "danger",
        category: "pasture",
        title: t("urgent.pasture.title", { name: penName }),
        message: msg,
      });
    }

    // Major-only: food < 1 day (not the < 2 day warning band).
    const foodDays = Number(
      (pasture.foodReport as { durationDays?: { food?: number } } | undefined)?.durationDays?.food,
    );
    if (Number(pasture.animalCount) > 0 && Number.isFinite(foodDays) && foodDays < 1) {
      const rounded = Math.round(foodDays * 10) / 10;
      const estimated = !!(pasture.foodReport as { durationEstimated?: boolean } | undefined)
        ?.durationEstimated;
      alerts.push({
        key: `pasture:${pasture.id}:food-duration:critical`,
        type: "danger",
        category: "pasture",
        title: t("urgent.pasture.foodRunningOutTitle", { name: penName }),
        message: estimated
          ? t("urgent.pasture.foodRunningOutBodyEst", { days: rounded })
          : t("urgent.pasture.foodRunningOutBody", { days: rounded }),
      });
    }
  }

  for (const vehicle of vehicleList(dashboard.vehicles)) {
    if (!vehicleMatchesActiveFarm(vehicle, farmId)) continue;
    if (isUsedEquipmentYardStock(vehicle)) continue;

    const name = resolveVehicleDisplayName(vehicle);
    const vid = vehicle.id ?? vehicle.uniqueId ?? name;

    // Major-only: fuel < 15% (suppress 15–25% low band).
    const fuelPct = getVehicleFuelPercent(vehicle);
    if (fuelPct >= 0 && fuelPct < 15) {
      alerts.push({
        key: `vehicle:${vid}:fuel:critical`,
        type: "danger",
        category: "vehicle",
        title: t("urgent.vehicle.title", { name }),
        message: t("urgent.vehicle.fuelCritical", { pct: fuelPct }),
      });
    }

    // Major-only: damage > 50% (suppress mid band).
    const damage = getVehicleDamageFraction(vehicle);
    if (damage > 0.5) {
      alerts.push({
        key: `vehicle:${vid}:damage:critical`,
        type: "danger",
        category: "vehicle",
        title: t("urgent.vehicle.title", { name }),
        message: t("urgent.vehicle.damageCritical", { pct: Math.round(damage * 100) }),
      });
    }

    // Major-only: ADS breakdowns (suppress service-overdue without breakdown).
    const breakdowns = countActiveAdsBreakdowns(vehicle);
    if (breakdowns > 0) {
      alerts.push({
        key: `vehicle:${vid}:breakdown`,
        type: "danger",
        category: "vehicle",
        title: t("urgent.vehicle.title", { name }),
        message: t("urgent.vehicle.breakdown", { count: breakdowns }),
      });
    }
  }

  const fields = filterFieldsForFarmView(dashboard.fields || [], farmId);
  for (const field of fields) {
    const sug = getMajorFieldSuggestion(field);
    if (!sug?.action || !sug.actionKey || !MAJOR_FIELD_ACTIONS.has(sug.actionKey)) continue;
    const fid = field.farmlandId ?? field.id ?? "?";
    alerts.push({
      key: `field:${fid}:${sug.actionKey}`,
      type: sug.score >= 80 ? "danger" : "warning",
      category: "field",
      title: t("urgent.field.title", { id: String(fid) }),
      message: t("urgent.field.body", { action: sug.action, reason: sug.reason || "" }),
    });
  }

  return alerts;
}

/**
 * Process alert transitions. When `scopeKey` differs from the last scope,
 * re-baseline silently (zero toasts) — used on server/farm/save switch.
 */
export function processUrgentAlertTransitions(
  dashboard: UrgentScanDashboard | null | undefined,
  previousKeys?: Set<string>,
  scopeKey?: string,
): Set<string> {
  if (!dashboard) return new Set();

  const alerts = collectUrgentAlerts(dashboard);
  const currentKeys = new Set(alerts.map((a) => a.key));
  const scope = scopeKey ?? dashboard._urgentAlertScope ?? "";

  const scopeChanged =
    scope && dashboard._urgentAlertScope != null && dashboard._urgentAlertScope !== scope;
  const needsBaseline =
    !dashboard._urgentAlertsInitialized || scopeChanged || (scope && !dashboard._urgentAlertScope);

  if (needsBaseline) {
    dashboard._urgentAlertsInitialized = true;
    dashboard._urgentAlertScope = scope;
    dashboard._urgentAlertKeys = currentKeys;
    return currentKeys;
  }

  if (scope) dashboard._urgentAlertScope = scope;

  const prev = previousKeys || dashboard._urgentAlertKeys || new Set();
  const fresh = alerts.filter((a) => !prev.has(a.key));
  const toNotify = fresh.slice(0, MAX_ALERTS_PER_SCAN);

  for (const alert of toNotify) {
    dashboard.showAlert?.(alert.message, alert.type);
    dashboard.addNotificationToHistory?.({
      type: alert.type,
      title: alert.title,
      message: alert.message,
    });
  }

  dashboard._urgentAlertKeys = currentKeys;
  return currentKeys;
}

export function buildAlertScopeKey(
  serverId: string | null | undefined,
  farmId: number | null | undefined,
  saveId: string | null | undefined,
): string {
  return `${String(serverId || "default")}::${Number(farmId) || 1}::${String(saveId || "default")}`;
}

export function resolveSaveIdFromPayload(payload: {
  serverInfo?: { saveSlot?: string };
  savegameName?: string;
  mapId?: string;
  serverInfo_mapId?: string;
} | null | undefined): string {
  if (!payload) return "default";
  const slot = payload.serverInfo?.saveSlot || payload.savegameName || payload.mapId;
  return String(slot || "default");
}
