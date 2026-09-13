/** Economy section pure helpers — finance, purchases, consumables, bales, market. */

import { t } from "@/i18n/i18n";
import { isStorageItem as isFleetStorageItem } from "@/lib/fleet-classify";

export type BaleCategoryKey = "straw" | "grass" | "hay" | "silage" | "other";

export const BALE_CATEGORY_KEYS: BaleCategoryKey[] = ["straw", "grass", "hay", "silage", "other"];

export interface BaleBucket {
  straw: number;
  grass: number;
  hay: number;
  silage: number;
  other: number;
  byFillType?: Record<string, number>;
}

export interface VehicleLike {
  ownerFarmId?: number;
  farmId?: number;
  name?: string;
  typeName?: string;
  filename?: string;
  vehicleType?: string;
  brand?: string | { title?: string; name?: string; label?: string; displayName?: string };
  price?: number;
  damage?: number;
  age?: number;
  operatingTime?: number;
  fillLevels?: Record<string, { level?: number; capacity?: number }>;
  [key: string]: unknown;
}

export interface FarmInfoRow {
  id?: number;
  money?: number;
  loan?: number;
  [key: string]: unknown;
}

export interface FinanceLike {
  buildings?: { totalValue?: number };
  animals?: { totalValue?: number };
  land?: { totalValue?: number };
  [key: string]: unknown;
}

export interface FieldLike {
  ownerFarmId?: number;
  farmId?: number;
  baleCountOnField?: number;
  baleOnFieldByCategory?: Partial<BaleBucket> & { byFillType?: Record<string, number> };
  [key: string]: unknown;
}

export interface MarketCropLocation {
  name?: string;
  price?: number;
}

export interface MarketCrop {
  avgPrice?: number;
  locations?: MarketCropLocation[];
  fillTypeIndex?: number;
  [key: string]: unknown;
}

export interface MarketSellPoint {
  name?: string;
  isSpecialEvent?: boolean;
  prices?: Record<string, { price?: number; multiplier?: number; isSpecialEvent?: boolean; fillTypeIndex?: number }>;
  position?: { x?: number; y?: number; z?: number };
  x?: number;
  z?: number;
}

export interface MarketPrices {
  crops?: Record<string, MarketCrop>;
  sellPoints?: MarketSellPoint[] | Record<string, MarketSellPoint>;
  [key: string]: unknown;
}

const CONSUMABLE_FULL_PCT = 95;

const LIVESTOCK_ANIMALS = new Set([
  "COW_ANGUS",
  "COW_SWISS_BROWN",
  "BULL_ANGUS",
  "BULL_SWISS_BROWN",
  "PIG_BLACK_PIED",
  "BOAR_BLACK_PIED",
  "SHEEP_BLACK_WELSH",
  "RAM_BLACK_WELSH",
  "GOAT",
  "HORSE",
  "CHICKEN",
  "ROOSTER",
]);

const CROP_CATEGORY = new Set([
  "WHEAT",
  "BARLEY",
  "OAT",
  "CANOLA",
  "SORGHUM",
  "CORN",
  "MAIZE",
  "SUGAR_BEET",
  "SUGARBEET",
  "POTATO",
  "POTATOES",
  "COTTON",
  "SUNFLOWER",
  "SUGARCANE",
  "OLIVES",
  "OLIVE",
  "GRAPES",
  "GRAPE",
  "CARROTS",
  "CARROT",
  "PARSNIPS",
  "PARSNIP",
  "RED_BEET",
  "PEAS",
  "PEA",
  "SPINACH",
  "GREEN_BEANS",
  "SOYBEANS",
  "SOYBEAN",
  "LONG_GRAIN_RICE",
  "RICE",
]);

const PRODUCT_CATEGORY = new Set([
  "FLOUR",
  "BREAD",
  "CHEESE",
  "BUFFALO_MOZZARELLA",
  "GOAT_CHEESE",
  "BUTTER",
  "CHOCOLATE",
  "OLIVE_OIL",
  "CANOLA_OIL",
  "SUNFLOWER_OIL",
  "RICE_OIL",
  "GRAPE_JUICE",
  "RAISINS",
  "CEREAL",
  "POTATO_CHIPS",
  "SPINACH_BAG",
  "RICE_FLOUR",
  "RICE_BOXES",
  "RICE_BAGS",
  "FABRIC",
  "CLOTHES",
  "CAKE",
  "CANNED_PEAS",
  "TRIPLE_SOUP",
  "CARROT_SOUP",
  "PIZZA",
  "SUGAR",
  "LEMON",
  "ORANGE",
  "PEAR",
  "PLUM",
  "APPLE",
  "MILK",
  "COW_MILK",
  "COW_MILK_BOTTLED",
  "BUFFALO_MILK",
  "BUFFALO_MILK_BOTTLED",
  "GOAT_MILK",
  "GOAT_MILK_BOTTLED",
  "EGGS",
  "EGG",
  "WOOL",
  "HONEY",
  "WATER",
  "CREAM",
  "KEFIR",
  "YOGURT",
]);

const GREENERY_CATEGORY = new Set([
  "GRASS",
  "HAY",
  "STRAW",
  "WOOD_CHIPS",
  "WOODCHIPS",
  "SILAGE",
  "CHAFF",
  "TREE",
  "WOOD",
  "POPLAR",
]);

const GREENHOUSE_CATEGORY = new Set([
  "STRAWBERRIES",
  "LETTUCE",
  "TOMATOES",
  "TOMATO",
  "CABBAGE",
  "SPRING_ONIONS",
  "SPRING_ONION",
  "GARLIC",
  "OYSTER_MUSHROOM",
  "OYSTER",
  "ENOKI",
  "CHILI_PEPPERS",
  "CHILLI",
  "RICE_SAPLINGS",
]);

const YIELD_BOOST_CATEGORY = new Set([
  "MANURE",
  "SLURRY",
  "OILSEED_RADISH",
  "OILSEEDRADISH",
  "OIL_SEED_RADISH",
  "MUSTARD",
  "LIME",
  "SOLID_FERTILIZER",
  "LIQUID_FERTILIZER",
  "HERBICIDE",
  "SILAGE_ADDITIVE",
  "DIGESTATE",
]);

const CROP_MAPPINGS: Record<string, string> = {
  WHEAT: "Wheat",
  BARLEY: "Barley",
  CANOLA: "Canola",
  CORN: "Corn",
  MAIZE: "Corn",
  SOYBEANS: "Soybeans",
  SOYBEAN: "Soybeans",
  SUNFLOWER: "Sunflower",
  COTTON: "Cotton",
  SUGARCANE: "Sugar Cane",
  SUGAR_BEET: "Sugar Beet",
  SUGARBEET: "Sugar Beet",
  POTATO: "Potato",
  POTATOES: "Potatoes",
  OAT: "Oat",
  OATS: "Oats",
  RYE: "Rye",
  RICE: "Rice",
  MILK: "Milk",
  EGGS: "Eggs",
  WOOL: "Wool",
  HONEY: "Honey",
  FLOUR: "Flour",
  BREAD: "Bread",
  BUTTER: "Butter",
  CHEESE: "Cheese",
  CHOCOLATE: "Chocolate",
  FABRIC: "Fabric",
  CLOTHES: "Clothes",
  SILAGE: "Silage",
  HAY: "Hay",
  STRAW: "Straw",
  GRASS: "Grass",
  CHAFF: "Chaff",
  WOODCHIPS: "Wood Chips",
  WATER: "Water",
  DIESEL: "Diesel",
  LIME: "Lime",
  FERTILIZER: "Fertilizer",
  LIQUID_FERTILIZER: "Liquid Fertilizer",
  HERBICIDE: "Herbicide",
  SEEDS: "Seeds",
  PIGFOOD: "Pig Food",
};

export function humanizeFillTypeName(fillType: unknown): string {
  return String(fillType || "Unknown")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function vehicleMatchesActiveFarm(v: VehicleLike | null | undefined, activeFarmId: number | null | undefined): boolean {
  const vf = Number(v?.ownerFarmId ?? v?.farmId ?? 0);
  const af = Number(activeFarmId ?? 1);
  return Number.isFinite(vf) && Number.isFinite(af) && vf === af;
}

export function resolveVehicleBrandLabel(brand: VehicleLike["brand"]): string {
  if (brand == null || brand === "") return "";
  if (typeof brand === "object") {
    return String(brand.title || brand.name || brand.label || brand.displayName || "").trim();
  }
  return String(brand).trim();
}

export function resolveVehicleDisplayName(vehicle: VehicleLike | null | undefined): string {
  if (!vehicle || typeof vehicle !== "object") return "—";
  const n = String(vehicle.name ?? "").trim();
  if (n) return n;
  const tn = String(vehicle.typeName ?? "").trim();
  if (tn) return tn;
  return "—";
}

export function isStorageItem(vehicle: VehicleLike | null | undefined): boolean {
  return isFleetStorageItem(vehicle);
}

export function filterFieldsForFarmView(fields: FieldLike[] | null | undefined, farmId: number | null | undefined): FieldLike[] {
  if (!Array.isArray(fields)) return [];
  const fid = Number(farmId);
  return fields.filter((f) => {
    if (!f) return false;
    const oid = Number(f.ownerFarmId ?? f.farmId ?? 0);
    return oid === fid;
  });
}

export function formatCurrency(amount: unknown): string {
  const n = Number(amount) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function calculateCondition(damage: unknown): { text: string; tone: "accent" | "default" | "warn" | "danger" } {
  const condition = Math.max(0, 100 - Number(damage || 0) * 100);
  if (condition >= 80) return { text: t("economy.conditionExcellent"), tone: "accent" };
  if (condition >= 60) return { text: t("economy.conditionGood"), tone: "default" };
  if (condition >= 40) return { text: t("economy.conditionFair"), tone: "warn" };
  return { text: t("economy.conditionPoor"), tone: "danger" };
}

export function calculateTotalPurchases(vehicles: VehicleLike[] | null | undefined, targetFarmId = 1): number {
  return (vehicles || [])
    .filter((v) => vehicleMatchesActiveFarm(v, targetFarmId))
    .reduce((total, vehicle) => total + (Number(vehicle.price) || 0), 0);
}

export function computeFinancialSummary(data: {
  farmInfo?: FarmInfoRow[] | null;
  money?: number;
  loan?: number;
  finance?: FinanceLike | null;
  vehicles?: VehicleLike[] | null;
  activeFarmId?: number | null;
}): { money: number; loan: number; totalPurchases: number; netWorth: number } {
  const activeFarmId = Number(data.activeFarmId ?? 1) || 1;
  let money = 0;
  let loan = 0;

  const farmInfo = Array.isArray(data.farmInfo) ? data.farmInfo : [];
  const activeFarm = farmInfo.find((farm) => Number(farm.id) === activeFarmId);
  if (activeFarm) {
    money = Number(activeFarm.money) || 0;
    loan = Number(activeFarm.loan) || 0;
  } else if (data.money !== undefined) {
    money = Number(data.money) || 0;
    loan = Number(data.loan) || 0;
  }

  let totalPurchases = calculateTotalPurchases(data.vehicles || [], activeFarmId);
  if (data.finance && typeof data.finance === "object") {
    totalPurchases +=
      (Number(data.finance.buildings?.totalValue) || 0) +
      (Number(data.finance.animals?.totalValue) || 0) +
      (Number(data.finance.land?.totalValue) || 0);
  }

  return {
    money,
    loan,
    totalPurchases,
    netWorth: money + totalPurchases - loan,
  };
}

export function getConsumablePrimaryFill(
  vehicle: VehicleLike
): { fillType: string; level: number; capacity: number; pct: number } | null {
  const levels = vehicle?.fillLevels || {};
  let best: { fillType: string; level: number; capacity: number; pct: number } | null = null;
  for (const [type, data] of Object.entries(levels)) {
    if (!data || typeof data !== "object") continue;
    const level = Number(data.level) || 0;
    const capacity = Number(data.capacity) || 0;
    if (level <= 0 && capacity <= 0) continue;
    const pct = capacity > 0 ? Math.min(100, Math.round((level / capacity) * 100)) : 0;
    if (!best || level > best.level) {
      best = { fillType: type, level, capacity, pct };
    }
  }
  return best;
}

export function getConsumableContainerKind(vehicle: VehicleLike): "pallet" | "bigBag" | "ibc" {
  if (!vehicle || typeof vehicle !== "object") return "pallet";
  const brandLabel =
    vehicle.brand && (typeof vehicle.brand === "string" ? vehicle.brand : vehicle.brand.name || "");
  const blob = [vehicle.typeName, vehicle.name, vehicle.filename, vehicle.vehicleType, brandLabel]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase())
    .join(" ");
  if (blob.includes("bigbag") || blob.includes("big_bag") || /\bbig\s+bag\b/.test(blob)) return "bigBag";
  if (/\bibc\b/.test(blob) || blob.includes("liquidtank") || blob.includes("liquid_tank") || blob.includes("bulkliquid")) {
    return "ibc";
  }
  return "pallet";
}

function inferFillTypeFromVehicleName(vehicle: VehicleLike): string {
  const blob = String(`${vehicle?.name || ""} ${vehicle?.typeName || ""} ${vehicle?.filename || ""}`).toUpperCase();
  if (blob.includes("LIME")) return "LIME";
  if (blob.includes("HERBICIDE")) return "HERBICIDE";
  if (blob.includes("LIQUID_FERT") || blob.includes("LIQUID FERT")) return "LIQUID_FERTILIZER";
  if (blob.includes("FERTILIZER") || blob.includes("FERTILISER")) return "FERTILIZER";
  if (blob.includes("SEEDS") || blob.includes("SEED")) return "SEEDS";
  if (blob.includes("MANURE")) return "MANURE";
  if (blob.includes("BALE_WRAP") || blob.includes("WRAP")) return "BALE_WRAP";
  if (blob.includes("TWINE")) return "BALE_TWINE";
  if (blob.includes("NET")) return "BALE_NET";
  return "UNKNOWN";
}

export function consumableContainerLabel(kind: "pallet" | "bigBag" | "ibc"): string {
  const map = {
    pallet: "economy.consumablesContainerPallet",
    bigBag: "economy.consumablesContainerBigBag",
    ibc: "economy.consumablesContainerIbc",
  } as const;
  return t(map[kind] || map.pallet);
}

export interface ConsumableGroup {
  fillType: string;
  containerKind: "pallet" | "bigBag" | "ibc";
  full: number;
  partials: Array<{ pct: number; level: number; capacity: number }>;
}

export function aggregateConsumables(items: VehicleLike[] | null | undefined): ConsumableGroup[] {
  const groups = new Map<string, ConsumableGroup>();
  for (const v of items || []) {
    const primary = getConsumablePrimaryFill(v);
    const fillType = primary?.fillType || inferFillTypeFromVehicleName(v);
    const containerKind = getConsumableContainerKind(v);
    const key = `${fillType}::${containerKind}`;
    if (!groups.has(key)) {
      groups.set(key, { fillType, containerKind, full: 0, partials: [] });
    }
    const g = groups.get(key)!;
    const pct = primary?.pct ?? (primary ? 0 : 100);
    if (pct >= CONSUMABLE_FULL_PCT || !primary) {
      g.full += 1;
    } else {
      g.partials.push({ pct, level: primary.level, capacity: primary.capacity });
    }
  }
  for (const g of groups.values()) {
    g.partials.sort((a, b) => b.pct - a.pct);
  }
  return [...groups.values()].sort((a, b) =>
    humanizeFillTypeName(a.fillType).localeCompare(humanizeFillTypeName(b.fillType))
  );
}

export function sumBaleBucket(bucket: Partial<BaleBucket> | null | undefined): number {
  if (!bucket || typeof bucket !== "object") return 0;
  return BALE_CATEGORY_KEYS.reduce((s, k) => s + (Number(bucket[k]) || 0), 0);
}

export function resolveBaleInventoryForFarm(
  baleInventory: Record<string, unknown> | null | undefined,
  farmId: number | null | undefined
): { onField: Partial<BaleBucket>; inStorage: Partial<BaleBucket>; offField: Partial<BaleBucket> } {
  const inv = baleInventory && typeof baleInventory === "object" ? baleInventory : {};
  const fid = Number(farmId ?? 1);
  const empty = { onField: {}, inStorage: {}, offField: {} };
  if (!Number.isFinite(fid) || fid <= 0) return empty;

  const normalizeRow = (row: Record<string, unknown> | null | undefined) => {
    const storage = (row?.inStorage || row?.offField || {}) as Partial<BaleBucket>;
    return {
      onField: (row?.onField || {}) as Partial<BaleBucket>,
      inStorage: storage,
      offField: storage,
    };
  };

  const byFarm = inv.byFarm as Record<string, Record<string, unknown>> | undefined;
  if (byFarm && typeof byFarm === "object") {
    const row = byFarm[String(fid)] ?? byFarm[String(Number(fid))] ?? null;
    if (row) return normalizeRow(row);
    return empty;
  }

  const bid = Number(inv.farmId);
  if (Number.isFinite(bid) && bid > 0 && bid !== fid) return empty;
  return normalizeRow(inv as Record<string, unknown>);
}

export function sumBalesOnFarmFields(
  data: { fields?: FieldLike[] | Record<string, FieldLike>; allFields?: FieldLike[] | Record<string, FieldLike> } | null | undefined,
  farmId: number | null | undefined
): { total: number; fieldsWithBales: number; bucket: BaleBucket } {
  if (!data || typeof data !== "object") {
    return { total: 0, fieldsWithBales: 0, bucket: { straw: 0, grass: 0, hay: 0, silage: 0, other: 0, byFillType: {} } };
  }
  const fieldsArr = Array.isArray(data.fields) ? data.fields : Object.values(data.fields || {});
  const allArr = Array.isArray(data.allFields) ? data.allFields : Object.values(data.allFields || {});
  const fromPlayer = filterFieldsForFarmView(fieldsArr, farmId);
  const list = fromPlayer.length > 0 ? fromPlayer : filterFieldsForFarmView(allArr, farmId);
  let total = 0;
  let fieldsWithBales = 0;
  const bucket: BaleBucket = { straw: 0, grass: 0, hay: 0, silage: 0, other: 0, byFillType: {} };
  for (const f of list) {
    const n = Number(f?.baleCountOnField ?? 0);
    if (!Number.isFinite(n) || n <= 0) continue;
    total += n;
    fieldsWithBales += 1;
    const cat = f?.baleOnFieldByCategory;
    if (cat && typeof cat === "object") {
      for (const key of BALE_CATEGORY_KEYS) {
        bucket[key] += Number(cat[key]) || 0;
      }
      const named = cat.byFillType;
      if (named && typeof named === "object") {
        for (const [label, count] of Object.entries(named)) {
          bucket.byFillType![label] = (Number(bucket.byFillType![label]) || 0) + (Number(count) || 0);
        }
      }
    }
  }
  const bucketSum = BALE_CATEGORY_KEYS.reduce((s, k) => s + (Number(bucket[k]) || 0), 0);
  if (total > bucketSum) bucket.other += total - bucketSum;
  else if (bucketSum === 0 && total > 0) bucket.other = total;
  return { total, fieldsWithBales, bucket };
}

function inferBaleCategoryFromFillName(name: unknown): BaleCategoryKey {
  const u = String(name || "").toUpperCase();
  if (!u) return "other";
  if (u.includes("STRAW")) return "straw";
  if (u.includes("SILAGE") || u.includes("FERMENT")) return "silage";
  if (u.includes("DRYGRASS") || u.includes("HAY")) return "hay";
  if (u.includes("GRASS_WINDROW") || (u.includes("GRASS") && !u.includes("FERT"))) return "grass";
  const lower = String(name || "").toLowerCase();
  if (lower.includes("straw")) return "straw";
  if (lower.includes("silage") || lower.includes("ferment")) return "silage";
  if (lower.includes("hay") || lower.includes("dry grass")) return "hay";
  if (lower.includes("grass") && !lower.includes("fert")) return "grass";
  return "other";
}

export function mergeBaleBucketForDisplay(bucket: Partial<BaleBucket> | null | undefined): Partial<BaleBucket> {
  const base: Partial<BaleBucket> = { ...(bucket || {}) };
  const named = base.byFillType && typeof base.byFillType === "object" ? base.byFillType : {};
  const namedSum = Object.values(named).reduce((s, v) => s + (Number(v) || 0), 0);
  const typedSum = BALE_CATEGORY_KEYS.filter((k) => k !== "other").reduce((s, k) => s + (Number(base[k]) || 0), 0);
  if (typedSum === 0 && namedSum > 0) {
    for (const [fillName, count] of Object.entries(named)) {
      const n = Number(count) || 0;
      if (n <= 0) continue;
      const cat = inferBaleCategoryFromFillName(fillName);
      base[cat] = (Number(base[cat]) || 0) + n;
    }
    if ((Number(base.other) || 0) >= namedSum) base.other = 0;
  }
  return base;
}

export function baleCategoryLabel(key: BaleCategoryKey): string {
  const map: Record<BaleCategoryKey, string> = {
    straw: "economy.baleCatStraw",
    grass: "economy.baleCatGrass",
    hay: "economy.baleCatHay",
    silage: "economy.baleCatSilage",
    other: "economy.baleCatOther",
  };
  return t(map[key] || "economy.baleCatOther");
}

export function shouldSkipCropName(name: unknown): boolean {
  if (!name || typeof name !== "string") return true;
  const skipPatterns = [
    /^\d+$/,
    /[A-Z]{8,}/,
    /^[a-zA-Z]{35,}$/,
    /test|debug|temp|placeholder/i,
    /^[^a-zA-Z]/,
    /^(BIGBAG|BIG_BAG|PALLET|PALETTE)/i,
    /^(UNKNOWN|EMPTY|NULL|NONE)$/i,
  ];
  return skipPatterns.some((pattern) => pattern.test(name));
}

export function formatCropName(name: unknown): string | null {
  if (!name || typeof name !== "string") return "Unknown";
  const upperName = name.toUpperCase();
  if (CROP_MAPPINGS[upperName]) return CROP_MAPPINGS[upperName];
  if (shouldSkipCropName(name)) return null;
  let formatted = name.replace(/_/g, " ");
  formatted = formatted.replace(/([a-z])([A-Z])/g, "$1 $2");
  formatted = formatted.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return formatted;
}

export type MarketCategoryKey = "crops" | "products" | "greenery" | "greenhouse" | "yieldBoost" | "others";

export function categorizeMarketCrop(cropName: string): MarketCategoryKey {
  const nameUpper = cropName.toUpperCase();
  if (CROP_CATEGORY.has(nameUpper)) return "crops";
  if (PRODUCT_CATEGORY.has(nameUpper)) return "products";
  if (GREENERY_CATEGORY.has(nameUpper)) return "greenery";
  if (GREENHOUSE_CATEGORY.has(nameUpper)) return "greenhouse";
  if (YIELD_BOOST_CATEGORY.has(nameUpper)) return "yieldBoost";
  return "others";
}

export function marketCategoryMeta(key: MarketCategoryKey): { nameKey: string; fallback: string } {
  const map: Record<MarketCategoryKey, { nameKey: string; fallback: string }> = {
    crops: { nameKey: "economy.marketCatCrops", fallback: "Crops" },
    products: { nameKey: "economy.marketCatProducts", fallback: "Products" },
    greenery: { nameKey: "economy.marketCatGreenery", fallback: "Greenery" },
    greenhouse: { nameKey: "economy.marketCatGreenhouse", fallback: "Greenhouse" },
    yieldBoost: { nameKey: "economy.marketCatYieldBoost", fallback: "Yield Boost" },
    others: { nameKey: "economy.marketCatOthers", fallback: "Others" },
  };
  return map[key];
}

/** True when a market price is finite and greater than zero (hide empty/$0 rows). */
export function isUsableMarketPrice(price: unknown): boolean {
  const n = Number(price);
  return Number.isFinite(n) && n > 0;
}

export function filterUsableMarketLocations(
  locations: MarketCropLocation[] | null | undefined
): MarketCropLocation[] {
  if (!Array.isArray(locations)) return [];
  return locations.filter((loc) => isUsableMarketPrice(loc?.price));
}

/** Non-livestock sell-point crop entries with a usable (price > 0) quote. */
export function sellPointUsablePriceEntries(
  prices: MarketSellPoint["prices"] | null | undefined
): Array<[string, NonNullable<MarketSellPoint["prices"]>[string]]> {
  if (!prices || typeof prices !== "object") return [];
  return Object.entries(prices).filter(([cropName, info]) => {
    if (LIVESTOCK_ANIMALS.has(cropName.toUpperCase())) return false;
    if (!formatCropName(cropName)) return false;
    return isUsableMarketPrice(info?.price);
  });
}

export function buildMarketCropGroups(marketData: MarketPrices | null | undefined): Record<
  MarketCategoryKey,
  Array<{ name: string; data: MarketCrop; displayName: string }>
> {
  const empty: Record<MarketCategoryKey, Array<{ name: string; data: MarketCrop; displayName: string }>> = {
    crops: [],
    products: [],
    greenery: [],
    greenhouse: [],
    yieldBoost: [],
    others: [],
  };
  if (!marketData?.crops) return empty;

  const filtered = Object.entries(marketData.crops).filter(
    ([cropName]) => !LIVESTOCK_ANIMALS.has(cropName.toUpperCase())
  );
  for (const [cropName, cropData] of filtered) {
    const displayName = formatCropName(cropName);
    if (!displayName) continue;
    const locations = filterUsableMarketLocations(cropData.locations);
    // Skip crops that only have empty/zero quotes (no usable location and no avg).
    if (locations.length === 0 && !isUsableMarketPrice(cropData.avgPrice)) continue;
    const cat = categorizeMarketCrop(cropName);
    empty[cat].push({
      name: cropName,
      data: { ...cropData, locations },
      displayName,
    });
  }
  for (const key of Object.keys(empty) as MarketCategoryKey[]) {
    empty[key].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  return empty;
}

export function normalizeSellPoints(marketData: MarketPrices | null | undefined): MarketSellPoint[] {
  const sp = marketData?.sellPoints;
  if (!sp) return [];
  const list = Array.isArray(sp) ? sp : Object.values(sp);
  const skipPatterns = [/^Unknown$/, /Silo$/, /Silo /, /^Grain.*Silo/, /^Farm Silo/, /Barn$/, /Barn /, /Stable$/];
  return list
    .filter((sellPoint) => {
      const name = String(sellPoint?.name || "");
      return !skipPatterns.some((pattern) => pattern.test(name));
    })
    .map((sellPoint) => {
      const usable = sellPointUsablePriceEntries(sellPoint.prices);
      const prices: NonNullable<MarketSellPoint["prices"]> = {};
      for (const [cropName, info] of usable) {
        prices[cropName] = info;
      }
      return { ...sellPoint, prices };
    })
    .filter((sellPoint) => Object.keys(sellPoint.prices || {}).length > 0);
}

export function sellPointsForMap(marketData: MarketPrices | null | undefined): MarketSellPoint[] {
  const sp = marketData?.sellPoints;
  if (!sp) return [];
  const list = Array.isArray(sp) ? sp : Object.values(sp);
  const skipPatterns = [/^Unknown$/, /Silo$/, /Silo /, /^Grain.*Silo/, /^Farm Silo/, /Barn$/, /Barn /, /Stable$/];
  return list.filter((sellPoint) => {
    const name = String(sellPoint?.name || "");
    if (!name || skipPatterns.some((pattern) => pattern.test(name))) return false;
    const pos = sellPoint.position;
    const x = Number(pos?.x ?? sellPoint.x);
    const z = Number(pos?.z ?? sellPoint.z);
    return Number.isFinite(x) && Number.isFinite(z) && (Math.abs(x) >= 0.5 || Math.abs(z) >= 0.5);
  });
}

export function isPurchaseTypeMatch(
  vehicleType: string | undefined,
  filter: "all" | "vehicles" | "implements"
): boolean {
  if (filter === "all") return true;
  const cardType = String(vehicleType || "unknown").toLowerCase();
  if (filter === "vehicles") return cardType === "motorized";
  return ["implement", "trailer", "seeder", "cultivator"].includes(cardType);
}

export function sortPurchasesList(
  vehicles: VehicleLike[],
  sortBy: "price" | "age" | "name"
): VehicleLike[] {
  const list = [...vehicles];
  list.sort((a, b) => {
    if (sortBy === "price") return (Number(b.price) || 0) - (Number(a.price) || 0);
    if (sortBy === "age") return (Number(b.age) || 0) - (Number(a.age) || 0);
    return resolveVehicleDisplayName(a).localeCompare(resolveVehicleDisplayName(b));
  });
  return list;
}

export function splitVehiclesAndConsumables(vehicles: unknown): {
  equipment: VehicleLike[];
  consumables: VehicleLike[];
} {
  const raw = Array.isArray(vehicles)
    ? (vehicles as VehicleLike[])
    : vehicles && typeof vehicles === "object"
      ? (Object.values(vehicles) as VehicleLike[])
      : [];
  return {
    equipment: raw.filter((v) => !isStorageItem(v)),
    consumables: raw.filter((v) => isStorageItem(v)),
  };
}

/** Glyph prefix for purchase cards (no icon font in ui-v2). */
export function vehicleIconGlyph(vehicleType: string | undefined): string {
  switch (String(vehicleType || "").toLowerCase()) {
    case "motorized":
      return "🚜";
    case "trailer":
      return "🛞";
    case "implement":
      return "🔧";
    case "seeder":
      return "🌱";
    case "cultivator":
      return "↻";
    default:
      return "⚙";
  }
}

export type PurchaseFilter = "all" | "vehicles" | "implements";

export function purchasesEmptyMessageKey(
  filter: PurchaseFilter,
  ownedCount: number
): string {
  if (ownedCount === 0) return "economy.purchasesEmpty";
  if (filter === "vehicles") return "economy.purchasesEmptyVehicles";
  if (filter === "implements") return "economy.purchasesEmptyImplements";
  return "economy.purchasesEmptyFilter";
}

export function marketMatchesSearch(
  terms: string[],
  ...haystacks: Array<string | undefined | null>
): boolean {
  const term = terms.join(" ").trim().toLowerCase();
  if (!term) return true;
  const blob = haystacks
    .filter(Boolean)
    .map((s) => String(s).toLowerCase())
    .join(" ");
  return blob.includes(term);
}
