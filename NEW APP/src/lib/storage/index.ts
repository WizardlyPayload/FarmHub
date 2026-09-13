/** Farm-wide fill-type stock — Economy → Storage tab helpers. */

import { t } from "@/i18n/i18n";
import {
  applyFillTypeTitles,
  enrichStockFillTypesFromPlaceables,
  lookupFillTypeNameFromEconomy,
  mergeFillTypeCatalog,
  resolveStockItemFillType,
  titleForIndex,
  type EconomyLike,
  type FillTypeCatalog,
  type FillTypeTitles,
  type PlaceableLike,
  type StockFarmRow,
  type StockItem,
  type StockLocation,
  type StockPayload,
} from "@/lib/fillTypeResolve";
import { formatMoisturePercent, moistureGradeLabel } from "@/lib/moisture";

const DISPLAY_NAMES: Record<string, string> = {
  WHEAT: "Wheat",
  BARLEY: "Barley",
  OAT: "Oat",
  OATS: "Oats",
  CANOLA: "Canola",
  CORN: "Corn",
  MAIZE: "Corn",
  SORGHUM: "Sorghum",
  SOYBEANS: "Soybeans",
  SOYBEAN: "Soybeans",
  SUNFLOWER: "Sunflower",
  STRAW: "Straw",
  SILAGE: "Silage",
  HAY: "Hay",
  GRASS: "Grass",
  DRYGRASS_WINDROW: "Hay",
  GRASS_WINDROW: "Grass",
  DIESEL: "Diesel",
  LIME: "Lime",
  SEEDS: "Seeds",
  MANURE: "Manure",
  SLURRY: "Slurry",
  HERBICIDE: "Herbicide",
  LIQUID_FERTILIZER: "Liquid Fertilizer",
  MINERAL_FERTILIZER: "Mineral Fertilizer",
  STONE: "Stone",
  POTATO: "Potato",
  POTATOES: "Potatoes",
  SUGAR_BEET: "Sugar Beet",
  SUGARBEET: "Sugar Beet",
  RAPE: "Rape",
  RICE: "Rice",
  RYE: "Rye",
  TRITICALE: "Triticale",
  SPELT: "Spelt",
  LINSEED: "Linseed",
  POPPY: "Poppy",
};

const SEASON_PERIODS = [
  "EARLY_SPRING",
  "MID_SPRING",
  "LATE_SPRING",
  "EARLY_SUMMER",
  "MID_SUMMER",
  "LATE_SUMMER",
  "EARLY_AUTUMN",
  "MID_AUTUMN",
  "LATE_AUTUMN",
  "EARLY_WINTER",
  "MID_WINTER",
  "LATE_WINTER",
] as const;

const SEASON_PERIOD_MONTHS: Record<string, string> = {
  EARLY_SPRING: "Mar",
  MID_SPRING: "Apr",
  LATE_SPRING: "May",
  EARLY_SUMMER: "Jun",
  MID_SUMMER: "Jul",
  LATE_SUMMER: "Aug",
  EARLY_AUTUMN: "Sep",
  MID_AUTUMN: "Oct",
  LATE_AUTUMN: "Nov",
  EARLY_WINTER: "Dec",
  MID_WINTER: "Jan",
  LATE_WINTER: "Feb",
};

const ECONOMY_CROP_ALIASES: Record<string, string[]> = {
  HAY: ["DRYGRASS", "DRYGRASS_WINDROW"],
  DRYGRASS_WINDROW: ["DRYGRASS"],
};

export interface EnrichedStockItem extends StockItem {
  locations: StockLocation[];
  _pricePer1000?: number;
  _maxPrice?: number;
  _maxPriceMonth?: string | null;
  _crop?: CropLike | null;
}

export interface CropLike {
  fillTypeIndex?: number;
  avgXmlPrice?: number;
  avgPrice?: number;
  maxPrice?: number;
  maxPriceMonth?: string;
  priceHistory?: Record<string, number>;
  bestLocation?: string;
  locations?: Array<{ name?: string; price?: number }>;
  [key: string]: unknown;
}

export interface StorageDashboardLike {
  activeFarmId?: number | null;
  stock?: StockPayload | null;
  economy?: EconomyLike | null;
  placeables?: PlaceableLike[] | null;
  fillTypeCatalog?: FillTypeCatalog;
  fillTypeTitles?: FillTypeTitles;
  cropFillTypeIndex?: Record<string, number>;
  fields?: unknown;
  weather?: { moisture?: { enabled?: boolean; [key: string]: unknown } } | null;
  baleInventory?: unknown;
  [key: string]: unknown;
}

function humanizeFillTypeName(fillType: unknown): string {
  return String(fillType || "Unknown")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function stripFillTypeVariant(key: string): string {
  return key.replace(/_?\d+$/, "");
}

export function formatCommodityLabel(name: unknown): string {
  const raw = String(name || "").trim();
  if (!raw) return "";
  if (/^\$l10n_/i.test(raw)) {
    const key = raw.replace(/^\$l10n_/i, "").replace(/^fillType_/i, "").toUpperCase();
    return formatCommodityLabel(key);
  }
  if (/[a-z]/.test(raw) && /[\s-]/.test(raw)) return raw;
  const key = raw.toUpperCase();
  if (DISPLAY_NAMES[key]) return DISPLAY_NAMES[key];
  const stripped = stripFillTypeVariant(key);
  if (stripped && stripped !== key && DISPLAY_NAMES[stripped]) return DISPLAY_NAMES[stripped];
  return humanizeFillTypeName(stripped || key);
}

export function formatLiters(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} l`;
}

export function formatMoney(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

export function formatPricePer1000(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

/** Peak season month from XML history or Lua economy export (matches in-game price table). */
export function resolveMaxPriceMonth(crop: CropLike | null | undefined): string | null {
  if (!crop || typeof crop !== "object") return null;
  if (crop.maxPriceMonth) return String(crop.maxPriceMonth);
  const history = crop.priceHistory;
  if (!history || typeof history !== "object") return null;

  let bestPeriod: string | null = null;
  let bestPrice = -1;
  for (const period of SEASON_PERIODS) {
    const price = Number(history[period]);
    if (!Number.isFinite(price) || price <= 0) continue;
    if (price > bestPrice) {
      bestPrice = price;
      bestPeriod = period;
    }
  }
  if (!bestPeriod) {
    for (const [period, raw] of Object.entries(history)) {
      const price = Number(raw);
      if (!Number.isFinite(price) || price <= 0) continue;
      if (price > bestPrice) {
        bestPrice = price;
        bestPeriod = period;
      }
    }
  }
  if (!bestPeriod) return null;
  if (SEASON_PERIOD_MONTHS[bestPeriod]) return SEASON_PERIOD_MONTHS[bestPeriod];
  const idx = Number(bestPeriod);
  if (Number.isFinite(idx) && idx >= 1 && idx <= 12) {
    return SEASON_PERIODS[idx - 1] ? SEASON_PERIOD_MONTHS[SEASON_PERIODS[idx - 1]] : null;
  }
  return null;
}

export function normalizeLocations(locations: StockItem["locations"]): StockLocation[] {
  if (Array.isArray(locations)) return locations;
  if (locations && typeof locations === "object") return Object.values(locations);
  return [];
}

function catalogFromMapCrops(dashboard: StorageDashboardLike): FillTypeCatalog {
  const out: FillTypeCatalog = {};
  const skip = new Set(["UNKNOWN", "EMPTY", "GRASS", "MULCHED_STUBBLE"]);
  const nameToIndex = dashboard?.economy?.marketPrices?.nameToIndex || {};
  const cropMap = dashboard?.cropFillTypeIndex || {};
  for (const [crop, idx] of Object.entries(cropMap)) {
    const n = Number(idx);
    const label = String(crop || "").trim().toUpperCase();
    if (n > 0 && label) out[String(n)] = label;
  }
  const fields = Array.isArray(dashboard?.fields)
    ? dashboard.fields
    : Object.values((dashboard?.fields as Record<string, unknown>) || {});
  for (const f of fields as Array<{ fruitType?: string }>) {
    const label = String(f?.fruitType || "").trim().toUpperCase();
    if (!label || skip.has(label)) continue;
    const idx = Number(nameToIndex[label] ?? cropMap[label]);
    if (idx > 0) out[String(idx)] = label;
  }
  return out;
}

function collectFillTypeTitles(dashboard: StorageDashboardLike): FillTypeTitles {
  const economy = dashboard?.economy || {};
  const mp = economy.marketPrices || {};
  return mergeFillTypeCatalog(
    dashboard?.fillTypeTitles,
    dashboard?.stock?.fillTypeTitles,
    economy.fillTypeTitles,
    mp.fillTypeTitles
  );
}

/** Build index→name catalog from every export path (mod root, stock, economy, market maps). */
export function buildFillTypeCatalog(dashboard: StorageDashboardLike): FillTypeCatalog {
  const economy = dashboard?.economy || {};
  const mp = economy.marketPrices || {};
  const fromNameToIndex: FillTypeCatalog = {};
  if (mp.nameToIndex && typeof mp.nameToIndex === "object") {
    for (const [name, idx] of Object.entries(mp.nameToIndex)) {
      if (idx != null) fromNameToIndex[String(idx)] = name;
    }
  }
  const fromCrops: FillTypeCatalog = {};
  for (const [name, crop] of Object.entries(mp.crops || {})) {
    const idx = crop?.fillTypeIndex;
    if (idx != null) fromCrops[String(idx)] = name;
  }
  const fromSellPoints: FillTypeCatalog = {};
  const sellPoints = mp.sellPoints;
  const stations =
    sellPoints && typeof sellPoints === "object"
      ? Array.isArray(sellPoints)
        ? sellPoints
        : Object.values(sellPoints)
      : [];
  for (const station of stations as Array<{ prices?: Record<string, { fillTypeIndex?: number }> }>) {
    if (!station?.prices || typeof station.prices !== "object") continue;
    for (const [productName, priceInfo] of Object.entries(station.prices)) {
      const idx = priceInfo?.fillTypeIndex;
      if (idx != null) fromSellPoints[String(idx)] = productName;
    }
  }
  const titles = collectFillTypeTitles(dashboard);
  return applyFillTypeTitles(
    mergeFillTypeCatalog(
      dashboard?.fillTypeCatalog,
      economy.fillTypeCatalog,
      mp.fillTypesByIndex,
      catalogFromMapCrops(dashboard),
      fromNameToIndex,
      fromCrops,
      fromSellPoints,
      dashboard?.stock?.fillTypeCatalog
    ),
    titles
  );
}

export function resolveFillTypeTitles(dashboard: StorageDashboardLike): FillTypeTitles {
  return collectFillTypeTitles(dashboard);
}

export function resolveFillTypeCatalog(dashboard: StorageDashboardLike): FillTypeCatalog {
  return buildFillTypeCatalog(dashboard);
}

function cropKeyForItem(item: StockItem): string {
  const raw = String(item?.fillType || "").trim();
  if (raw && !/^\d+$/.test(raw)) return raw.toUpperCase();
  return "";
}

function lookupCropByName(crops: Record<string, CropLike>, name: string): CropLike | null {
  if (!name || !crops || typeof crops !== "object") return null;
  const upper = String(name).toUpperCase();
  if (crops[upper]) return crops[upper];
  if (crops[name]) return crops[name];
  const found = Object.entries(crops).find(([cropName]) => String(cropName).toUpperCase() === upper);
  if (found) return found[1];
  for (const alt of ECONOMY_CROP_ALIASES[upper] || []) {
    const hit = lookupCropByName(crops, alt);
    if (hit) return hit;
  }
  return null;
}

function findCropForItem(item: StockItem, economy: EconomyLike | null | undefined): CropLike | null {
  const crops = (economy?.marketPrices?.crops || {}) as Record<string, CropLike>;
  const key = cropKeyForItem(item);
  if (key) {
    const byName = lookupCropByName(crops, key);
    if (byName) return byName;
  }
  const idx = Number(item?.fillTypeIndex);
  if (Number.isFinite(idx)) {
    const byIdx = Object.values(crops).find((crop) => Number(crop?.fillTypeIndex) === idx);
    if (byIdx) return byIdx;
    const catalogName =
      economy?.fillTypeCatalog?.[String(idx)] || economy?.marketPrices?.fillTypesByIndex?.[String(idx)];
    if (catalogName) {
      const byCatalog = lookupCropByName(crops, catalogName);
      if (byCatalog) return byCatalog;
    }
  }
  return null;
}

function bestCropLocationPrice(crop: CropLike | null | undefined): number {
  if (!crop?.locations?.length) return 0;
  let best = 0;
  for (const loc of crop.locations) {
    const p = Number(loc?.price) || 0;
    if (p > best) best = p;
  }
  return best;
}

export function resolvePricePer1000(item: StockItem, crop: CropLike | null | undefined): number {
  const fromCrop = bestCropLocationPrice(crop);
  if (fromCrop > 0) return fromCrop;
  const fromXmlAvg = Number(crop?.avgXmlPrice) || Number(crop?.avgPrice) || 0;
  if (fromXmlAvg > 0) return fromXmlAvg;
  const modPrice = Number(item?.bestSellPrice) || 0;
  if (modPrice > 0) {
    return modPrice < 50 ? modPrice * 1000 : modPrice;
  }
  return 0;
}

export function resolveStationName(item: StockItem, crop: CropLike | null | undefined): string | null {
  const station = item?.bestSellStation;
  if (station && station !== "Market" && station !== "Market Base Prices") {
    return station;
  }
  if (crop?.bestLocation && crop.bestLocation !== "Market Base Prices") {
    return crop.bestLocation;
  }
  if (crop?.locations?.length) {
    const sorted = [...crop.locations].sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    const top = sorted[0];
    if (top?.name && top.name !== "Market Base Prices") return top.name;
    if (top?.name === "Market Base Prices" && (Number(top.price) || 0) > 0) {
      return top.name;
    }
  }
  if (crop?.bestLocation === "Market Base Prices" && bestCropLocationPrice(crop) > 0) {
    return crop.bestLocation;
  }
  return null;
}

export function computeValue(liters: unknown, pricePer1000: unknown): number {
  const lit = Number(liters) || 0;
  const price = Number(pricePer1000) || 0;
  if (lit <= 0 || price <= 0) return 0;
  return (lit * price) / 1000;
}

/** Resolve numeric fill types and back-fill sell hints from economy market data. */
export function enrichStockItem(
  item: StockItem,
  stock: StockPayload | null | undefined,
  economy: EconomyLike | null | undefined,
  rootCatalog: FillTypeCatalog | null | undefined,
  placeables?: PlaceableLike[] | null,
  farmId?: number | null
): EnrichedStockItem {
  const out: EnrichedStockItem = { ...item, locations: normalizeLocations(item?.locations) };
  const titles = mergeFillTypeCatalog(
    stock?.fillTypeTitles,
    economy?.fillTypeTitles,
    economy?.marketPrices?.fillTypeTitles
  );
  const catalog = mergeFillTypeCatalog(
    rootCatalog,
    stock?.fillTypeCatalog,
    economy?.fillTypeCatalog,
    economy?.marketPrices?.fillTypesByIndex,
    economy?.marketPrices?.nameToIndex &&
      Object.fromEntries(
        Object.entries(economy.marketPrices.nameToIndex).map(([name, idx]) => [String(idx), name])
      )
  );
  const mergedCatalog = applyFillTypeTitles(catalog, titles);
  for (const [name, crop] of Object.entries(economy?.marketPrices?.crops || {})) {
    const cidx = crop?.fillTypeIndex;
    if (cidx != null && !mergedCatalog[String(cidx)]) mergedCatalog[String(cidx)] = name;
  }
  const sellPoints = economy?.marketPrices?.sellPoints;
  const stations =
    sellPoints && typeof sellPoints === "object"
      ? Array.isArray(sellPoints)
        ? sellPoints
        : Object.values(sellPoints)
      : [];
  for (const station of stations as Array<{ prices?: Record<string, { fillTypeIndex?: number }> }>) {
    if (!station?.prices || typeof station.prices !== "object") continue;
    for (const [productName, priceInfo] of Object.entries(station.prices)) {
      const cidx = priceInfo?.fillTypeIndex;
      if (cidx != null && !mergedCatalog[String(cidx)]) mergedCatalog[String(cidx)] = productName;
    }
  }
  const stockIdx = Number(out.fillTypeIndex);
  const fromPlaceables = enrichStockFillTypesFromPlaceables(
    { byFarm: { 0: { farmId: farmId || 0, items: [out] } } },
    placeables,
    mergedCatalog
  );
  const placeableItem = fromPlaceables.stock?.byFarm?.["0"]?.items?.[0];
  if (placeableItem?.fillType && (!out.fillType || /^\d+$/.test(String(out.fillType).trim()))) {
    out.fillType = placeableItem.fillType;
    if (stockIdx > 0) {
      mergedCatalog[String(stockIdx)] = mergedCatalog[String(stockIdx)] || placeableItem.fillType;
    }
  }
  const resolved = resolveStockItemFillType(out, mergedCatalog, titles) as EnrichedStockItem;
  resolved.locations = normalizeLocations(resolved.locations);
  const idx = Number(resolved.fillTypeIndex);
  if (idx > 0 && (!resolved.fillType || /^\d+$/.test(String(resolved.fillType).trim()))) {
    const fromTitle = titleForIndex(idx, titles);
    if (fromTitle) {
      resolved.fillType = fromTitle;
      mergedCatalog[String(idx)] = mergedCatalog[String(idx)] || fromTitle;
    }
  }
  if (idx > 0 && (!resolved.fillType || /^\d+$/.test(String(resolved.fillType).trim()))) {
    const fromEcon = lookupFillTypeNameFromEconomy(idx, economy);
    if (fromEcon) {
      resolved.fillType = fromEcon;
      mergedCatalog[String(idx)] = mergedCatalog[String(idx)] || fromEcon;
    }
  }
  const crop = findCropForItem(resolved, economy);
  const pricePer1000 = resolvePricePer1000(resolved, crop);
  if (pricePer1000 > 0) {
    resolved._pricePer1000 = pricePer1000;
    if (!(Number(resolved.bestSellPrice) > 0)) {
      resolved.bestSellPrice = pricePer1000;
    }
  }
  const station = resolveStationName(resolved, crop);
  if (station) resolved.bestSellStation = station;
  if (crop) {
    resolved._maxPrice = Number(crop.maxPrice) || 0;
    resolved._maxPriceMonth = resolveMaxPriceMonth(crop);
    resolved._crop = crop;
  }
  return resolved;
}

export function enrichStockItems(
  items: StockItem[] | null | undefined,
  stock: StockPayload | null | undefined,
  economy: EconomyLike | null | undefined,
  rootCatalog: FillTypeCatalog | null | undefined,
  placeables?: PlaceableLike[] | null,
  farmId?: number | null
): EnrichedStockItem[] {
  const list = Array.isArray(items) ? items : [];
  return list
    .map((item) => enrichStockItem(item, stock, economy, rootCatalog, placeables, farmId))
    .filter((item) => Number(item.totalLiters) > 0);
}

export function displayFillTypeName(
  item: StockItem,
  catalog: FillTypeCatalog | null | undefined,
  economy: EconomyLike | null | undefined,
  titles: FillTypeTitles | null | undefined
): string {
  const idx = Number(item?.fillTypeIndex);
  const cat = catalog && typeof catalog === "object" ? catalog : {};
  const titleMap = titles && typeof titles === "object" ? titles : {};
  if (idx > 0) {
    const fromTitles = titleForIndex(idx, titleMap);
    if (fromTitles && !/^\$l10n_/i.test(fromTitles) && !/^\d+$/.test(fromTitles.trim())) {
      return formatCommodityLabel(fromTitles);
    }
  }
  if (item?.fillTypeDisplay) {
    const display = String(item.fillTypeDisplay).trim();
    if (display && !/^\d+$/.test(display) && !/^\$l10n_/i.test(display)) {
      return formatCommodityLabel(display);
    }
  }
  if (item?.fillTypeTitle) {
    const title = String(item.fillTypeTitle).trim();
    if (title && !/^\d+$/.test(title) && !/^\$l10n_/i.test(title)) {
      return formatCommodityLabel(title);
    }
  }
  let rawKey = "";
  if (idx > 0 && (cat[String(idx)] || cat[idx as unknown as string])) {
    rawKey = cat[String(idx)] || cat[idx as unknown as string];
  }
  if (!rawKey && idx > 0 && economy) {
    const fromEcon = lookupFillTypeNameFromEconomy(idx, economy);
    if (fromEcon) rawKey = fromEcon;
  }
  if (!rawKey && item?.fillType && !/^\d+$/.test(String(item.fillType).trim())) {
    rawKey = String(item.fillType).trim();
  }
  if (rawKey) return formatCommodityLabel(rawKey);
  if (idx > 0) return t("storage.fillTypeIndex", { index: idx });
  return t("storage.unknownFill");
}

function fillTypeIdent(raw: unknown): string {
  const s = String(raw || "").trim();
  if (!s || /^\d+$/.test(s) || /^\$l10n_/i.test(s)) return "";
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(s)) return "";
  return s.toUpperCase();
}

function compactFillTypeToken(raw: unknown): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

/** Internal fill-type name for HUD icon lookup (not the pretty title). */
export function fillTypeHudKey(
  item: StockItem,
  catalog: FillTypeCatalog | null | undefined,
  titles?: FillTypeTitles | null
): string {
  const idx = Number(item?.fillTypeIndex);
  const cat = catalog && typeof catalog === "object" ? catalog : {};
  const titleMap = titles && typeof titles === "object" ? titles : {};
  if (idx > 0) {
    const mapped = fillTypeIdent(cat[String(idx)] || cat[idx as unknown as string]);
    if (mapped) return mapped;
  }
  const fromItem = fillTypeIdent(item?.fillType);
  if (fromItem) return fromItem;

  const titleNeedle = String(
    (idx > 0 && (titleMap[String(idx)] || titleMap[idx as unknown as string])) ||
      item?.fillTypeTitle ||
      item?.fillTypeDisplay ||
      item?.fillType ||
      (idx > 0 ? cat[String(idx)] || cat[idx as unknown as string] : "") ||
      ""
  )
    .trim()
    .toLowerCase();
  if (titleNeedle) {
    for (const [k, v] of Object.entries(cat)) {
      const ident = fillTypeIdent(v);
      if (!ident) continue;
      const titleAt = String(titleMap[k] || titleMap[String(k)] || "").trim().toLowerCase();
      if (titleAt && titleAt === titleNeedle) return ident;
    }
    const compactNeedle = compactFillTypeToken(titleNeedle);
    if (compactNeedle.length >= 2) {
      for (const v of Object.values(cat)) {
        const ident = fillTypeIdent(v);
        if (ident && ident.replace(/_/g, "") === compactNeedle) return ident;
      }
    }
  }
  return "";
}

export function fillTypeHudUrl(
  item: StockItem,
  catalog: FillTypeCatalog | null | undefined,
  cacheBust?: string | number | null,
  mapHint?: { mapId?: string; mapTitle?: string } | null,
  titles?: FillTypeTitles | null
): string | null {
  const key = fillTypeHudKey(item, catalog, titles);
  if (!key) return null;
  const params = new URLSearchParams();
  const bust = cacheBust != null && String(cacheBust).trim() !== "" && String(cacheBust) !== "0"
    ? String(cacheBust)
    : "";
  if (bust) params.set("v", bust);
  const mapId = String(mapHint?.mapId || "").trim();
  const mapTitle = String(mapHint?.mapTitle || "").trim();
  if (mapId) params.set("mapId", mapId);
  if (mapTitle) params.set("mapTitle", mapTitle);
  const query = params.toString();
  const base = `/fill-type-hud/${encodeURIComponent(key)}.png`;
  return query ? `${base}?${query}` : base;
}

export function getStockForActiveFarm(
  stock: StockPayload | null | undefined,
  farmId: number | null | undefined
): StockFarmRow | null {
  if (!stock || stock.enabled === false) return null;
  const fid = String(Number(farmId) || 1);
  return stock.byFarm?.[fid] || stock.byFarm?.[String(Number(fid))] || null;
}

export function getStockFillTypeCount(
  stock: StockPayload | null | undefined,
  farmId: number | null | undefined
): number {
  const row = getStockForActiveFarm(stock, farmId);
  if (!row) return 0;
  if (Number.isFinite(row.fillTypeCount)) return Number(row.fillTypeCount);
  return Array.isArray(row.items) ? row.items.length : 0;
}

export function formatQualityDisplay(loc: StockLocation): string {
  if (loc.qualityPct != null && Number.isFinite(Number(loc.qualityPct))) {
    return `${Math.round(Number(loc.qualityPct))}%`;
  }
  if (loc.grade != null && loc.grade !== "") {
    return moistureGradeLabel(loc.grade);
  }
  return "—";
}

export function stockRowKey(item: StockItem, idx: number): string {
  const ft = Number(item?.fillTypeIndex) || 0;
  if (ft > 0) return `idx:${ft}`;
  const name = String(item?.fillType || "").trim().toUpperCase();
  if (name) return `name:${name}`;
  return `row:${idx}`;
}

export function priceTrendDirection(trend: unknown): "up" | "down" | "flat" {
  const tr = Number(trend);
  if (Number.isFinite(tr) && tr > 0) return "up";
  if (Number.isFinite(tr) && tr < 0) return "down";
  const s = String(trend || "").toLowerCase();
  if (s === "up" || s === "rising") return "up";
  if (s === "down" || s === "falling") return "down";
  return "flat";
}

export function buildEnrichedStockForFarm(dashboard: StorageDashboardLike): {
  farmId: number;
  items: EnrichedStockItem[];
  catalog: FillTypeCatalog;
  titles: FillTypeTitles;
  economy: EconomyLike | null | undefined;
} {
  const farmId = Number(dashboard.activeFarmId ?? 1) || 1;
  const stock = dashboard.stock;
  const farmRow = getStockForActiveFarm(stock, farmId);
  const catalog = resolveFillTypeCatalog(dashboard);
  const titles = collectFillTypeTitles(dashboard);
  const items = enrichStockItems(
    farmRow?.items,
    stock,
    dashboard.economy,
    catalog,
    dashboard.placeables,
    farmId
  );
  return { farmId, items, catalog, titles, economy: dashboard.economy };
}

export function locationMoistureLabel(loc: StockLocation): string {
  const moist = loc.moisturePct != null ? formatMoisturePercent(loc.moisturePct) : "—";
  const grade = formatQualityDisplay(loc);
  if (moist !== "—" || grade !== "—") return `${moist} · ${grade}`;
  return "—";
}

/** Bunker content label from exported state (not raw fillType alone). */
export function bunkerLocationLabel(loc: StockLocation | null | undefined): string | null {
  if (!loc || String(loc.kind || "") !== "bunkerSilo") return null;
  const state = String(loc.bunkerState || "").toLowerCase();
  const fermentPct = Number(loc.fermentingPercent);
  const compactPct = Number(loc.compactedPercent);

  if (state === "closed") {
    if (Number.isFinite(fermentPct)) {
      return t("storage.bunker.fermenting", { pct: Math.round(fermentPct) });
    }
    return t("storage.bunker.fermentingUnknown");
  }
  if (state === "fermented" || state === "drain") {
    return t("storage.bunker.silage");
  }
  if (state === "fill") {
    if (Number.isFinite(compactPct) && compactPct > 0) {
      return t("storage.bunker.chaffCompacting", { pct: Math.round(compactPct) });
    }
    return t("storage.bunker.chaff");
  }

  // Legacy `extra` string from older mod builds, or unknown state.
  const extra = String(loc.extra || "").trim().toLowerCase();
  if (extra.startsWith("fermenting")) {
    const m = extra.match(/(\d+)/);
    if (m) return t("storage.bunker.fermenting", { pct: Number(m[1]) });
    return t("storage.bunker.fermentingUnknown");
  }
  if (extra.startsWith("compacting")) {
    const m = extra.match(/(\d+)/);
    if (m) return t("storage.bunker.chaffCompacting", { pct: Number(m[1]) });
    return t("storage.bunker.chaff");
  }

  const out = String(loc.outputFillType || "").toUpperCase();
  const inn = String(loc.inputFillType || "").toUpperCase();
  if (out === "SILAGE" || out.includes("SILAGE")) return t("storage.bunker.silage");
  if (inn === "CHAFF" || inn.includes("CHAFF")) return t("storage.bunker.chaff");
  return t("storage.bunker.generic");
}

export function locationKindLabel(loc: StockLocation | null | undefined): string {
  const bunker = bunkerLocationLabel(loc);
  if (bunker) return bunker;
  const kind = String(loc?.kind || "").trim();
  if (!kind) return "—";
  if (kind === "bunkerSilo") return t("storage.bunker.generic");
  return kind;
}

const COMMODITY_GLYPHS: Record<string, string> = {
  WHEAT: "🌾",
  BARLEY: "🌾",
  OAT: "🌾",
  OATS: "🌾",
  CANOLA: "🌼",
  RAPE: "🌼",
  CORN: "🌽",
  MAIZE: "🌽",
  SUNFLOWER: "🌻",
  SOYBEAN: "🫘",
  SOYBEANS: "🫘",
  RICE: "🍚",
  POTATO: "🥔",
  POTATOES: "🥔",
  SUGAR_BEET: "🍠",
  SUGARBEET: "🍠",
  STRAW: "🌾",
  GRASS: "🌿",
  HAY: "🌿",
  SILAGE: "🥗",
  DRYGRASS_WINDROW: "🌿",
  GRASS_WINDROW: "🌿",
  DIESEL: "⛽",
  DEF: "💧",
  LIME: "🪨",
  SEEDS: "🌱",
  MANURE: "♻",
  SLURRY: "💧",
  HERBICIDE: "🧪",
  LIQUID_FERTILIZER: "🧴",
  MINERAL_FERTILIZER: "🧴",
  FERTILIZER: "🧴",
  STONE: "🪨",
  WOOD: "🪵",
  WOOD_CHIPS: "🪵",
};

/** Compact glyph for commodity rows (ui-v2 has no Bootstrap icons). */
export function commodityGlyph(fillTypeKey: unknown): string {
  const key = String(fillTypeKey || "").toUpperCase();
  if (COMMODITY_GLYPHS[key]) return COMMODITY_GLYPHS[key];
  if (key.includes("FERT") || key.includes("HERB")) return "🧴";
  if (key.includes("GRASS") || key.includes("HAY") || key.includes("STRAW")) return "🌿";
  if (key.includes("MILK") || key.includes("SLURRY")) return "💧";
  return "📦";
}

export function resolveCommodityGlyph(item: StockItem, displayName: string): string {
  const raw = cropKeyForDisplay(item, displayName);
  return commodityGlyph(raw);
}

function cropKeyForDisplay(item: StockItem, displayName: string): string {
  const ft = String(item?.fillType || "").trim();
  if (ft && !/^\d+$/.test(ft)) return ft.toUpperCase();
  return displayName.replace(/\s+/g, "_").toUpperCase();
}

export function computeStockSummary(items: EnrichedStockItem[]): {
  totalLiters: number;
  totalValue: number;
  greatDemandCount: number;
} {
  let totalLiters = 0;
  let totalValue = 0;
  let greatDemandCount = 0;
  for (const item of items) {
    const liters = Number(item.totalLiters) || 0;
    const pricePer1000 = item._pricePer1000 ?? resolvePricePer1000(item, item._crop);
    totalLiters += liters;
    totalValue += computeValue(liters, pricePer1000);
    if (item.greatDemand) greatDemandCount += 1;
  }
  return { totalLiters, totalValue, greatDemandCount };
}

/** Persist expanded commodity rows across live payload refreshes. */
const expandedStockRowKeys = new Set<string>();

export function isStockRowExpanded(key: string): boolean {
  return expandedStockRowKeys.has(key);
}

export function setStockRowExpanded(key: string, expanded: boolean): void {
  if (expanded) expandedStockRowKeys.add(key);
  else expandedStockRowKeys.delete(key);
}

export function stockEmptyReason(
  stock: StockPayload | null | undefined,
  farmId: number | null | undefined,
  itemCount: number
): "disabled" | "empty" | null {
  if (stock?.enabled === false) return "disabled";
  const row = getStockForActiveFarm(stock, farmId);
  if (!row && itemCount === 0) return "empty";
  if (itemCount === 0) return "empty";
  return null;
}
