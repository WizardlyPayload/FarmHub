/** Resolve sparse DS fill-type labels using storage context + catalog merges. */

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

export function resolveStockItemFillType(item, catalog) {
  const idx = Number(item?.fillTypeIndex);
  const cat = catalog && typeof catalog === "object" ? catalog : {};
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

export function enrichStockFillTypes(stock, catalog) {
  if (!stock?.byFarm || typeof stock.byFarm !== "object") {
    return { stock, catalog: { ...(catalog || {}) } };
  }
  const nextCatalog = { ...(catalog || {}) };
  const nextStock = { ...stock, byFarm: {} };

  for (const [fid, farm] of Object.entries(stock.byFarm)) {
    const items = (farm?.items || []).map((item) => {
      const resolved = resolveStockItemFillType(item, nextCatalog);
      const idx = Number(resolved.fillTypeIndex);
      if (idx > 0) {
        const label = resolved.fillType || resolved.fillTypeDisplay;
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

export function displayFillTypeLabel(item, catalog) {
  const idx = Number(item?.fillTypeIndex);
  const cat = catalog && typeof catalog === "object" ? catalog : {};
  if (idx > 0 && (cat[String(idx)] || cat[idx])) {
    const mapped = cat[String(idx)] || cat[idx];
    if (String(mapped).includes(" ") || String(mapped).includes("-")) {
      return String(mapped);
    }
    return humanizeFillTypeName(mapped);
  }
  if (item?.fillTypeDisplay) return String(item.fillTypeDisplay).trim();
  const raw = String(item?.fillType || "").trim();
  if (raw && !/^\d+$/.test(raw)) return humanizeFillTypeName(raw);
  return null;
}
