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

/**
 * @param {string} fruitTypeUpper
 * @returns {string}
 */
function normalizeFruitToken(fruitTypeUpper) {
  return String(fruitTypeUpper || "")
    .toUpperCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * @param {string} fruitTypeUpper
 * @returns {boolean}
 */
export function isCoverCropFruitType(fruitTypeUpper) {
  const ft = normalizeFruitToken(fruitTypeUpper);
  if (!ft) return false;
  if (COVER_CROP_EXACT.has(ft)) return true;
  const compact = ft.replace(/_/g, "");
  if (compact === "OILSEEDRADISH" || compact === "MUSTARD") return true;
  return false;
}

/**
 * @param {{ fruitType?: string } | string | null | undefined} fieldOrFruitName
 * @returns {boolean}
 */
export function isCoverCrop(fieldOrFruitName) {
  if (fieldOrFruitName == null) return false;
  const ft =
    typeof fieldOrFruitName === "string" ? fieldOrFruitName : fieldOrFruitName.fruitType;
  return isCoverCropFruitType(ft ?? "");
}
