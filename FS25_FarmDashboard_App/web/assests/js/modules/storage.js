// FS25 FarmDashboard | storage.js | v2.0.0
// Farm-wide fill-type stock — Economy → Storage tab (in-game commodity table layout).

import { t } from "../i18n/i18n.js";
import {
  buildMoistureEnvironmentHtml,
  buildBaleMoistureSummaryHtml,
  formatMoisturePercent,
  moistureGradeLabel,
} from "./moisture.js";
import { resolveStockItemFillType } from "./fillTypeResolve.js";

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

function mergeFillTypeCatalog(...sources) {
  const out = {};
  for (const src of sources) {
    if (!src || typeof src !== "object") continue;
    for (const [k, v] of Object.entries(src)) {
      const name = String(v ?? "").trim();
      if (name && !/^\d+$/.test(name)) out[String(k)] = name;
    }
  }
  return out;
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
  return mergeFillTypeCatalog(
    dashboard?.fillTypeCatalog,
    dashboard?.stock?.fillTypeCatalog,
    economy.fillTypeCatalog,
    mp.fillTypesByIndex,
    catalogFromMapCrops(dashboard),
    fromNameToIndex,
    fromCrops,
    fromSellPoints
  );
}

export function resolveFillTypeCatalog(dashboard) {
  return buildFillTypeCatalog(dashboard);
}

function cropKeyForItem(item) {
  const raw = String(item?.fillType || "").trim();
  if (raw && !/^\d+$/.test(raw)) return raw.toUpperCase();
  return "";
}

function findCropForItem(item, economy) {
  const key = cropKeyForItem(item);
  const crops = economy?.marketPrices?.crops || {};
  if (key && crops[key]) return crops[key];
  if (key) {
    const found = Object.entries(crops).find(
      ([name]) => name.toUpperCase() === key
    );
    if (found) return found[1];
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
export function enrichStockItem(item, stock, economy, rootCatalog) {
  const out = { ...item, locations: normalizeLocations(item?.locations) };
  const idx = Number(out.fillTypeIndex);
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
  for (const [name, crop] of Object.entries(economy?.marketPrices?.crops || {})) {
    const cidx = crop?.fillTypeIndex;
    if (cidx != null && !catalog[String(cidx)]) catalog[String(cidx)] = name;
  }
  for (const station of Object.values(economy?.marketPrices?.sellPoints || {})) {
    if (!station?.prices || typeof station.prices !== "object") continue;
    for (const [productName, priceInfo] of Object.entries(station.prices)) {
      const cidx = priceInfo?.fillTypeIndex;
      if (cidx != null && !catalog[String(cidx)]) catalog[String(cidx)] = productName;
    }
  }
  const resolved = resolveStockItemFillType(out, catalog);
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

export function enrichStockItems(items, stock, economy, rootCatalog) {
  const list = Array.isArray(items) ? items : [];
  return list
    .map((item) => enrichStockItem(item, stock, economy, rootCatalog))
    .filter((item) => Number(item.totalLiters) > 0);
}

function displayFillTypeName(item, catalog) {
  const idx = Number(item?.fillTypeIndex);
  const cat = catalog && typeof catalog === "object" ? catalog : {};
  let rawKey = "";
  if (idx > 0 && (cat[String(idx)] || cat[idx])) {
    rawKey = cat[String(idx)] || cat[idx];
  } else if (item?.fillTypeDisplay) {
    return formatCommodityLabel(String(item.fillTypeDisplay).trim());
  } else if (item?.fillTypeTitle) {
    return formatCommodityLabel(String(item.fillTypeTitle).trim());
  } else if (item?.fillType && !/^\d+$/.test(String(item.fillType).trim())) {
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
        const grade = loc.grade != null ? moistureGradeLabel(loc.grade) : "—";
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

function buildCommodityRow(item, idx, catalog) {
  const rawKey = cropKeyForItem(item) || displayFillTypeName(item, catalog).toUpperCase();
  const name = escapeHtml(displayFillTypeName(item, catalog));
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

  return `
    <tr class="fs-commodity-row" id="${rowId}" data-detail-id="${detailId}" tabindex="0"
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

function buildCommodityTable(items, catalog) {
  const sorted = [...items].sort((a, b) =>
    displayFillTypeName(a, catalog).localeCompare(displayFillTypeName(b, catalog))
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
            ${sorted.map((item, i) => buildCommodityRow(item, i, catalog)).join("")}
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

/** Silo / bunker stock block for the Economy storage tab (no page chrome). */
export function buildStockPanelHTML(dashboard) {
  const farmId = dashboard.activeFarmId ?? 1;
  const stock = dashboard.stock;
  const farmRow = getStockForActiveFarm(stock, farmId);
  const catalog = resolveFillTypeCatalog(dashboard);
  const items = enrichStockItems(
    farmRow?.items,
    stock,
    dashboard.economy,
    catalog
  );
  const envHtml = buildMoistureEnvironmentHtml(dashboard.weather);
  const baleMoistHtml = buildBaleMoistureSummaryHtml(dashboard.baleInventory, farmId);

  const stockBody =
    items.length === 0
      ? `<div class="alert alert-secondary mb-0">${escapeHtml(t("storage.hintEmpty"))}</div>`
      : buildCommodityTable(items, catalog);

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
  bindCommodityTableInteractions(el.querySelector("#economy-storage-panel-root"));
}
