// FS25 FarmDashboard | storage.js | v2.0.0
// Farm-wide fill-type stock — Economy → Storage tab (in-game commodity table layout).

import { t } from "../i18n/i18n.js";

/** Persist expanded commodity rows across live data refreshes (~10s). */
const expandedStockRowKeys = new Set();

function stockRowKey(item, idx) {
  const ft = Number(item?.fillTypeIndex) || 0;
  if (ft > 0) return `idx:${ft}`;
  const name = String(item?.fillType || "").trim().toUpperCase();
  if (name) return `name:${name}`;
  return `row:${idx}`;
}
import {
  buildMoistureEnvironmentHtml,
  buildBaleMoistureSummaryHtml,
  formatMoisturePercent,
  moistureGradeLabel,
} from "./moisture.js";
import { resolveStockItemFillType, mergeFillTypeCatalog, lookupFillTypeNameFromEconomy, applyFillTypeTitles, titleForIndex, enrichStockFillTypesFromPlaceables } from "./fillTypeResolve.js";

const DISPLAY_NAMES = {
  WHEAT: "Wheat",
  BARLEY: "Barley",
  OAT: "Oat",
  OATS: "Oats",
  CANOLA: "Canola",
  CORN: "Corn",
  MAIZE: "Corn",
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

function formatCommodityLabel(name) {
  const key = String(name || "").toUpperCase();
  if (DISPLAY_NAMES[key]) return DISPLAY_NAMES[key];
  if (!key) return "";
  return humanizeFillTypeName(key);
}

function escapeHtml(s) {
  if (s == null || s === "") return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatLiters(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} l`;
}

function formatMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

function formatPricePer1000(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

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
];

const SEASON_PERIOD_MONTHS = {
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

/** Peak season month from XML history or Lua economy export (matches in-game price table). */
export function resolveMaxPriceMonth(crop) {
  if (!crop || typeof crop !== "object") return null;
  if (crop.maxPriceMonth) return String(crop.maxPriceMonth);
  const history = crop.priceHistory;
  if (!history || typeof history !== "object") return null;

  let bestPeriod = null;
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
    return SEASON_PERIODS[idx - 1]
      ? SEASON_PERIOD_MONTHS[SEASON_PERIODS[idx - 1]]
      : null;
  }
  return null;
}

function humanizeFillTypeName(fillType) {
  return String(fillType || "Unknown")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeLocations(locations) {
  if (Array.isArray(locations)) return locations;
  if (locations && typeof locations === "object") return Object.values(locations);
  return [];
}

function catalogFromMapCrops(dashboard) {
  const out = {};
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
    : Object.values(dashboard?.fields || {});
  for (const f of fields) {
    const label = String(f?.fruitType || "").trim().toUpperCase();
    if (!label || skip.has(label)) continue;
    const idx = Number(nameToIndex[label] ?? cropMap[label]);
    if (idx > 0) out[String(idx)] = label;
  }
  return out;
}

function collectFillTypeTitles(dashboard) {
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
export function buildFillTypeCatalog(dashboard) {
  const economy = dashboard?.economy || {};
  const mp = economy.marketPrices || {};
  const fromNameToIndex = {};
  if (mp.nameToIndex && typeof mp.nameToIndex === "object") {
    for (const [name, idx] of Object.entries(mp.nameToIndex)) {
      if (idx != null) fromNameToIndex[String(idx)] = name;
    }
  }
  const fromCrops = {};
  for (const [name, crop] of Object.entries(mp.crops || {})) {
    const idx = crop?.fillTypeIndex;
    if (idx != null) fromCrops[String(idx)] = name;
  }
  const fromSellPoints = {};
  for (const station of Object.values(mp.sellPoints || {})) {
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

export function resolveFillTypeTitles(dashboard) {
  return collectFillTypeTitles(dashboard);
}

export function resolveFillTypeCatalog(dashboard) {
  return buildFillTypeCatalog(dashboard);
}

function cropKeyForItem(item) {
  const raw = String(item?.fillType || "").trim();
  if (raw && !/^\d+$/.test(raw)) return raw.toUpperCase();
  return "";
}

/** economy.xml names that differ from silo / UI labels (e.g. hay is DRYGRASS in save XML). */
const ECONOMY_CROP_ALIASES = {
  HAY: ["DRYGRASS", "DRYGRASS_WINDROW"],
  DRYGRASS_WINDROW: ["DRYGRASS"],
};

function lookupCropByName(crops, name) {
  if (!name || !crops || typeof crops !== "object") return null;
  const upper = String(name).toUpperCase();
  if (crops[upper]) return crops[upper];
  if (crops[name]) return crops[name];
  const found = Object.entries(crops).find(
    ([cropName]) => String(cropName).toUpperCase() === upper
  );
  if (found) return found[1];
  for (const alt of ECONOMY_CROP_ALIASES[upper] || []) {
    const hit = lookupCropByName(crops, alt);
    if (hit) return hit;
  }
  return null;
}

function findCropForItem(item, economy) {
  const crops = economy?.marketPrices?.crops || {};
  const key = cropKeyForItem(item);
  if (key) {
    const byName = lookupCropByName(crops, key);
    if (byName) return byName;
  }
  const idx = Number(item?.fillTypeIndex);
  if (Number.isFinite(idx)) {
    const byIdx = Object.values(crops).find(
      (crop) => Number(crop?.fillTypeIndex) === idx
    );
    if (byIdx) return byIdx;
    const catalogName =
      economy?.fillTypeCatalog?.[String(idx)] ||
      economy?.marketPrices?.fillTypesByIndex?.[String(idx)];
    if (catalogName) {
      const byCatalog = lookupCropByName(crops, catalogName);
      if (byCatalog) return byCatalog;
    }
  }
  return null;
}

function bestCropLocationPrice(crop) {
  if (!crop?.locations?.length) return 0;
  let best = 0;
  for (const loc of crop.locations) {
    const p = Number(loc?.price) || 0;
    if (p > best) best = p;
  }
  return best;
}

function resolvePricePer1000(item, crop) {
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

function resolveStationName(item, crop) {
  const station = item?.bestSellStation;
  if (station && station !== "Market" && station !== "Market Base Prices") {
    return station;
  }
  if (crop?.bestLocation && crop.bestLocation !== "Market Base Prices") {
    return crop.bestLocation;
  }
  if (crop?.locations?.length) {
    const sorted = [...crop.locations].sort(
      (a, b) => (Number(b.price) || 0) - (Number(a.price) || 0)
    );
    const top = sorted[0];
    if (top?.name && top.name !== "Market Base Prices") return top.name;
    if (
      top?.name === "Market Base Prices" &&
      (Number(top.price) || 0) > 0
    ) {
      return top.name;
    }
  }
  if (
    crop?.bestLocation === "Market Base Prices" &&
    bestCropLocationPrice(crop) > 0
  ) {
    return crop.bestLocation;
  }
  return null;
}

function computeValue(liters, pricePer1000) {
  const lit = Number(liters) || 0;
  const price = Number(pricePer1000) || 0;
  if (lit <= 0 || price <= 0) return 0;
  return (lit * price) / 1000;
}

/** Resolve numeric fill types and back-fill sell hints from economy market data. */
export function enrichStockItem(item, stock, economy, rootCatalog, placeables, farmId) {
  const out = { ...item, locations: normalizeLocations(item?.locations) };
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
        Object.entries(economy.marketPrices.nameToIndex).map(([name, idx]) => [
          String(idx),
          name,
        ])
      )
  );
  const mergedCatalog = applyFillTypeTitles(catalog, titles);
  for (const [name, crop] of Object.entries(economy?.marketPrices?.crops || {})) {
    const cidx = crop?.fillTypeIndex;
    if (cidx != null && !mergedCatalog[String(cidx)]) mergedCatalog[String(cidx)] = name;
  }
  for (const station of Object.values(economy?.marketPrices?.sellPoints || {})) {
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
  const placeableItem = fromPlaceables.stock.byFarm["0"]?.items?.[0];
  if (placeableItem?.fillType && (!out.fillType || /^\d+$/.test(String(out.fillType).trim()))) {
    out.fillType = placeableItem.fillType;
    if (stockIdx > 0) {
      mergedCatalog[String(stockIdx)] = mergedCatalog[String(stockIdx)] || placeableItem.fillType;
    }
  }
  const resolved = resolveStockItemFillType(out, mergedCatalog, titles);
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

export function enrichStockItems(items, stock, economy, rootCatalog, placeables, farmId) {
  const list = Array.isArray(items) ? items : [];
  return list
    .map((item) => enrichStockItem(item, stock, economy, rootCatalog, placeables, farmId))
    .filter((item) => Number(item.totalLiters) > 0);
}

function displayFillTypeName(item, catalog, economy, titles) {
  const idx = Number(item?.fillTypeIndex);
  const cat = catalog && typeof catalog === "object" ? catalog : {};
  const titleMap = titles && typeof titles === "object" ? titles : {};
  let rawKey = "";
  if (idx > 0 && (cat[String(idx)] || cat[idx])) {
    rawKey = cat[String(idx)] || cat[idx];
  } else if (item?.fillTypeDisplay) {
    return formatCommodityLabel(String(item.fillTypeDisplay).trim());
  } else if (item?.fillTypeTitle) {
    return formatCommodityLabel(String(item.fillTypeTitle).trim());
  } else if (idx > 0) {
    const fromTitles = titleForIndex(idx, titleMap);
    if (fromTitles) return formatCommodityLabel(fromTitles);
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

const COMMODITY_ICONS = {
  WHEAT: "bi-flower1",
  BARLEY: "bi-flower1",
  OAT: "bi-flower1",
  OATS: "bi-flower1",
  CANOLA: "bi-flower1",
  RAPE: "bi-flower1",
  CORN: "bi-flower1",
  MAIZE: "bi-flower1",
  SUNFLOWER: "bi-flower1",
  SOYBEAN: "bi-flower1",
  SOYBEANS: "bi-flower1",
  RICE: "bi-flower1",
  POTATO: "bi-flower1",
  POTATOES: "bi-flower1",
  SUGAR_BEET: "bi-flower1",
  SUGARBEET: "bi-flower1",
  STRAW: "bi-layers",
  GRASS: "bi-layers",
  HAY: "bi-layers",
  SILAGE: "bi-layers",
  DRYGRASS_WINDROW: "bi-layers",
  GRASS_WINDROW: "bi-layers",
  DIESEL: "bi-fuel-pump",
  DEF: "bi-droplet",
  LIME: "bi-moisture",
  SEEDS: "bi-bag",
  MANURE: "bi-recycle",
  SLURRY: "bi-droplet-half",
  HERBICIDE: "bi-shield-check",
  LIQUID_FERTILIZER: "bi-droplet-fill",
  MINERAL_FERTILIZER: "bi-droplet-fill",
  FERTILIZER: "bi-droplet-fill",
  STONE: "bi-bricks",
  WOOD: "bi-tree",
  WOOD_CHIPS: "bi-tree",
};

function commodityIcon(fillTypeKey) {
  const key = String(fillTypeKey || "").toUpperCase();
  if (COMMODITY_ICONS[key]) return COMMODITY_ICONS[key];
  if (key.includes("FERT") || key.includes("HERB")) return "bi-droplet-fill";
  if (key.includes("GRASS") || key.includes("HAY") || key.includes("STRAW")) return "bi-layers";
  if (key.includes("MILK") || key.includes("SLURRY")) return "bi-droplet-half";
  return "bi-box-seam";
}

function trendIndicator(trend) {
  const tr = Number(trend);
  if (Number.isFinite(tr) && tr > 0) {
    return '<span class="fs-trend-dot up" aria-hidden="true">▲</span>';
  }
  if (Number.isFinite(tr) && tr < 0) {
    return '<span class="fs-trend-dot down" aria-hidden="true">▼</span>';
  }
  const s = String(trend || "").toLowerCase();
  if (s === "up" || s === "rising") {
    return '<span class="fs-trend-dot up" aria-hidden="true">▲</span>';
  }
  if (s === "down" || s === "falling") {
    return '<span class="fs-trend-dot down" aria-hidden="true">▼</span>';
  }
  return '<span class="fs-trend-dot flat" aria-hidden="true">−</span>';
}

export function getStockForActiveFarm(stock, farmId) {
  if (!stock || stock.enabled === false) return null;
  const fid = String(Number(farmId) || 1);
  return stock.byFarm?.[fid] || stock.byFarm?.[Number(fid)] || null;
}

export function getStockFillTypeCount(stock, farmId) {
  const row = getStockForActiveFarm(stock, farmId);
  if (!row) return 0;
  if (Number.isFinite(row.fillTypeCount)) return row.fillTypeCount;
  return Array.isArray(row.items) ? row.items.length : 0;
}

function formatQualityDisplay(loc) {
  if (loc.qualityPct != null && Number.isFinite(Number(loc.qualityPct))) {
    return `${Math.round(Number(loc.qualityPct))}%`;
  }
  if (loc.grade != null && loc.grade !== "") {
    return moistureGradeLabel(loc.grade);
  }
  return "—";
}

function locationDetailRows(locations) {
  const list = normalizeLocations(locations);
  if (list.length === 0) {
    return `<p class="fs-commodity-muted small mb-0">${escapeHtml(t("storage.noLocations"))}</p>`;
  }
  return `<table class="fs-commodity-loc-table">
    <thead><tr>
      <th>${escapeHtml(t("storage.colLocation"))}</th>
      <th>${escapeHtml(t("storage.colKind"))}</th>
      <th class="text-end">${escapeHtml(t("storage.colLiters"))}</th>
      <th>${escapeHtml(t("storage.colMoisture"))}</th>
    </tr></thead>
    <tbody>${list
      .map((loc) => {
        const moist =
          loc.moisturePct != null ? formatMoisturePercent(loc.moisturePct) : "—";
        const grade = formatQualityDisplay(loc);
        return `<tr>
          <td>${escapeHtml(loc.name || "—")}</td>
          <td>${escapeHtml(loc.kind || "—")}</td>
          <td class="text-end">${formatLiters(loc.liters)}</td>
          <td>${moist !== "—" || grade !== "—" ? `${moist} · ${escapeHtml(grade)}` : "—"}</td>
        </tr>`;
      })
      .join("")}</tbody>
  </table>`;
}

function buildCommodityRow(item, idx, catalog, economy, titles) {
  const rawKey = cropKeyForItem(item) || displayFillTypeName(item, catalog, economy, titles).toUpperCase();
  const name = escapeHtml(displayFillTypeName(item, catalog, economy, titles));
  const icon = commodityIcon(rawKey);
  const liters = Number(item.totalLiters) || 0;
  const pricePer1000 = item._pricePer1000 ?? resolvePricePer1000(item, item._crop);
  const value = computeValue(liters, pricePer1000);
  const maxPrice = Number(item._maxPrice) || 0;
  const maxValue = computeValue(liters, maxPrice);
  const maxMonth = item._maxPriceMonth || resolveMaxPriceMonth(item._crop);
  const station = resolveStationName(item, item._crop);
  const hasSell = pricePer1000 > 0 && station;
  const valueHighlight = value > 0 && (item.greatDemand || value >= 10000);

  const detailId = `fs-commodity-detail-${idx}`;
  const rowId = `fs-commodity-row-${idx}`;
  const rowKey = stockRowKey(item, idx);

  return `
    <tr class="fs-commodity-row" id="${rowId}" data-detail-id="${detailId}" data-stock-key="${escapeHtml(rowKey)}" tabindex="0"
        aria-expanded="false" title="${escapeHtml(t("storage.expandRow"))}">
      <td>
        <div class="fs-commodity-name">
          <span class="fs-commodity-icon"><i class="bi ${icon}"></i></span>
          <span>${name}${item.greatDemand ? ` <span class="badge bg-warning text-dark ms-1">${escapeHtml(t("storage.greatDemand"))}</span>` : ""}</span>
        </div>
      </td>
      <td class="fs-commodity-stock">${formatLiters(liters)}</td>
      <td class="text-end">
        <span class="fs-commodity-price">
          ${pricePer1000 > 0 ? formatPricePer1000(pricePer1000) : "—"}
          ${pricePer1000 > 0 ? trendIndicator(item.priceTrend) : ""}
        </span>
      </td>
      <td class="fs-value-cell${valueHighlight ? " is-highlight" : ""}">${value > 0 ? formatMoney(value) : "—"}</td>
      <td class="fs-commodity-station">${hasSell ? escapeHtml(station) : `<span class="fs-commodity-muted">${escapeHtml(t("storage.noSellingPoint"))}</span>`}</td>
      <td class="text-end fs-value-cell">${maxPrice > 0 ? formatPricePer1000(maxPrice) : "—"}</td>
      <td class="text-end fs-value-cell">${maxValue > 0 ? formatMoney(maxValue) : "—"}</td>
      <td class="text-center fs-commodity-muted">${maxMonth ? escapeHtml(maxMonth) : "—"}</td>
    </tr>
    <tr class="fs-commodity-detail-row d-none" id="${detailId}" data-parent-row="${rowId}">
      <td colspan="8">
        <div class="fs-commodity-detail-inner">${locationDetailRows(item.locations)}</div>
      </td>
    </tr>`;
}

function buildCommodityTable(items, catalog, economy, titles) {
  const sorted = [...items].sort((a, b) =>
    displayFillTypeName(a, catalog, economy, titles).localeCompare(
      displayFillTypeName(b, catalog, economy, titles)
    )
  );

  return `
    <div class="fs-commodity-panel">
      <div class="fs-commodity-table-wrap">
        <table class="fs-commodity-table">
          <thead>
            <tr>
              <th>${escapeHtml(t("storage.colCommodity"))}</th>
              <th>${escapeHtml(t("storage.colStock"))}</th>
              <th class="text-end">${escapeHtml(t("storage.colPrice"))}</th>
              <th class="text-end">${escapeHtml(t("storage.colValue"))}</th>
              <th>${escapeHtml(t("storage.colStations"))}</th>
              <th class="text-end">${escapeHtml(t("storage.colMaxPrice"))}</th>
              <th class="text-end">${escapeHtml(t("storage.colMaxValue"))}</th>
              <th class="text-center">${escapeHtml(t("storage.colMaxMonth"))}</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((item, i) => buildCommodityRow(item, i, catalog, economy, titles)).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

function bindCommodityTableInteractions(root) {
  if (!root) return;
  const toggleRow = (row) => {
    const detailId = row?.dataset?.detailId;
    if (!detailId) return;
    const detail = document.getElementById(detailId);
    if (!detail) return;
    const expanded = row.classList.toggle("is-expanded");
    detail.classList.toggle("d-none", !expanded);
    row.setAttribute("aria-expanded", expanded ? "true" : "false");
    row.title = expanded ? t("storage.collapseRow") : t("storage.expandRow");
    const key = row.dataset?.stockKey;
    if (key) {
      if (expanded) expandedStockRowKeys.add(key);
      else expandedStockRowKeys.delete(key);
    }
  };

  root.querySelectorAll(".fs-commodity-row").forEach((row) => {
    row.addEventListener("click", () => toggleRow(row));
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleRow(row);
      }
    });
  });
}

function restoreExpandedStockRows(root) {
  if (!root || expandedStockRowKeys.size === 0) return;
  root.querySelectorAll(".fs-commodity-row").forEach((row) => {
    const key = row.dataset?.stockKey;
    if (!key || !expandedStockRowKeys.has(key)) return;
    const detailId = row.dataset?.detailId;
    const detail = detailId ? document.getElementById(detailId) : null;
    if (!detail) return;
    row.classList.add("is-expanded");
    detail.classList.remove("d-none");
    row.setAttribute("aria-expanded", "true");
    row.title = t("storage.collapseRow");
  });
}

/** Silo / bunker stock block for the Economy storage tab (no page chrome). */
export function buildStockPanelHTML(dashboard) {
  const farmId = dashboard.activeFarmId ?? 1;
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
  const envHtml = buildMoistureEnvironmentHtml(dashboard.weather);
  const baleMoistHtml = buildBaleMoistureSummaryHtml(dashboard.baleInventory, farmId);

  const stockBody =
    items.length === 0
      ? `<div class="alert alert-secondary mb-0">${escapeHtml(t("storage.hintEmpty"))}</div>`
      : buildCommodityTable(items, catalog, dashboard.economy, titles);

  const countLine =
    items.length > 0
      ? `<p class="text-muted small mb-2">${escapeHtml(
          t("storage.subtitleCount", { count: items.length, farmId })
        )}</p>`
      : "";

  return `
    ${envHtml}
    <div class="mb-4" id="economy-storage-panel-root">
      <h5 class="text-farm-accent mb-2"><i class="bi bi-boxes me-2"></i>${escapeHtml(
        t("economy.storageSectionTitle")
      )}</h5>
      ${countLine}
      ${stockBody}
    </div>
    ${baleMoistHtml}`;
}

export function renderStockPanel(dashboard) {
  const el = document.getElementById("economy-storage-stock");
  if (!el) return;
  el.innerHTML = buildStockPanelHTML(dashboard);
  const root = el.querySelector("#economy-storage-panel-root");
  bindCommodityTableInteractions(root);
  restoreExpandedStockRows(root);
}
