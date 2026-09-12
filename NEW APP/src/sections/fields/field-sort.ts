import { rfSoilUrgency } from "@/lib/realisticFarming/land";
import type { FieldRecord } from "@/lib/rules-engine";
import { getFieldStatus } from "./field-helpers";
import type { FieldStatus } from "./types";

export type FieldCardSortMode = "number" | "crop" | "size" | "work" | "soil";

const FIELD_SORT_STORAGE_KEY = "farmdash_fields_sort_v1";

const WORK_RANK: Record<FieldStatus, number> = {
  harvest: 0,
  needswork: 1,
  growing: 2,
  empty: 3,
};

function assertNever(value: never): never {
  throw new Error(`unhandled field sort: ${String(value)}`);
}

export function parseFieldCardSortMode(raw: string | null | undefined): FieldCardSortMode {
  if (raw === "crop" || raw === "size" || raw === "work" || raw === "soil" || raw === "number") {
    return raw;
  }
  return "number";
}

export function readFieldCardSortPref(): FieldCardSortMode {
  try {
    return parseFieldCardSortMode(localStorage.getItem(FIELD_SORT_STORAGE_KEY));
  } catch {
    return "number";
  }
}

export function writeFieldCardSortPref(mode: FieldCardSortMode) {
  try {
    localStorage.setItem(FIELD_SORT_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/** Lowest farmland id on the card (merged GPS blobs use the smallest id). */
export function fieldCardNumber(field: FieldRecord | null | undefined): number {
  const fromCluster = Array.isArray(field?._clusterFieldIds)
    ? field._clusterFieldIds
        .map((n: unknown) => Number(n))
        .filter((n: number) => Number.isFinite(n) && n > 0)
    : [];
  if (fromCluster.length) return Math.min(...fromCluster);
  const n = Number(field?.farmlandId ?? field?.id);
  return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
}

export function fieldCropSortKey(field: FieldRecord | null | undefined): string {
  const raw = String(field?.fruitType || "")
    .trim()
    .toLowerCase();
  if (!raw || raw === "empty" || raw === "unknown") return "\uFFFF";
  return raw;
}

function compareByNumber(a: FieldRecord, b: FieldRecord): number {
  const delta = fieldCardNumber(a) - fieldCardNumber(b);
  if (delta !== 0) return delta;
  return String(a?._displayClusterId || a?.id || "").localeCompare(
    String(b?._displayClusterId || b?.id || ""),
  );
}

export function resolveFieldCardSortMode(
  mode: FieldCardSortMode,
  soilActive: boolean,
): FieldCardSortMode {
  return mode === "soil" && !soilActive ? "number" : mode;
}

export function sortFieldCards(
  rows: FieldRecord[],
  mode: FieldCardSortMode,
  opts: { soilActive?: boolean } = {},
): FieldRecord[] {
  const list = Array.isArray(rows) ? rows.slice() : [];
  const resolved = resolveFieldCardSortMode(mode, opts.soilActive === true);

  list.sort((a, b) => {
    switch (resolved) {
      case "number":
        return compareByNumber(a, b);
      case "crop": {
        const crop = fieldCropSortKey(a).localeCompare(fieldCropSortKey(b));
        return crop !== 0 ? crop : compareByNumber(a, b);
      }
      case "size": {
        const size = (Number(b?.hectares) || 0) - (Number(a?.hectares) || 0);
        return size !== 0 ? size : compareByNumber(a, b);
      }
      case "work": {
        const rankA = WORK_RANK[getFieldStatus(a)] ?? 99;
        const rankB = WORK_RANK[getFieldStatus(b)] ?? 99;
        if (rankA !== rankB) return rankA - rankB;
        return compareByNumber(a, b);
      }
      case "soil": {
        const urgencyA = rfSoilUrgency(a?.soilFertilizer);
        const urgencyB = rfSoilUrgency(b?.soilFertilizer);
        if (urgencyA == null && urgencyB == null) return compareByNumber(a, b);
        if (urgencyA == null) return 1;
        if (urgencyB == null) return -1;
        if (urgencyA !== urgencyB) return urgencyB - urgencyA;
        return compareByNumber(a, b);
      }
      default:
        return assertNever(resolved);
    }
  });

  return list;
}
