/**
 * Perennial mowable forage crops — cut with mower / forage header, not a grain combine.
 * FS25 base grass/meadow plus map/mod foliage such as alfalfa and clover.
 */

const MOWABLE_FORAGE_EXACT = new Set(["GRASS", "MEADOW", "ALFALFA", "CLOVER"]);

/** FS25 maps_fieldGround.xml density values 1–6 (prepared / sowable soil, no standing crop). */
const PREPARED_SEEDBED_NAMES = new Set([
  "STUBBLE_TILLAGE",
  "CULTIVATED",
  "SEEDBED",
  "PLOWED",
  "ROLLED_SEEDBED",
  "RIDGE",
]);

/**
 * @param {string} fruitTypeUpper
 * @returns {boolean}
 */
export function isMowableForageFruitType(fruitTypeUpper) {
  const ft = String(fruitTypeUpper || "").toUpperCase();
  if (!ft) return false;
  if (ft.includes("WINDROW") || ft.includes("BALE")) return false;
  if (MOWABLE_FORAGE_EXACT.has(ft)) return true;
  if (ft.includes("CLOVER") || ft.includes("MEADOW") || ft.includes("ALFALFA")) return true;
  return false;
}

/**
 * @param {{ fruitType?: string } | string | null | undefined} fieldOrFruitName
 * @returns {boolean}
 */
export function isMowableForageCrop(fieldOrFruitName) {
  if (fieldOrFruitName == null) return false;
  const ft =
    typeof fieldOrFruitName === "string"
      ? fieldOrFruitName
      : fieldOrFruitName.fruitType;
  return isMowableForageFruitType(ft);
}

/**
 * Prepared seedbed / tilled ground (cultivated, plowed, stubble tillage, …).
 * @param {unknown} groundType
 * @param {unknown} [groundTypeName]
 * @returns {boolean}
 */
export function isPreparedSeedbedGround(groundType, groundTypeName) {
  const n = Number(groundType);
  if (Number.isFinite(n) && n >= 1 && n <= 6) return true;
  const name = String(groundTypeName ?? groundType ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (!name) return false;
  if (PREPARED_SEEDBED_NAMES.has(name)) return true;
  return [...PREPARED_SEEDBED_NAMES].some((token) => name.includes(token));
}
