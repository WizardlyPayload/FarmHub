/**
 * Major economy / livestock count deltas — animals bought/sold, significant stock
 * liter moves, bale count changes, pallet/bigbag/IBC count changes.
 * Never toasts on scope (server/farm/save) switch — re-baselines silently.
 */

import { t } from "@/i18n/i18n";
import { resolveBaleInventoryForFarm, sumBaleBucket } from "@/lib/economy";
import { isStorageItem, normalizeVehicleList, vehicleMatchesActiveFarm } from "@/lib/vehicles";
import type { FleetVehicle } from "@/lib/vehicles";

/** Minimum absolute liter change to toast (avoids float noise). */
const STOCK_LITER_THRESHOLD = 500;
/** Minimum bale count change to toast. */
const BALE_COUNT_THRESHOLD = 1;
/** Minimum storage-item (pallet/bigbag/IBC) count change to toast. */
const STORAGE_ITEM_THRESHOLD = 1;

export interface MajorDeltaSnapshot {
  animalCount: number | null;
  stockLiters: number | null;
  balesOnField: number | null;
  balesInStorage: number | null;
  storageItemCount: number | null;
}

export interface MajorDeltaEvent {
  key: string;
  type: "info" | "success" | "warning";
  title: string;
  message: string;
}

type MajorDeltaGroup = "animals" | "stock" | "bales" | "storageItems";
type MajorDeltaGroupValue = number | [number, number];

interface MajorDeltaGroupState {
  baseline: MajorDeltaGroupValue | null;
  candidate: MajorDeltaGroupValue | null;
  candidateSamples: number;
}

export interface MajorDeltaTrackerState {
  streamKey: string;
  generation: number;
  groups: Record<MajorDeltaGroup, MajorDeltaGroupState>;
}

const DELTA_GROUPS: MajorDeltaGroup[] = ["animals", "stock", "bales", "storageItems"];

function sectionComplete(outcomes: unknown, name: string): boolean {
  if (!outcomes || typeof outcomes !== "object" || Array.isArray(outcomes)) return true;
  const record = (outcomes as Record<string, unknown>)[name];
  if (record === undefined) return true; // Older exports have no provenance record.
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  const outcome = record as Record<string, unknown>;
  return ["ok", "empty", "zero"].includes(String(outcome.outcome))
    && outcome.readState === "ok"
    && outcome.coverage === "complete";
}

function baleProvenanceReady(outcomes: unknown): boolean {
  if (!outcomes || typeof outcomes !== "object" || Array.isArray(outcomes)) return true;
  const stock = (outcomes as Record<string, unknown>).stock;
  // The bale scan can operate independently when stock collection is disabled.
  if (stock && typeof stock === "object" && !Array.isArray(stock)
      && (stock as Record<string, unknown>).outcome === "disabled") return true;
  // Live startup bale counts are provisional until the stock scan completes.
  return sectionComplete(outcomes, "stock");
}

function farmStockLiters(stock: unknown, farmId: number): number | null {
  if (!stock || typeof stock !== "object" || Array.isArray(stock)) return null;
  const byFarm = (
    stock as {
      byFarm?: Record<
        string,
        { items?: Array<{ totalLiters?: number; amount?: number; liters?: number }> }
      >;
    }
  ).byFarm;
  if (!byFarm || typeof byFarm !== "object" || Array.isArray(byFarm)) return null;
  const row = byFarm[String(farmId)] || byFarm[farmId as unknown as string];
  const items = Array.isArray(row?.items) ? row!.items! : [];
  let total = 0;
  for (const item of items) {
    // Live exports use totalLiters (see stock.byFarm[*].items); amount/liters are fallbacks.
    const n = Number(item.totalLiters ?? item.amount ?? item.liters ?? 0);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

function farmBaleCounts(
  baleInventory: unknown,
  farmId: number,
): { onField: number | null; inStorage: number | null } {
  if (!baleInventory || typeof baleInventory !== "object" || Array.isArray(baleInventory)) {
    return { onField: null, inStorage: null };
  }
  const inventory = baleInventory as Record<string, unknown>;
  const byFarm = inventory.byFarm;
  const hasFarmBuckets = byFarm && typeof byFarm === "object" && !Array.isArray(byFarm);
  const hasDirectBuckets = "onField" in inventory || "inStorage" in inventory || "offField" in inventory;
  if (!hasFarmBuckets && !hasDirectBuckets) return { onField: null, inStorage: null };
  // Live baleInventory buckets are { straw, grass, hay, silage, other } — not `.total`.
  const resolved = resolveBaleInventoryForFarm(
    inventory,
    farmId,
  );
  return {
    onField: sumBaleBucket(resolved.onField),
    inStorage: sumBaleBucket(resolved.inStorage),
  };
}

function countStorageItems(vehicles: unknown, farmId: number): number | null {
  if (!vehicles || typeof vehicles !== "object") return null;
  return normalizeVehicleList(vehicles).filter(
    (v) => vehicleMatchesActiveFarm(v, farmId) && isStorageItem(v as FleetVehicle),
  ).length;
}

function animalCountForFarm(animals: unknown, farmId: number): number | null {
  if (!Array.isArray(animals)) return null;
  let n = 0;
  for (const a of animals) {
    if (!a || typeof a !== "object") continue;
    const row = a as Record<string, unknown>;
    const fid = Number(row.ownerFarmId ?? row.farmId ?? 0);
    if (Number.isFinite(fid) && fid > 0 && fid !== farmId) continue;
    // Husbandry pens export animalCount; flattened RL rows are 1 head each.
    const heads = Number(row.animalCount ?? row.numAnimals ?? row.numOfAnimalsReported ?? 0);
    if (Number.isFinite(heads) && heads > 0) n += Math.floor(heads);
    else if (Array.isArray(row.clusters) || Array.isArray(row.animals) || row.lod != null) {
      // Empty pen / husbandry with no heads yet — do not count as 1 animal.
      continue;
    } else {
      n += 1;
    }
  }
  return n;
}

export function takeMajorDeltaSnapshot(input: {
  farmId: number;
  animals?: unknown;
  stock?: unknown;
  baleInventory?: unknown;
  vehicles?: unknown;
  sectionOutcomes?: unknown;
}): MajorDeltaSnapshot {
  const farmId = Number(input.farmId) || 1;
  const bales = farmBaleCounts(input.baleInventory, farmId);
  const balesReady = baleProvenanceReady(input.sectionOutcomes);
  return {
    animalCount: sectionComplete(input.sectionOutcomes, "animals")
      ? animalCountForFarm(input.animals, farmId) : null,
    stockLiters: sectionComplete(input.sectionOutcomes, "stock")
      ? farmStockLiters(input.stock, farmId) : null,
    balesOnField: balesReady ? bales.onField : null,
    balesInStorage: balesReady ? bales.inStorage : null,
    storageItemCount: sectionComplete(input.sectionOutcomes, "vehicles")
      ? countStorageItems(input.vehicles, farmId) : null,
  };
}

/** Only consecutive committed exports from the same live game session can create activity. */
export function majorDeltaStreamKey(scopeKey: string, sourceBinding: unknown): string | null {
  if (!sourceBinding || typeof sourceBinding !== "object" || Array.isArray(sourceBinding)) return null;
  const binding = sourceBinding as Record<string, unknown>;
  if (binding.stateStatus !== "snapshot") return null;
  const identity = binding.exportIdentity;
  if (!identity || typeof identity !== "object" || Array.isArray(identity)) return null;
  const exportIdentity = identity as Record<string, unknown>;
  const careerId = String(exportIdentity.careerId || "").trim();
  const sessionId = String(exportIdentity.sessionId || "").trim();
  const generation = Number(exportIdentity.exportGeneration);
  if (!careerId || !sessionId || !Number.isSafeInteger(generation) || generation < 1) return null;
  return `${scopeKey}::${careerId}::${sessionId}`;
}

/** An omitted section is not a zero reading; retain its last known value. */
export function mergeMajorDeltaSnapshot(
  prev: MajorDeltaSnapshot | null | undefined,
  next: MajorDeltaSnapshot,
): MajorDeltaSnapshot {
  return {
    animalCount: next.animalCount ?? prev?.animalCount ?? null,
    stockLiters: next.stockLiters ?? prev?.stockLiters ?? null,
    balesOnField: next.balesOnField ?? prev?.balesOnField ?? null,
    balesInStorage: next.balesInStorage ?? prev?.balesInStorage ?? null,
    storageItemCount: next.storageItemCount ?? prev?.storageItemCount ?? null,
  };
}

function emptyGroup(): MajorDeltaGroupState {
  return { baseline: null, candidate: null, candidateSamples: 0 };
}

function emptyGroups(): Record<MajorDeltaGroup, MajorDeltaGroupState> {
  return {
    animals: emptyGroup(),
    stock: emptyGroup(),
    bales: emptyGroup(),
    storageItems: emptyGroup(),
  };
}

function groupValue(snapshot: MajorDeltaSnapshot, group: MajorDeltaGroup): MajorDeltaGroupValue | null {
  if (group === "animals") return snapshot.animalCount;
  if (group === "stock") return snapshot.stockLiters;
  if (group === "storageItems") return snapshot.storageItemCount;
  if (snapshot.balesOnField === null || snapshot.balesInStorage === null) return null;
  return [snapshot.balesOnField, snapshot.balesInStorage];
}

function sameGroupValue(a: MajorDeltaGroupValue | null, b: MajorDeltaGroupValue | null): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a[0] === b[0] && a[1] === b[1];
  return a === b;
}

function groupEvents(
  group: MajorDeltaGroup,
  before: MajorDeltaGroupValue,
  after: MajorDeltaGroupValue,
): MajorDeltaEvent[] {
  const prev: MajorDeltaSnapshot = {
    animalCount: null, stockLiters: null, balesOnField: null,
    balesInStorage: null, storageItemCount: null,
  };
  const next = { ...prev };
  if (group === "animals") {
    prev.animalCount = before as number;
    next.animalCount = after as number;
  } else if (group === "stock") {
    prev.stockLiters = before as number;
    next.stockLiters = after as number;
  } else if (group === "storageItems") {
    prev.storageItemCount = before as number;
    next.storageItemCount = after as number;
  } else {
    [prev.balesOnField, prev.balesInStorage] = before as [number, number];
    [next.balesOnField, next.balesInStorage] = after as [number, number];
  }
  return diffMajorDeltas(prev, next);
}

/** Ignore same-generation UI merges and acquire two matching committed readings per category. */
export function advanceMajorDeltaTracker(
  state: MajorDeltaTrackerState | null | undefined,
  scopeKey: string,
  sourceBinding: unknown,
  snapshot: MajorDeltaSnapshot,
): { state: MajorDeltaTrackerState | null; events: MajorDeltaEvent[] } {
  const streamKey = majorDeltaStreamKey(scopeKey, sourceBinding);
  if (!streamKey) return { state: null, events: [] };
  const binding = sourceBinding as { exportIdentity: { exportGeneration: number } };
  const generation = Number(binding.exportIdentity.exportGeneration);
  if (state?.streamKey === streamKey && generation <= state.generation) {
    return { state, events: [] };
  }
  // Missing generations can conceal a partial collection: acquire a fresh baseline.
  const groups = state?.streamKey === streamKey && generation === state.generation + 1
    ? Object.fromEntries(DELTA_GROUPS.map((name) => [name, { ...state.groups[name] }])) as Record<MajorDeltaGroup, MajorDeltaGroupState>
    : emptyGroups();
  const events: MajorDeltaEvent[] = [];
  for (const name of DELTA_GROUPS) {
    const value = groupValue(snapshot, name);
    const group = groups[name];
    if (value === null) {
      groups[name] = emptyGroup();
    } else if (group.baseline === null) {
      if (sameGroupValue(group.candidate, value)) {
        group.candidateSamples += 1;
      } else {
        group.candidate = value;
        group.candidateSamples = 1;
      }
      if (group.candidateSamples >= 2) {
        group.baseline = value;
        group.candidate = null;
        group.candidateSamples = 0;
      }
    } else if (!sameGroupValue(group.baseline, value)) {
      events.push(...groupEvents(name, group.baseline, value));
      group.baseline = value;
    }
  }
  return { state: { streamKey, generation, groups }, events };
}

export function diffMajorDeltas(
  prev: MajorDeltaSnapshot | null | undefined,
  next: MajorDeltaSnapshot,
): MajorDeltaEvent[] {
  if (!prev) return [];
  const events: MajorDeltaEvent[] = [];

  const animalDelta = prev.animalCount !== null && next.animalCount !== null
    ? next.animalCount - prev.animalCount : 0;
  if (animalDelta > 0) {
    events.push({
      key: `animals:added:${next.animalCount}`,
      type: "success",
      title: t("changes.historyAnimalAddedTitleMany", { count: animalDelta }),
      message: t(
        animalDelta === 1 ? "changes.toastAnimalAddedOne" : "changes.toastAnimalAddedMany",
        { count: animalDelta, ids: "" },
      ),
    });
  } else if (animalDelta < 0) {
    const removed = Math.abs(animalDelta);
    events.push({
      key: `animals:removed:${next.animalCount}`,
      type: "info",
      title: t("changes.historyAnimalRemovedTitleMany", { count: removed }),
      message: t(
        removed === 1 ? "changes.toastAnimalRemovedOne" : "changes.toastAnimalRemovedMany",
        { count: removed, ids: "" },
      ),
    });
  }

  const stockDelta = prev.stockLiters !== null && next.stockLiters !== null
    ? next.stockLiters - prev.stockLiters : 0;
  if (Math.abs(stockDelta) >= STOCK_LITER_THRESHOLD) {
    if (stockDelta < 0) {
      events.push({
        key: `stock:sold:${Math.round(next.stockLiters ?? 0)}`,
        type: "info",
        title: t("changes.stockSoldTitle"),
        message: t("changes.stockSoldBody", {
          liters: Math.round(Math.abs(stockDelta)).toLocaleString(),
        }),
      });
    } else {
      events.push({
        key: `stock:bought:${Math.round(next.stockLiters ?? 0)}`,
        type: "success",
        title: t("changes.stockBoughtTitle"),
        message: t("changes.stockBoughtBody", {
          liters: Math.round(stockDelta).toLocaleString(),
        }),
      });
    }
  }

  const baleFieldDelta = prev.balesOnField !== null && next.balesOnField !== null
    ? next.balesOnField - prev.balesOnField : 0;
  const baleStoreDelta = prev.balesInStorage !== null && next.balesInStorage !== null
    ? next.balesInStorage - prev.balesInStorage : 0;
  const baleTotalDelta = baleFieldDelta + baleStoreDelta;
  if (Math.abs(baleTotalDelta) >= BALE_COUNT_THRESHOLD) {
    events.push({
      key: `bales:${next.balesOnField}:${next.balesInStorage}`,
      type: "info",
      title: t("changes.balesChangedTitle"),
      message: t("changes.balesChangedBody", {
        delta: baleTotalDelta > 0 ? `+${baleTotalDelta}` : String(baleTotalDelta),
        onField: next.balesOnField ?? 0,
        inStorage: next.balesInStorage ?? 0,
      }),
    });
  }

  const storageDelta = prev.storageItemCount !== null && next.storageItemCount !== null
    ? next.storageItemCount - prev.storageItemCount : 0;
  if (Math.abs(storageDelta) >= STORAGE_ITEM_THRESHOLD) {
    events.push({
      key: `storageItems:${next.storageItemCount}`,
      type: "info",
      title: t("changes.storageItemsChangedTitle"),
      message: t("changes.storageItemsChangedBody", {
        delta: storageDelta > 0 ? `+${storageDelta}` : String(storageDelta),
        count: next.storageItemCount ?? 0,
      }),
    });
  }

  return events;
}
