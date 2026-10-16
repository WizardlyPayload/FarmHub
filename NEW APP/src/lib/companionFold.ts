/**
 * Companion mods read on FarmHub's own pages instead of a dedicated mod page. Each reads the mod's
 * `companionPages.pages.<key>` export and shows only when the mod is detected in the save.
 */

import { useMemo } from "preact/hooks";
import { useDashboardStore } from "@/store/dashboard-store";
import type { FoldedCompanionKey } from "@/lib/foldedCompanions";

export { FOLDED_COMPANIONS, FOLDED_COMPANION_IDS, isFoldedCompanion, type FoldedCompanionKey } from "@/lib/foldedCompanions";

export type FoldedReading = {
  detected: boolean;
  page: Record<string, unknown> | null;
  farmData: Record<string, unknown> | null;
};

const NOT_DETECTED: FoldedReading = { detected: false, page: null, farmData: null };

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** The mod's page export and this farm's slice; empty unless the mod is detected. */
export function readFoldedCompanion(payload: unknown, key: FoldedCompanionKey, farmId: number): FoldedReading {
  const root = asObject(payload);
  const page = asObject(asObject(asObject(root?.companionPages)?.pages)?.[key]);
  const mods = asObject(root?.companionMods)?.mods;
  const listed = Array.isArray(mods) && mods.some((m) => asObject(m)?.id === key && asObject(m)?.detected === true);
  if (page?.detected !== true && !listed) return NOT_DETECTED;
  const farmData = asObject(asObject(page?.byFarm)?.[String(farmId)]);
  return { detected: true, page, farmData };
}

export function useFoldedCompanion(key: FoldedCompanionKey): FoldedReading {
  const payload = useDashboardStore((s) => s.payload);
  const farmId = Number(useDashboardStore((s) => s.activeFarmId) ?? 1) || 1;
  return useMemo(() => readFoldedCompanion(payload, key, farmId), [payload, key, farmId]);
}

export function listOf<T = Record<string, unknown>>(value: unknown): T[] {
  return Array.isArray(value) ? (value.filter((v) => v != null && typeof v === "object") as T[]) : [];
}

export function finite(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/* ── Vehicles: companion rows carry `uniqueId`, or the engine vehicle id when there is none ── */

export type VehicleIdentity = { id?: string | number | null; uniqueId?: string | null };

export function indexVehicleRows<T extends { id?: string | number }>(rows: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const row of rows) {
    if (row.id != null && row.id !== "") out.set(String(row.id), row);
  }
  return out;
}

export function vehicleRowFor<T>(index: Map<string, T>, vehicle: VehicleIdentity | null | undefined): T | undefined {
  if (!vehicle || index.size === 0) return undefined;
  if (vehicle.uniqueId) {
    const hit = index.get(String(vehicle.uniqueId));
    if (hit) return hit;
  }
  return vehicle.id != null ? index.get(String(vehicle.id)) : undefined;
}

export const KM_PER_MILE = 1.609344;

/* ── Productions: Production Watcher points carry the point's name and storage, not the chain id ── */

export type WatcherStorageRow = {
  fillType?: string;
  title?: string;
  role?: "input" | "output";
  level?: number;
  capacity?: number;
  percent?: number;
};

export type WatcherPoint = {
  farmId?: number;
  id?: string | number;
  name?: string;
  watched?: boolean;
  productions?: number;
  active?: number;
  inputAlert?: "low" | "missing";
  outputAlert?: "nearlyFull" | "full";
  storage?: WatcherStorageRow[];
};

export type WatcherLevel = "missing" | "low" | "nearlyFull" | "full";

/** Production Watcher's thresholds: input empty / under 5 %, output over 95 % / 99.5 %. */
export function watcherLevel(row: WatcherStorageRow): WatcherLevel | null {
  const pct = finite(row.percent);
  if (pct == null) return null;
  if (row.role === "input") return pct <= 0 ? "missing" : pct < 5 ? "low" : null;
  if (row.role === "output") return pct > 99.5 ? "full" : pct > 95 ? "nearlyFull" : null;
  return null;
}

export function watcherTone(level: WatcherLevel | null | undefined): "warn" | "danger" | undefined {
  if (level === "missing" || level === "full") return "danger";
  if (level === "low" || level === "nearlyFull") return "warn";
  return undefined;
}

/** Per fill type (upper-cased name) alert for one point's input or output storage. */
export function watcherLevelsByFillType(point: WatcherPoint | null | undefined, role: "input" | "output"): Map<string, WatcherLevel> {
  const out = new Map<string, WatcherLevel>();
  for (const row of listOf<WatcherStorageRow>(point?.storage)) {
    if (row.role !== role || !row.fillType) continue;
    const level = watcherLevel(row);
    if (level) out.set(row.fillType.toUpperCase(), level);
  }
  return out;
}

function nameKey(name: unknown): string {
  return typeof name === "string" ? name.trim().toLowerCase() : "";
}

type ChainLike = {
  name?: string;
  inputFillLevels?: Record<string, number>;
  outputFillLevels?: Record<string, number>;
};

function storageAgreement(chain: ChainLike, point: WatcherPoint): number {
  const levels: Record<string, number> = {};
  for (const [k, v] of Object.entries({ ...(chain.inputFillLevels ?? {}), ...(chain.outputFillLevels ?? {}) })) {
    levels[k.toUpperCase()] = Number(v);
  }
  let score = 0;
  for (const row of listOf<WatcherStorageRow>(point.storage)) {
    const level = finite(row.level);
    const mine = row.fillType ? levels[row.fillType.toUpperCase()] : undefined;
    if (level != null && mine != null && Number.isFinite(mine) && Math.abs(mine - level) < 1) score += 1;
  }
  return score;
}

/**
 * The watcher point for a production chain: same point name, and when two points share a name the
 * one whose stored levels agree with the chain. Ambiguous matches are left out rather than guessed.
 */
export function watcherPointForChain(chain: ChainLike, points: WatcherPoint[]): WatcherPoint | undefined {
  const key = nameKey(chain.name);
  if (!key) return undefined;
  const named = points.filter((p) => nameKey(p.name) === key);
  if (named.length <= 1) return named[0];
  const scored = named.map((p) => ({ p, score: storageAgreement(chain, p) })).sort((a, b) => b.score - a.score);
  return scored[0].score > 0 && scored[0].score > scored[1].score ? scored[0].p : undefined;
}

/* ── Storage: Time Saving Stock Check rows by fill type name ── */

export type StockCheckGuide = "great" | "veryGood" | "good" | "normal" | "noSellPoint";

export type StockCheckItem = {
  fillType?: string;
  title?: string;
  liters?: number;
  guide?: StockCheckGuide;
  greatDemand?: boolean;
  bestPricePer1000?: number;
  bestPeriod?: number;
};

export function indexStockCheckItems(items: StockCheckItem[]): Map<string, StockCheckItem> {
  const out = new Map<string, StockCheckItem>();
  for (const item of items) {
    if (item.fillType) out.set(item.fillType.toUpperCase(), item);
  }
  return out;
}
