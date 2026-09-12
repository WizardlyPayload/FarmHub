/**
 * Catch / cover crops — cultivated in for a fertilisation stage, not combine-harvested.
 * Base FS25: oilseed radish. Map/mod fruit types (e.g. Witcombe Park mustard) that play
 * the same green-manure role are included by exact name / alias.
 */

const COVER_CROP_EXACT = new Set([
  "OILSEEDRADISH",
  "OILSEED_RADISH",
  "OIL_SEED_RADISH",
  "MUSTARD",
]);

function normalizeFruitToken(fruitTypeUpper: string): string {
  return String(fruitTypeUpper || "")
    .toUpperCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function isCoverCropFruitType(fruitTypeUpper: string): boolean {
  const ft = normalizeFruitToken(fruitTypeUpper);
  if (!ft) return false;
  if (COVER_CROP_EXACT.has(ft)) return true;
  // Compact form without underscores (engine often exports OILSEEDRADISH).
  const compact = ft.replace(/_/g, "");
  if (compact === "OILSEEDRADISH" || compact === "MUSTARD") return true;
  return false;
}

export function isCoverCrop(
  fieldOrFruitName: { fruitType?: string } | string | null | undefined,
): boolean {
  if (fieldOrFruitName == null) return false;
  const ft =
    typeof fieldOrFruitName === "string" ? fieldOrFruitName : fieldOrFruitName.fruitType;
  return isCoverCropFruitType(ft ?? "");
}
