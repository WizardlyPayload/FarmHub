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
  animalCount: number;
  stockLiters: number;
  balesOnField: number;
  balesInStorage: number;
  storageItemCount: number;
}

export interface MajorDeltaEvent {
  key: string;
  type: "info" | "success" | "warning";
  title: string;
  message: string;
}

function farmStockLiters(stock: unknown, farmId: number): number {
  if (!stock || typeof stock !== "object") return 0;
  const byFarm = (
    stock as {
      byFarm?: Record<
        string,
        { items?: Array<{ totalLiters?: number; amount?: number; liters?: number }> }
      >;
    }
  ).byFarm;
  if (!byFarm) return 0;
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
): { onField: number; inStorage: number } {
  // Live baleInventory buckets are { straw, grass, hay, silage, other } — not `.total`.
  const resolved = resolveBaleInventoryForFarm(
    baleInventory as Record<string, unknown> | null | undefined,
    farmId,
  );
  return {
    onField: sumBaleBucket(resolved.onField),
    inStorage: sumBaleBucket(resolved.inStorage),
  };
}

function countStorageItems(vehicles: unknown, farmId: number): number {
  return normalizeVehicleList(vehicles).filter(
    (v) => vehicleMatchesActiveFarm(v, farmId) && isStorageItem(v as FleetVehicle),
  ).length;
}

function animalCountForFarm(animals: unknown, farmId: number): number {
  if (!Array.isArray(animals)) return 0;
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
}): MajorDeltaSnapshot {
  const farmId = Number(input.farmId) || 1;
  const bales = farmBaleCounts(input.baleInventory, farmId);
  return {
    animalCount: animalCountForFarm(input.animals, farmId),
    stockLiters: farmStockLiters(input.stock, farmId),
    balesOnField: bales.onField,
    balesInStorage: bales.inStorage,
    storageItemCount: countStorageItems(input.vehicles, farmId),
  };
}

export function diffMajorDeltas(
  prev: MajorDeltaSnapshot | null | undefined,
  next: MajorDeltaSnapshot,
): MajorDeltaEvent[] {
  if (!prev) return [];
  const events: MajorDeltaEvent[] = [];

  const animalDelta = next.animalCount - prev.animalCount;
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

  const stockDelta = next.stockLiters - prev.stockLiters;
  if (Math.abs(stockDelta) >= STOCK_LITER_THRESHOLD) {
    if (stockDelta < 0) {
      events.push({
        key: `stock:sold:${Math.round(next.stockLiters)}`,
        type: "info",
        title: t("changes.stockSoldTitle"),
        message: t("changes.stockSoldBody", {
          liters: Math.round(Math.abs(stockDelta)).toLocaleString(),
        }),
      });
    } else {
      events.push({
        key: `stock:bought:${Math.round(next.stockLiters)}`,
        type: "success",
        title: t("changes.stockBoughtTitle"),
        message: t("changes.stockBoughtBody", {
          liters: Math.round(stockDelta).toLocaleString(),
        }),
      });
    }
  }

  const baleFieldDelta = next.balesOnField - prev.balesOnField;
  const baleStoreDelta = next.balesInStorage - prev.balesInStorage;
  const baleTotalDelta = baleFieldDelta + baleStoreDelta;
  if (Math.abs(baleTotalDelta) >= BALE_COUNT_THRESHOLD) {
    events.push({
      key: `bales:${next.balesOnField}:${next.balesInStorage}`,
      type: "info",
      title: t("changes.balesChangedTitle"),
      message: t("changes.balesChangedBody", {
        delta: baleTotalDelta > 0 ? `+${baleTotalDelta}` : String(baleTotalDelta),
        onField: next.balesOnField,
        inStorage: next.balesInStorage,
      }),
    });
  }

  const storageDelta = next.storageItemCount - prev.storageItemCount;
  if (Math.abs(storageDelta) >= STORAGE_ITEM_THRESHOLD) {
    events.push({
      key: `storageItems:${next.storageItemCount}`,
      type: "info",
      title: t("changes.storageItemsChangedTitle"),
      message: t("changes.storageItemsChangedBody", {
        delta: storageDelta > 0 ? `+${storageDelta}` : String(storageDelta),
        count: next.storageItemCount,
      }),
    });
  }

  return events;
}
