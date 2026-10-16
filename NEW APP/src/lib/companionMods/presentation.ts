/** Pure layout decisions for companion mods: which get a designed panel, and the crop calendar grid. */

import { catalogEntry, companionSupport, type CompanionCatalogEntry, type CompanionCategory } from "./catalog";
import type { CompanionModRow, CompanionModsPayload } from "./index";

export const CALENDAR_PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** Why a detected mod is listed compactly instead of getting a live panel. */
export type CompanionListedReason = "detection-only" | "unmapped" | "no-reading";

export type CompanionTier =
  | { tier: "live" }
  | { tier: "listed"; reason: CompanionListedReason };

export type CompanionItem = {
  row: CompanionModRow;
  entry: CompanionCatalogEntry;
  title: string;
  category: CompanionCategory;
  placement: CompanionTier;
};

/** Stable DOM id for a mod's panel on its home page. */
export function companionPanelId(id: string | undefined | null): string {
  return `fd-companion-${String(id || "unknown").replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

/** A mod earns a live panel only when FarmHub reads it and the export carries its block. */
export function companionTier(entry: CompanionCatalogEntry, payload: CompanionModsPayload | null | undefined): CompanionTier {
  const support = companionSupport(entry);
  if (support === "detection-only") return { tier: "listed", reason: "detection-only" };
  if (support === "unmapped" || !entry.liveKey) return { tier: "listed", reason: "unmapped" };
  const block = (payload as Record<string, unknown> | null | undefined)?.[entry.liveKey];
  if (!block || typeof block !== "object" || (block as { enabled?: unknown }).enabled !== true) {
    return { tier: "listed", reason: "no-reading" };
  }
  return { tier: "live" };
}

export function companionItem(row: CompanionModRow, payload: CompanionModsPayload | null | undefined, genericDesc: string): CompanionItem {
  const known = catalogEntry(row.id);
  const entry: CompanionCatalogEntry = known ?? {
    id: String(row.id || "unknown"),
    title: String(row.title || row.id || "Mod"),
    category: (row.category as CompanionCategory) || "economy",
    descKey: "",
    desc: genericDesc,
  };
  return {
    row,
    entry,
    title: row.title || entry.title,
    category: ((row.category as CompanionCategory) || entry.category) as CompanionCategory,
    placement: companionTier(entry, payload),
  };
}

export type CalendarMark = "plant" | "harvest" | "both" | null;

export type CropCalendarRow = {
  crop: string;
  label: string;
  mapCalendar: boolean;
  complete: boolean;
  cells: CalendarMark[];
};

export type CropCalendarGrid =
  | { status: "unavailable" }
  | { status: "pending"; region: string }
  | { status: "ok"; region: string; rows: CropCalendarRow[]; partial: boolean; currentPeriod: number | null };

type CropCalendarBlock = CompanionModsPayload["cropCalendar"];

function periodSet(value: unknown): Set<number> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter((p): p is number => typeof p === "number" && Number.isInteger(p) && p >= 1 && p <= 12));
}

/** "GREENBEAN" -> "Greenbean"; names that already carry lower case are kept. */
export function cropLabel(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "" || trimmed !== trimmed.toUpperCase()) return trimmed;
  return trimmed
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function validPeriod(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 12 ? value : null;
}

/**
 * Crop x period grid from the calendar reading. Mirrors `cropRegionView`: no verified region, no grid.
 * `currentPeriod` is only a highlight hint and is dropped unless it is a real 1-12 period.
 */
export function cropCalendarGrid(block: CropCalendarBlock | null | undefined, currentPeriod?: unknown): CropCalendarGrid {
  if (!block?.enabled || block.readState !== "ok") return { status: "unavailable" };
  if (typeof block.selectedRegion !== "string" || block.selectedRegion.trim() === "") return { status: "unavailable" };
  const region = block.selectedRegion;
  if (block.calendarsReadState !== "ok" && block.calendarsReadState !== "partial") return { status: "pending", region };
  const crops = Array.isArray(block.crops) ? block.crops : [];
  const rows: CropCalendarRow[] = crops
    .filter((crop) => crop && typeof crop.crop === "string" && crop.crop.trim() !== "")
    .map((crop) => {
      const complete = crop.readState === "ok";
      const plant = complete ? periodSet(crop.plantingPeriods) : new Set<number>();
      const harvest = complete ? periodSet(crop.harvestPeriods) : new Set<number>();
      return {
        crop: crop.crop,
        label: cropLabel(crop.crop),
        mapCalendar: crop.source === "map-calendar",
        complete,
        cells: CALENDAR_PERIODS.map((p) =>
          plant.has(p) && harvest.has(p) ? "both" : plant.has(p) ? "plant" : harvest.has(p) ? "harvest" : null,
        ),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
  return {
    status: "ok",
    region,
    rows,
    partial: block.coverage !== "complete" || rows.some((row) => !row.complete),
    currentPeriod: validPeriod(currentPeriod),
  };
}
