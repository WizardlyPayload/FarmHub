// FS25 FarmDashboard | urgent-notifications.js | v1.0.0
// Toast + bell history for urgent pasture, vehicle, and field issues (not livestock deltas).

import { t } from "../i18n/i18n.js";
import { vehicleMatchesActiveFarm, isUsedEquipmentYardStock, resolveVehicleDisplayName } from "./vehicles.js";
import { filterFieldsForFarmView } from "./fields.js";
import {
  countActiveAdsBreakdowns,
  getVehicleDamageFraction,
  hasVisibleAdsBreakdowns,
  isVehicleAdsOverdue,
} from "./vehicleAds.js";
import {
  fieldRulesUrgencyScore,
  getLocalFieldSuggestion,
} from "../rules-engine.js";

const SKIP_FUEL_TYPE_NAMES = new Set(["highPressureWasher", "High Pressure Washer"]);
const FIELD_URGENCY_MIN = 40;
const MAX_ALERTS_PER_SCAN = 6;

function pastureMatchesFarm(pasture, farmId) {
  const fid = Number(pasture?.farmId ?? pasture?.ownerFarmId ?? 0);
  const af = Number(farmId ?? 1);
  if (!Number.isFinite(fid) || fid <= 0) return true;
  return fid === af;
}

export function getVehicleFuelPercent(vehicle) {
  if (!vehicle?.isMotorized) return -1;
  const typeName = String(vehicle.typeName ?? "");
  if (SKIP_FUEL_TYPE_NAMES.has(typeName)) return -1;
  if (vehicle.fuelCapacity > 0 && vehicle.fuelLevel >= 0) {
    return Math.round((vehicle.fuelLevel / vehicle.fuelCapacity) * 100);
  }
  const diesel = vehicle.fillLevels?.DIESEL;
  if (diesel && diesel.capacity > 0) {
    return Math.round((diesel.level / diesel.capacity) * 100);
  }
  if (vehicle.fuelCapacity > 0 || diesel) return 0;
  return -1;
}

/**
 * @param {object} dashboard
 * @returns {Array<{ key: string, type: string, category: string, title: string, message: string }>}
 */
export function collectUrgentAlerts(dashboard) {
  const alerts = [];
  if (!dashboard) return alerts;

  const farmId = Number(dashboard.activeFarmId ?? 1);
  const gameSettings = dashboard.gameSettings || {};

  for (const pasture of dashboard.pastures || []) {
    if (!pastureMatchesFarm(pasture, farmId)) continue;
    const penName = pasture.name || `Pen ${pasture.id}`;

    for (const warning of pasture.allWarnings || []) {
      if (warning.severity !== "danger" && warning.severity !== "warning") continue;
      if (warning.type === "data_unavailable") continue;
      const msg = warning.message || warning.type || "";
      alerts.push({
        key: `pasture:${pasture.id}:${warning.type}:${warning.severity}:${warning.subtype || ""}`,
        type: warning.severity,
        category: "pasture",
        title: t("urgent.pasture.title", { name: penName }),
        message: msg,
      });
    }

    const foodDays = pasture.foodReport?.durationDays?.food;
    if (
      Number(pasture.animalCount) > 0 &&
      Number.isFinite(foodDays) &&
      foodDays < 2
    ) {
      const rounded =
        foodDays >= 1 ? Math.round(foodDays) : Math.round(foodDays * 10) / 10;
      alerts.push({
        key: `pasture:${pasture.id}:food-duration:${rounded}`,
        type: foodDays < 1 ? "danger" : "warning",
        category: "pasture",
        title: t("urgent.pasture.foodRunningOutTitle", { name: penName }),
        message: pasture.foodReport?.durationEstimated
          ? t("urgent.pasture.foodRunningOutBodyEst", { days: rounded })
          : t("urgent.pasture.foodRunningOutBody", { days: rounded }),
      });
    }
  }

  for (const vehicle of dashboard.vehicles || []) {
    if (!vehicleMatchesActiveFarm(vehicle, farmId)) continue;
    if (isUsedEquipmentYardStock(vehicle)) continue;

    const name = resolveVehicleDisplayName(vehicle);
    const vid = vehicle.id ?? vehicle.uniqueId ?? name;

    const fuelPct = getVehicleFuelPercent(vehicle);
    if (fuelPct >= 0 && fuelPct < 15) {
      alerts.push({
        key: `vehicle:${vid}:fuel:critical`,
        type: "danger",
        category: "vehicle",
        title: t("urgent.vehicle.title", { name }),
        message: t("urgent.vehicle.fuelCritical", { pct: fuelPct }),
      });
    } else if (fuelPct >= 0 && fuelPct < 25) {
      alerts.push({
        key: `vehicle:${vid}:fuel:low`,
        type: "warning",
        category: "vehicle",
        title: t("urgent.vehicle.title", { name }),
        message: t("urgent.vehicle.fuelLow", { pct: fuelPct }),
      });
    }

    const damage = getVehicleDamageFraction(vehicle);
    if (damage > 0.5) {
      alerts.push({
        key: `vehicle:${vid}:damage:critical`,
        type: "danger",
        category: "vehicle",
        title: t("urgent.vehicle.title", { name }),
        message: t("urgent.vehicle.damageCritical", {
          pct: Math.round(damage * 100),
        }),
      });
    } else if (damage > 0.3) {
      alerts.push({
        key: `vehicle:${vid}:damage:high`,
        type: "warning",
        category: "vehicle",
        title: t("urgent.vehicle.title", { name }),
        message: t("urgent.vehicle.damageHigh", {
          pct: Math.round(damage * 100),
        }),
      });
    }

    const breakdowns =
      countActiveAdsBreakdowns(vehicle) ||
      (hasVisibleAdsBreakdowns(vehicle)
        ? (vehicle.ads?.breakdownParts || []).length
        : 0);
    if (breakdowns > 0) {
      alerts.push({
        key: `vehicle:${vid}:breakdown`,
        type: "danger",
        category: "vehicle",
        title: t("urgent.vehicle.title", { name }),
        message: t("urgent.vehicle.breakdown", { count: breakdowns }),
      });
    } else if (isVehicleAdsOverdue(vehicle)) {
      alerts.push({
        key: `vehicle:${vid}:service-overdue`,
        type: "warning",
        category: "vehicle",
        title: t("urgent.vehicle.title", { name }),
        message: t("urgent.vehicle.serviceOverdue"),
      });
    }
  }

  const fields = filterFieldsForFarmView(dashboard.fields || [], farmId);
  for (const field of fields) {
    const score = fieldRulesUrgencyScore(field);
    if (score < FIELD_URGENCY_MIN) continue;
    const sug = getLocalFieldSuggestion(field, { gameSettings });
    if (!sug?.action) continue;
    const fid = field.farmlandId ?? field.id ?? "?";
    const actionKey = sug.actionKey || sug.action;
    alerts.push({
      key: `field:${fid}:${actionKey}`,
      type: score >= 80 ? "danger" : "warning",
      category: "field",
      title: t("urgent.field.title", { id: fid }),
      message: t("urgent.field.body", {
        action: sug.action,
        reason: sug.reason || "",
      }),
    });
  }

  return alerts;
}

/**
 * Notify when new urgent keys appear (baseline on first scan — no flood).
 * @param {object} dashboard
 * @param {Set<string>|undefined} previousKeys
 */
export function processUrgentAlertTransitions(dashboard, previousKeys) {
  if (!dashboard) return new Set();

  const alerts = collectUrgentAlerts(dashboard);
  const currentKeys = new Set(alerts.map((a) => a.key));

  if (!dashboard._urgentAlertsInitialized) {
    dashboard._urgentAlertsInitialized = true;
    dashboard._urgentAlertKeys = currentKeys;
    return currentKeys;
  }

  const prev = previousKeys || dashboard._urgentAlertKeys || new Set();
  const fresh = alerts.filter((a) => !prev.has(a.key));
  const toNotify = fresh.slice(0, MAX_ALERTS_PER_SCAN);

  for (const alert of toNotify) {
    if (typeof dashboard.showAlert === "function") {
      dashboard.showAlert(alert.message, alert.type);
    }
    if (typeof dashboard.addNotificationToHistory === "function") {
      dashboard.addNotificationToHistory({
        type: alert.type,
        title: alert.title,
        message: alert.message,
      });
    }
  }

  dashboard._urgentAlertKeys = currentKeys;
  return currentKeys;
}
