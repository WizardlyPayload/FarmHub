/**
 * Manual refresh change detection — port of legacy changes.js core.
 * Full livestock/pasture diff; UI modal consumes `DataChanges` result.
 */

import { t } from "@/i18n/i18n";
import { addNotificationToHistory } from "@/platform/notifications";

export interface PreRefreshSnapshot {
  animals: unknown[];
  pastures: unknown[];
  playerFarms: unknown[];
  gameTime: unknown;
  timestamp: string;
}

export interface DataChanges {
  livestock: LivestockChanges;
  warnings: WarningChange[];
  food: FoodChange[];
  statistics: StatChange[];
  hasAny: boolean;
}

export interface LivestockChanges {
  added: string[];
  removed: string[];
  births: string[];
  pregnancyStarted: string[];
  lactationStarted: string[];
  lactationStopped: string[];
  healthCritical: Array<{ id: string; name: string; health: number }>;
}

export interface WarningChange {
  pasture: string;
  message: string;
}

export interface FoodChange {
  pasture: string;
  kind: "low" | "drop";
  level?: number;
  drop?: number;
  message?: string;
}

export interface StatChange {
  label: string;
  from: string | number;
  to: string | number;
}

let preRefreshData: PreRefreshSnapshot | null = null;

export function storeDataForComparison(snapshot: {
  animals?: unknown[];
  pastures?: unknown[];
  playerFarms?: unknown[];
  gameTime?: unknown;
}): void {
  preRefreshData = {
    animals: snapshot.animals ? JSON.parse(JSON.stringify(snapshot.animals)) : [],
    pastures: snapshot.pastures ? JSON.parse(JSON.stringify(snapshot.pastures)) : [],
    playerFarms: snapshot.playerFarms ? JSON.parse(JSON.stringify(snapshot.playerFarms)) : [],
    gameTime: snapshot.gameTime,
    timestamp: new Date().toISOString(),
  };
}

export function clearPreRefreshData(): void {
  preRefreshData = null;
}

export function hasPreRefreshData(): boolean {
  return preRefreshData != null;
}

function normalizeNumericValue(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const num = parseFloat(String(value));
  return Number.isNaN(num) ? 0 : num;
}

function normalizeBooleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.toLowerCase().trim();
    return lower === "true" || lower === "1" || lower === "yes";
  }
  return Boolean(value);
}

function animalId(a: Record<string, unknown>): string {
  return String(a.id ?? a.uniqueId ?? a.name ?? "");
}

function compareLivestock(oldAnimals: unknown[], newAnimals: unknown[]): LivestockChanges {
  const oldMap = new Map<string, Record<string, unknown>>();
  const newMap = new Map<string, Record<string, unknown>>();
  for (const a of oldAnimals) {
    if (a && typeof a === "object") oldMap.set(animalId(a as Record<string, unknown>), a as Record<string, unknown>);
  }
  for (const a of newAnimals) {
    if (a && typeof a === "object") newMap.set(animalId(a as Record<string, unknown>), a as Record<string, unknown>);
  }

  const added: string[] = [];
  const removed: string[] = [];
  const births: string[] = [];
  const pregnancyStarted: string[] = [];
  const lactationStarted: string[] = [];
  const lactationStopped: string[] = [];
  const healthCritical: LivestockChanges["healthCritical"] = [];

  for (const [id] of newMap) {
    if (!oldMap.has(id)) added.push(id);
  }
  for (const [id] of oldMap) {
    if (!newMap.has(id)) removed.push(id);
  }

  for (const [id, neu] of newMap) {
    const old = oldMap.get(id);
    if (!old) continue;
    const name = String(neu.name || id);
    const oldHealth = normalizeNumericValue(old.health);
    const newHealth = normalizeNumericValue(neu.health);
    if (newHealth < 50 && Math.abs(newHealth - oldHealth) > 15) {
      healthCritical.push({ id, name, health: Math.round(newHealth) });
    }
    if (!normalizeBooleanValue(old.isPregnant) && normalizeBooleanValue(neu.isPregnant)) {
      pregnancyStarted.push(id);
    }
    if (!normalizeBooleanValue(old.isLactating) && normalizeBooleanValue(neu.isLactating)) {
      lactationStarted.push(id);
    }
    if (normalizeBooleanValue(old.isLactating) && !normalizeBooleanValue(neu.isLactating)) {
      lactationStopped.push(id);
    }
    const oldAge = normalizeNumericValue(old.age);
    const newAge = normalizeNumericValue(neu.age);
    if (newAge < oldAge && oldAge - newAge > 0.05) {
      /* age reset often means replacement — skip */
    }
    if (normalizeBooleanValue(neu.justGaveBirth) || (newAge < 0.1 && oldAge > 0.5)) {
      births.push(id);
    }
  }

  return {
    added,
    removed,
    births,
    pregnancyStarted,
    lactationStarted,
    lactationStopped,
    healthCritical,
  };
}

function compareWarnings(oldPastures: unknown[], newPastures: unknown[]): WarningChange[] {
  const out: WarningChange[] = [];
  const oldById = new Map<string, Record<string, unknown>>();
  for (const p of oldPastures) {
    if (p && typeof p === "object") {
      const rec = p as Record<string, unknown>;
      oldById.set(String(rec.id ?? rec.name), rec);
    }
  }
  for (const p of newPastures) {
    if (!p || typeof p !== "object") continue;
    const neu = p as Record<string, unknown>;
    const id = String(neu.id ?? neu.name);
    const old = oldById.get(id);
    const oldWarnList = Array.isArray(old?.allWarnings)
      ? (old!.allWarnings as Array<Record<string, unknown>>)
      : [];
    const oldWarns = new Set(
      oldWarnList.map((w) => String(w.type || w.message || "")),
    );
    const newWarnList = Array.isArray(neu.allWarnings)
      ? (neu.allWarnings as Array<Record<string, unknown>>)
      : [];
    for (const w of newWarnList) {
      const key = String(w.type || w.message || "");
      if (!oldWarns.has(key) && (w.severity === "danger" || w.severity === "warning")) {
        out.push({
          pasture: String(neu.name || id),
          message: String(w.message || w.type || ""),
        });
      }
    }
  }
  return out;
}

function compareFood(oldPastures: unknown[], newPastures: unknown[]): FoodChange[] {
  const out: FoodChange[] = [];
  const oldById = new Map<string, Record<string, unknown>>();
  for (const p of oldPastures) {
    if (p && typeof p === "object") {
      const rec = p as Record<string, unknown>;
      oldById.set(String(rec.id ?? rec.name), rec);
    }
  }
  for (const p of newPastures) {
    if (!p || typeof p !== "object") continue;
    const neu = p as Record<string, unknown>;
    const id = String(neu.id ?? neu.name);
    const old = oldById.get(id);
    const name = String(neu.name || id);
    const newLevel = normalizeNumericValue(neu.foodLevel ?? neu.foodPct);
    const oldLevel = normalizeNumericValue(old?.foodLevel ?? old?.foodPct);
    if (newLevel < 100 && oldLevel >= 100) {
      out.push({ pasture: name, kind: "low", level: Math.round(newLevel) });
    }
    const drop = oldLevel - newLevel;
    if (newLevel < 200 && drop > 50) {
      out.push({ pasture: name, kind: "drop", drop: Math.round(drop), level: Math.round(newLevel) });
    }
  }
  return out;
}

function compareStatistics(
  oldData: PreRefreshSnapshot,
  newData: { animals: unknown[]; pastures: unknown[]; playerFarms: unknown[] },
): StatChange[] {
  const out: StatChange[] = [];
  const oA = oldData.animals.length;
  const nA = newData.animals.length;
  if (oA !== nA) {
    out.push({
      label: t("changes.statLivestockCount"),
      from: oA,
      to: nA,
    });
  }
  const oP = oldData.pastures.length;
  const nP = newData.pastures.length;
  if (oP !== nP) {
    out.push({
      label: t("changes.statPastureCount"),
      from: oP,
      to: nP,
    });
  }
  const oF = oldData.playerFarms.length;
  const nF = newData.playerFarms.length;
  if (oF !== nF) {
    out.push({
      label: t("changes.statFarmsCount"),
      from: oF,
      to: nF,
    });
  }
  return out;
}

export function calculateDataChanges(current: {
  animals?: unknown[];
  pastures?: unknown[];
  playerFarms?: unknown[];
  gameTime?: unknown;
}): DataChanges | null {
  if (!preRefreshData) return null;
  const animals = current.animals || [];
  const pastures = current.pastures || [];
  const playerFarms = current.playerFarms || [];
  const livestock = compareLivestock(preRefreshData.animals, animals);
  const warnings = compareWarnings(preRefreshData.pastures, pastures);
  const food = compareFood(preRefreshData.pastures, pastures);
  const statistics = compareStatistics(preRefreshData, { animals, pastures, playerFarms });
  const hasAny =
    livestock.added.length +
      livestock.removed.length +
      livestock.births.length +
      livestock.pregnancyStarted.length +
      livestock.lactationStarted.length +
      livestock.lactationStopped.length +
      livestock.healthCritical.length +
      warnings.length +
      food.length +
      statistics.length >
    0;
  return { livestock, warnings, food, statistics, hasAny };
}

export function showChangeToasts(changes: DataChanges): void {
  const L = changes.livestock;
  if (L.added.length) {
    const key = L.added.length === 1 ? "changes.toastAnimalAddedOne" : "changes.toastAnimalAddedMany";
    addNotificationToHistory({
      type: "info",
      title: t(L.added.length === 1 ? "changes.historyAnimalAddedTitleOne" : "changes.historyAnimalAddedTitleMany", {
        count: L.added.length,
      }),
      message: t(key, { count: L.added.length, ids: L.added.slice(0, 5).join(", ") }),
    });
  }
  if (L.removed.length) {
    const key =
      L.removed.length === 1 ? "changes.toastAnimalRemovedOne" : "changes.toastAnimalRemovedMany";
    addNotificationToHistory({
      type: "info",
      title: t(
        L.removed.length === 1
          ? "changes.historyAnimalRemovedTitleOne"
          : "changes.historyAnimalRemovedTitleMany",
        { count: L.removed.length },
      ),
      message: t(key, { count: L.removed.length, ids: L.removed.slice(0, 5).join(", ") }),
    });
  }
  for (const id of L.births) {
    addNotificationToHistory({
      type: "success",
      title: t("changes.historyBirthTitle"),
      message: t("changes.historyBirthBody", { id }),
    });
  }
  for (const h of L.healthCritical) {
    addNotificationToHistory({
      type: "danger",
      title: t("urgent.livestock.healthTitle"),
      message: t("changes.toastHealthCritical", { name: h.name, health: h.health }),
    });
  }
  for (const f of changes.food) {
    if (f.kind === "low") {
      addNotificationToHistory({
        type: "warning",
        title: t("urgent.pasture.title", { name: f.pasture }),
        message: t("changes.toastFoodLowAlert", { pasture: f.pasture, level: f.level ?? 0 }),
      });
    } else {
      addNotificationToHistory({
        type: "warning",
        title: t("urgent.pasture.title", { name: f.pasture }),
        message: t("changes.toastFoodDrop", { pasture: f.pasture, drop: f.drop ?? 0 }),
      });
    }
  }
}

export function compareAndNotify(current: {
  animals?: unknown[];
  pastures?: unknown[];
  playerFarms?: unknown[];
  gameTime?: unknown;
}): DataChanges | null {
  const changes = calculateDataChanges(current);
  if (changes) showChangeToasts(changes);
  clearPreRefreshData();
  return changes;
}
