/** Resolve sparse DS fill-type labels using storage context + catalog merges. */

function toArr(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "object") return Object.values(val);
  return [];
}

function humanizeFillTypeName(fillType) {
  return String(fillType || "Unknown")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Guess fill type from where the liters live (tank/building names). */
export function inferFillTypeFromLocations(locations) {
  const blob = (locations || [])
    .map((loc) => String(loc?.name || ""))
    .join(" ")
    .toLowerCase();
  if (!blob) return null;

  if (/herbicide|liquid fert|liquid fertiliser|liquid fertilizer/.test(blob)) {
    return { name: "LIQUID_FERTILIZER", display: "Liquid Fertilizer" };
  }
  if (/fertilizer tank|fertiliser tank|stainless steel fertilizer/.test(blob)) {
    return { name: "MINERAL_FERTILIZER", display: "Mineral Fertilizer" };
  }
  if (/lime station|^\s*lime\b/.test(blob)) {
    return { name: "LIME", display: "Lime" };
  }
  if (/manure heap|manure/.test(blob)) {
    return { name: "MANURE", display: "Manure" };
  }
  if (/slurry/.test(blob)) {
    return { name: "SLURRY", display: "Slurry" };
  }
  if (/diesel|petrol|fuel/.test(blob)) {
    return { name: "DIESEL", display: "Diesel" };
  }
  if (/cow shed|milking|husbandry|dairy/.test(blob)) {
    return { name: "STRAW", display: "Straw" };
  }
  return null;
}

/** Resolve a fill-type label from economy crops, sell points, and catalogs when index maps are sparse. */
export function lookupFillTypeNameFromEconomy(fillTypeIndex, economy) {
  const idx = Number(fillTypeIndex);
  if (!Number.isFinite(idx) || idx <= 0) return null;
  const key = String(idx);
  const mp = economy?.marketPrices || {};

  for (const [name, crop] of Object.entries(mp.crops || {})) {
    if (Number(crop?.fillTypeIndex) === idx) return name;
  }
  if (mp.nameToIndex && typeof mp.nameToIndex === "object") {
    for (const [name, mapIdx] of Object.entries(mp.nameToIndex)) {
      if (Number(mapIdx) === idx) return name;
    }
  }
  const fromByIndex = mp.fillTypesByIndex?.[key] || economy?.fillTypeCatalog?.[key];
  if (fromByIndex && String(fromByIndex).trim() !== "") return String(fromByIndex);

  const fromTitle =
    mp.fillTypeTitles?.[key] ||
    economy?.fillTypeTitles?.[key];
  if (fromTitle && String(fromTitle).trim() !== "") return String(fromTitle);

  for (const station of Object.values(mp.sellPoints || {})) {
    if (!station?.prices || typeof station.prices !== "object") continue;
    for (const [productName, priceInfo] of Object.entries(station.prices)) {
      if (Number(priceInfo?.fillTypeIndex) === idx) return productName;
    }
  }
  return null;
}

export function mergeFillTypeCatalog(...sources) {
  const out = {};
  for (const src of sources) {
    if (!src || typeof src !== "object") continue;
    for (const [key, val] of Object.entries(src)) {
      if (val != null && String(val).trim() !== "") out[String(key)] = String(val);
    }
  }
  return out;
}

/** Fill catalog gaps with localized titles when internal names are missing. */
export function applyFillTypeTitles(catalog, titles) {
  if (!titles || typeof titles !== "object") return { ...(catalog || {}) };
  const out = { ...(catalog || {}) };
  for (const [key, val] of Object.entries(titles)) {
    const title = String(val || "").trim();
    if (!title) continue;
    const k = String(key);
    const cur = out[k];
    if (cur == null || String(cur).trim() === "" || /^\d+$/.test(String(cur).trim())) {
      out[k] = title;
    }
  }
  return out;
}

export function titleForIndex(idx, titles) {
  const key = String(idx);
  const t = titles?.[key] ?? titles?.[idx];
  return t != null && String(t).trim() !== "" ? String(t).trim() : null;
}

export function resolveStockItemFillType(item, catalog, titles) {
  const idx = Number(item?.fillTypeIndex);
  const cat = catalog && typeof catalog === "object" ? catalog : {};
  const titleMap = titles && typeof titles === "object" ? titles : {};
  const out = { ...item };

  if (idx > 0 && (cat[String(idx)] || cat[idx])) {
    const mapped = cat[String(idx)] || cat[idx];
    if (!out.fillType || /^\d+$/.test(String(out.fillType).trim())) {
      out.fillType = mapped;
    }
    return out;
  }

  const display = out.fillTypeDisplay || out.fillTypeTitle;
  if (display != null && String(display).trim() !== "") {
    if (!out.fillType || /^\d+$/.test(String(out.fillType).trim())) {
      out.fillType = String(display).trim();
    }
    return out;
  }

  if (idx > 0) {
    const fromTitle = titleForIndex(idx, titleMap);
    if (fromTitle && (!out.fillType || /^\d+$/.test(String(out.fillType).trim()))) {
      out.fillType = fromTitle;
      out.fillTypeTitle = out.fillTypeTitle || fromTitle;
      return out;
    }
  }

  const raw = String(out.fillType || "").trim();
  if (raw && !/^\d+$/.test(raw)) return out;

  const inferred = inferFillTypeFromLocations(out.locations);
  if (inferred) {
    out.fillType = inferred.name;
    out.fillTypeDisplay = inferred.display;
    if (idx > 0) cat[String(idx)] = inferred.name;
  }
  return out;
}

export function enrichStockFillTypes(stock, catalog, titles) {
  if (!stock?.byFarm || typeof stock.byFarm !== "object") {
    return {
      stock,
      catalog: applyFillTypeTitles(catalog || {}, titles),
    };
  }
  const nextCatalog = applyFillTypeTitles({ ...(catalog || {}) }, titles);
  const nextStock = { ...stock, byFarm: {} };

  for (const [fid, farm] of Object.entries(stock.byFarm)) {
    const items = toArr(farm?.items).map((item) => {
      const resolved = resolveStockItemFillType(item, nextCatalog, titles);
      const idx = Number(resolved.fillTypeIndex);
      if (idx > 0) {
        const label =
          resolved.fillType ||
          resolved.fillTypeDisplay ||
          resolved.fillTypeTitle ||
          titleForIndex(idx, titles);
        if (label && !/^\d+$/.test(String(label))) {
          nextCatalog[String(idx)] = nextCatalog[String(idx)] || String(label);
        }
      }
      return resolved;
    });
    nextStock.byFarm[fid] = { ...farm, items };
  }

  return { stock: nextStock, catalog: nextCatalog };
}

export function normalizePlaceableKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function placeableKeywords(pl) {
  const parts = [pl?.name, pl?.displayName, pl?.basename, pl?.filename]
    .filter(Boolean)
    .map((s) => normalizePlaceableKey(s))
    .filter(Boolean);
  const out = new Set();
  for (const p of parts) {
    out.add(p);
    for (const token of p.match(/[a-z0-9]{4,}/g) || []) out.add(token);
  }
  return out;
}

function locationKeywords(item) {
  const blob = (item?.locations || []).map((loc) => String(loc?.name || "")).join(" ");
  const key = normalizePlaceableKey(blob);
  const out = new Set();
  if (key) out.add(key);
  for (const token of key.match(/[a-z0-9]{4,}/g) || []) out.add(token);
  return out;
}

function scorePlaceableForStockItem(item, pl, farmId) {
  if (!pl || Number(pl.farmId) !== Number(farmId)) return 0;
  const siloTypes = toArr(pl?.siloFillTypes).map((t) => String(t).trim()).filter(Boolean);
  if (siloTypes.length === 0) return 0;

  const locKeys = locationKeywords(item);
  const plKeys = placeableKeywords(pl);
  let score = 0;
  for (const lk of locKeys) {
    for (const pk of plKeys) {
      if (lk === pk) score = Math.max(score, 100);
      else if (lk.includes(pk) || pk.includes(lk)) score = Math.max(score, 60);
    }
  }

  const idx = Number(item?.fillTypeIndex);
  const liters = Number(item?.totalLiters) || 0;
  for (const ft of siloTypes) {
    const ftKey = normalizePlaceableKey(ft);
    if (!ftKey) continue;
    if (locKeys.has(ftKey)) score = Math.max(score, 95);
    for (const lk of locKeys) {
      if (lk.includes(ftKey) || ftKey.includes(lk)) score = Math.max(score, 85);
    }
  }
  if (idx > 0 && liters > 0 && pl?.storageFillLevels && typeof pl.storageFillLevels === "object") {
    for (const [ftName, lit] of Object.entries(pl.storageFillLevels)) {
      if (Math.abs(Number(lit) - liters) <= Math.max(500, liters * 0.05)) {
        score = Math.max(score, 80);
      }
      if (String(ftName).trim() === String(idx)) score = Math.max(score, 70);
    }
  }

  if (score === 0 && siloTypes.length === 1) score = 15;
  return score;
}

export function findPlaceableForStockItem(item, placeables, farmId) {
  let best = null;
  let bestScore = 0;
  let tieCount = 0;
  for (const pl of placeables || []) {
    const score = scorePlaceableForStockItem(item, pl, farmId);
    if (score <= 0) continue;
    if (score > bestScore) {
      bestScore = score;
      best = pl;
      tieCount = 1;
    } else if (score === bestScore) {
      tieCount += 1;
    }
  }
  if (bestScore < 60 && tieCount !== 1) return null;
  return bestScore > 0 ? best : null;
}

function resolveFillTypeNameForItem(item, pl, catalog) {
  const idx = Number(item?.fillTypeIndex);
  const siloTypes = toArr(pl?.siloFillTypes).map((t) => String(t).trim()).filter(Boolean);
  if (siloTypes.length === 0) return null;

  for (const ftName of siloTypes) {
    const upper = ftName.toUpperCase();
    const knownIdx = Object.entries(catalog || {}).find(
      ([, val]) => String(val).trim().toUpperCase() === upper
    )?.[0];
    if (Number(knownIdx) === idx) return ftName;
  }

  if (pl?.storageFillLevels && typeof pl.storageFillLevels === "object") {
    for (const [ftName, lit] of Object.entries(pl.storageFillLevels)) {
      if (/^\d+$/.test(String(ftName).trim()) && Number(ftName) === idx) {
        const named = siloTypes.find((t) => !/^\d+$/.test(t));
        if (named) return named;
      }
      const liters = Number(item?.totalLiters) || 0;
      if (liters > 0 && Math.abs(Number(lit) - liters) <= Math.max(500, liters * 0.05)) {
        if (!/^\d+$/.test(String(ftName).trim())) return String(ftName).trim();
      }
    }
  }

  if (siloTypes.length === 1) return siloTypes[0];
  return null;
}

/** Map unresolved stock indices from savegame placeables.xml silo fill type names. */
export function enrichStockFillTypesFromPlaceables(stock, placeables, catalog) {
  if (!stock?.byFarm || typeof stock.byFarm !== "object") {
    return { stock, catalog: { ...(catalog || {}) } };
  }
  const nextCatalog = { ...(catalog || {}) };
  const nextStock = { ...stock, byFarm: {} };

  for (const [fid, farm] of Object.entries(stock.byFarm)) {
    const farmId = Number(farm?.farmId ?? fid);
    const items = toArr(farm?.items).map((item) => {
      const out = { ...item };
      const idx = Number(out.fillTypeIndex);
      const hasName =
        out.fillType &&
        String(out.fillType).trim() !== "" &&
        !/^\d+$/.test(String(out.fillType).trim());
      if (!Number.isFinite(idx) || idx <= 0) return out;
      if (hasName && nextCatalog[String(idx)]) return out;

      const pl = findPlaceableForStockItem(out, placeables, farmId);
      if (!pl) return out;

      const matched = resolveFillTypeNameForItem(out, pl, nextCatalog);
      if (matched) {
        out.fillType = matched;
        nextCatalog[String(idx)] = matched;
      }
      return out;
    });
    nextStock.byFarm[fid] = { ...farm, items };
  }

  return { stock: nextStock, catalog: nextCatalog };
}

export function displayFillTypeLabel(item, catalog, titles, economy) {
  const idx = Number(item?.fillTypeIndex);
  const cat = catalog && typeof catalog === "object" ? catalog : {};
  const titleMap = titles && typeof titles === "object" ? titles : {};

  if (idx > 0 && (cat[String(idx)] || cat[idx])) {
    const mapped = cat[String(idx)] || cat[idx];
    if (String(mapped).includes(" ") || String(mapped).includes("-")) {
      return String(mapped);
    }
    return humanizeFillTypeName(mapped);
  }
  if (item?.fillTypeDisplay) return String(item.fillTypeDisplay).trim();
  if (item?.fillTypeTitle) return String(item.fillTypeTitle).trim();
  if (idx > 0) {
    const fromTitles = titleForIndex(idx, titleMap);
    if (fromTitles) return fromTitles;
  }
  if (economy && idx > 0) {
    const fromEcon = lookupFillTypeNameFromEconomy(idx, economy);
    if (fromEcon) {
      if (String(fromEcon).includes(" ") || String(fromEcon).includes("-")) {
        return String(fromEcon);
      }
      return humanizeFillTypeName(fromEcon);
    }
  }
  const raw = String(item?.fillType || "").trim();
  if (raw && !/^\d+$/.test(raw)) return humanizeFillTypeName(raw);
  return null;
}
