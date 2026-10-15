/** Crop x period grid for the Regional Crop Calendar page (same layout rules as the companion panel grid). */

export const CALENDAR_PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export type CalendarMark = "plant" | "harvest" | "both" | null;

export type CalendarCropInput = {
  crop?: unknown;
  plantingPeriods?: unknown;
  harvestPeriods?: unknown;
  complete?: unknown;
  source?: unknown;
};

export type CalendarRow = {
  crop: string;
  label: string;
  mapCalendar: boolean;
  complete: boolean;
  cells: CalendarMark[];
  /** Planting is allowed in the current period. */
  plantNow: boolean;
  /** Harvest is possible in the current period. */
  harvestNow: boolean;
};

function periodSet(value: unknown): Set<number> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter((p): p is number => typeof p === "number" && Number.isInteger(p) && p >= 1 && p <= 12));
}

/** "SUGARBEET" -> "Sugarbeet", "GRASS_MIX" -> "Grass Mix"; names that already carry lower case are kept. */
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

export function validPeriod(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 12 ? value : null;
}

export function calendarRows(crops: CalendarCropInput[], currentPeriod: number | null): CalendarRow[] {
  return crops
    .filter((c): c is CalendarCropInput & { crop: string } => typeof c.crop === "string" && c.crop.trim() !== "")
    .map((c) => {
      const complete = c.complete === true;
      const plant = complete ? periodSet(c.plantingPeriods) : new Set<number>();
      const harvest = complete ? periodSet(c.harvestPeriods) : new Set<number>();
      return {
        crop: c.crop,
        label: cropLabel(c.crop),
        mapCalendar: c.source === "map-calendar",
        complete,
        cells: CALENDAR_PERIODS.map((p) =>
          plant.has(p) && harvest.has(p) ? "both" : plant.has(p) ? "plant" : harvest.has(p) ? "harvest" : null,
        ),
        plantNow: currentPeriod != null && plant.has(currentPeriod),
        harvestNow: currentPeriod != null && harvest.has(currentPeriod),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}
