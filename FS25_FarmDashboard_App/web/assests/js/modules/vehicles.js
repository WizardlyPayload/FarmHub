// FS25 FarmDashboard | vehicles.js | v2.0.0

import { getAPIBaseURL } from "./apiStorage.js";
import { t } from "../i18n/i18n.js";
import {
  getVehicleConditionFraction,
  getVehicleDamageFraction,
  isVehicleHighWear,
  isVehicleInAdsService,
  isVehicleAdsOverdue,
  countActiveAdsBreakdowns,
  summarizeAdsFleet,
  buildAdsVehiclePanelHtml,
  vehicleNeedsAdsWarning,
  isVehicleInNeedOfRepair,
  getWorstAdsInspectionSeverity,
  hasVisibleAdsBreakdowns,
} from "./vehicleAds.js";
import {
  vehicleHasYears,
  getVehicleModelYear,
  getVehicleDecadeLabel,
  isVehicleYearUnknown,
  getVehicleReliability,
  getVehicleMaintainability,
  formatReliabilityPercent,
} from "./vehicleYears.js";

function _safe(value) {
  const ns =
    (typeof globalThis !== "undefined" && globalThis.farmDashEscape) ||
    (typeof window !== "undefined" && window.farmDashEscape) ||
    null;
  if (ns && typeof ns.escapeHtml === "function") return ns.escapeHtml(value);
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** JSON may send farm ids as string or number — must match `applyApiMergedDataPayload` filtering. */
export function vehicleMatchesActiveFarm(v, activeFarmId) {
  const vf = Number(v?.ownerFarmId ?? v?.farmId ?? 0);
  const af = Number(activeFarmId ?? 1);
  return Number.isFinite(vf) && Number.isFinite(af) && vf === af;
}

/** Brand may be a string (Lua) or `{ title, name }` (XML / shop). */
export function resolveVehicleBrandLabel(brand) {
  if (brand == null || brand === "") return "";
  if (typeof brand === "object") {
    return String(
      brand.title || brand.name || brand.label || brand.displayName || ""
    ).trim();
  }
  return String(brand).trim();
}

export function resolveVehicleDisplayName(vehicle) {
  if (!vehicle || typeof vehicle !== "object") return "—";
  const n = String(vehicle.name ?? "").trim();
  if (n) return n;
  const tn = String(vehicle.typeName ?? "").trim();
  if (tn) return tn;
  return "—";
}

/** When local `_514_...SILOKING...1000+.png` is not shipped under items/, thumb onerror swaps to wiki. */
const SILOKING_TRAILEDLINE_WIKI_THUMB =
  "https://farmingsimulator.wiki.gg/images/thumb/d/d6/Siloking_trailedline_4.0_system_1000%2B.png/300px-Siloking_trailedline_4.0_system_1000%2B.png";

/** Filenames in assests/img/items/ from GET /api/item-image-filenames (primed in app.js before dashboard init). */
let itemsImageFilenames = [];
/** Filenames in assests/img/items_mod_extract/ from GET /api/item-image-filenames (primed in app.js before dashboard init). */
let modExtractImageFilenames = [];

/** Resolved local PNG paths / null — findVehicleImageDynamic is O(images) per vehicle. */
const vehicleImageMatchCache = new Map();
/** Full generateVehicleDisplay() results keyed by name|brand|type. */
const vehicleDisplayCache = new Map();

function buildVehicleImageCacheKey(vehicleName, brandName, typeName) {
  return `${String(vehicleName ?? "")}\0${String(brandName ?? "")}\0${String(typeName ?? "")}`;
}

function vehicleCardFingerprint(vehicle) {
  const skipFuelTypes = ["highPressureWasher", "High Pressure Washer"];
  let fuelPct = -1;
  if (vehicle.isMotorized && !skipFuelTypes.includes(vehicle.typeName)) {
    if (vehicle.fuelCapacity > 0 && vehicle.fuelLevel >= 0) {
      fuelPct = Math.round((vehicle.fuelLevel / vehicle.fuelCapacity) * 100);
    } else if (vehicle.fillLevels?.DIESEL) {
      const diesel = vehicle.fillLevels.DIESEL;
      fuelPct =
        diesel.capacity > 0
          ? Math.round((diesel.level / diesel.capacity) * 100)
          : 0;
    } else {
      fuelPct = 0;
    }
  }
  return [
    vehicle.id,
    vehicle.engineOn ? 1 : 0,
    fuelPct,
    Math.round(getVehicleDamageFraction(vehicle) * 100),
    Math.round(getVehicleConditionFraction(vehicle) * 100),
    getVehicleModelYear(vehicle) ?? "",
    countActiveAdsBreakdowns(vehicle),
    isVehicleInAdsService(vehicle) ? 1 : 0,
    isVehicleAdsOverdue(vehicle) ? 1 : 0,
    getWorstAdsInspectionSeverity(vehicle),
    hasVisibleAdsBreakdowns(vehicle) ? 1 : 0,
  ].join(":");
}

function vehicleListUiFingerprint(vehicles) {
  if (!Array.isArray(vehicles) || vehicles.length === 0) return "";
  return vehicles.map(vehicleCardFingerprint).join("|");
}

export function primeItemImageFilenames(list) {
  itemsImageFilenames = Array.isArray(list) ? list : [];
}

export function primeModExtractImageFilenames(list) {
  modExtractImageFilenames = Array.isArray(list) ? list : [];
}

/** Prime both shop image lists (call before dashboard init or after mod image rescan). */
export function primeShopImageFilenames({ items, modExtract } = {}) {
  if (items !== undefined) primeItemImageFilenames(items);
  if (modExtract !== undefined) primeModExtractImageFilenames(modExtract);
}

function clearVehicleImageMatchCaches(instance) {
  vehicleImageMatchCache.clear();
  vehicleDisplayCache.clear();
  if (instance) {
    instance.vehicleImageCacheCurated = null;
    instance.vehicleImageCacheCuratedBuilt = false;
    instance.vehicleImageCacheMod = null;
    instance.vehicleImageCacheModBuilt = false;
    instance._lastVehicleCardsFingerprint = "";
  }
}

export function setModExtractImageFilenames(list) {
  primeModExtractImageFilenames(list);
  this.vehicleImageCacheMod = null;
  this.vehicleImageCacheModBuilt = false;
  clearVehicleImageMatchCaches(this);
}

/** Refresh curated + mod filename lists from the server and invalidate match caches. */
export function setShopImageFilenames({ items, modExtract } = {}) {
  primeShopImageFilenames({ items, modExtract });
  clearVehicleImageMatchCaches(this);
}

/** Re-fetch /api/item-image-filenames after mod export; re-render vehicle cards when possible. */
export async function refreshShopImageFilenamesFromApi(dashboardInstance) {
  try {
    const r = await fetch("/api/item-image-filenames");
    const data = await r.json();
    window.__farmdashShopImageFilenames = [
      ...(Array.isArray(data?.items) ? data.items : []),
      ...(Array.isArray(data?.modExtract) ? data.modExtract : []),
    ];
    if (dashboardInstance && typeof dashboardInstance.setShopImageFilenames === "function") {
      dashboardInstance.setShopImageFilenames({
        items: data.items || [],
        modExtract: data.modExtract || [],
      });
      if (typeof dashboardInstance.renderVehicleCards === "function") {
        dashboardInstance.renderVehicleCards(dashboardInstance.vehicles || []);
      }
    } else {
      primeShopImageFilenames({
        items: data.items || [],
        modExtract: data.modExtract || [],
      });
      clearVehicleImageMatchCaches(null);
    }
    return data;
  } catch (e) {
    console.warn("[refreshShopImageFilenamesFromApi]", e);
    return null;
  }
}

/** Lowercase letters+digits only — same logical string for "Axial-Flow 9250" and "AxialFlow9250". */
function normalizeCompact(s) {
  if (!s) return "";
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Game strings may contain ü/ä/ö/ß; filenames often use ue/ae/oe/ss. Fold before stripping punctuation
 * so "Schwarzmüller" aligns with "Schwarzmueller".
 */
function normalizeCompactFold(s) {
  if (!s) return "";
  return String(s)
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/[\u002D\u2010-\u2015\u2212\uFF0D]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Game titles often add a variant suffix (e.g. "Vario 1067 V" → vario1067v) while mod PNGs use
 * store_vario1067 — try the same compact string without a single trailing letter after the model number.
 */
function compactVariantsForStrictFileMatch(vn) {
  const out = [vn];
  if (
    vn &&
    vn.length >= 8 &&
    /^[a-z]+\d{3,}[a-z]$/i.test(vn)
  ) {
    out.push(vn.slice(0, -1));
  }
  return out;
}

/** First 3–4 digit model number in normalized title (e.g. 728 from 728variogen71). */
function extractPrimaryModelNumberFromNorm(vehicleNameNorm) {
  if (!vehicleNameNorm) return null;
  const m = vehicleNameNorm.match(/(\d{3,4})/);
  return m ? parseInt(m[1], 10) : null;
}

function extractModelNumbersFromNormStr(norm) {
  if (!norm) return [];
  const m = String(norm).match(/\d{3,4}/g);
  if (!m) return [];
  return [...new Set(m.map((x) => parseInt(x, 10)))];
}

/** Same hundreds bucket: 728 vs 700 → both 7xx (one store icon for a whole line). */
function sameModelHundredSeries(a, b) {
  if (a == null || b == null || a < 100 || b < 100) return false;
  return Math.floor(a / 100) === Math.floor(b / 100);
}

/**
 * Mod shop DDS often covers a whole line (e.g. file vario700Gen6 vs in-game 728 Vario Gen7.1).
 * Requires brand in pack folder, "vario" on both sides, and matching 3-digit series (7xx).
 */
function modExtractSeriesPackMatch(vehicleNameNorm, brandNameNorm, img) {
  if (!vehicleNameNorm || !brandNameNorm || !img?.fullNorm) return false;
  if (brandNameNorm.length < 3) return false;
  if (!img.packNorm || img.packNorm.length < 4) return false;
  if (!img.packNorm.includes(brandNameNorm)) return false;
  if (!vehicleNameNorm.includes("vario") || !img.fullNorm.includes("vario")) {
    return false;
  }
  const primary = extractPrimaryModelNumberFromNorm(vehicleNameNorm);
  if (primary == null) return false;
  const hay = `${img.fullNorm || ""}${img.modelNorm || ""}${img.packNorm || ""}`;
  // 728 Gen7 etc. must not pick "FendtVarioEvolution" / "700 Vario E NRS" when a 700 Vario Series pack exists
  if (
    vehicleNameNorm.includes("728") &&
    img.packNorm &&
    img.packNorm.includes("fendtvarioevolution")
  ) {
    return false;
  }
  for (const n of extractModelNumbersFromNormStr(hay)) {
    if (sameModelHundredSeries(primary, n)) return true;
  }
  return false;
}

/**
 * Item PNG names in JS sometimes use URL escapes (%2B, %26, %252B). Static hosting maps
 * requests to real files named with literal + and & — mismatches cause 404 spam in the console.
 */
function normalizeItemImageFilename(name) {
  if (!name) return name;
  let s = String(name);
  s = s.replace(/%252B/gi, "+").replace(/%252b/gi, "+");
  s = s.replace(/%2B/gi, "+").replace(/%2b/gi, "+");
  s = s.replace(/%26/g, "&");
  return s;
}

/**
 * Build one searchable cache row for a shop PNG under items/ or items_mod_extract/.
 * Handles Giants pack__store_* exports and legacy _NN_FS25_Brand_Model wiki-style names.
 */
function buildShopImageCacheEntry(filenameRaw, folderPath, normalizeText) {
  const filename = normalizeItemImageFilename(filenameRaw);
  if (!filename || !/\.png$/i.test(filename)) return null;

  const base = filename.replace(/\.png$/i, "");
  const sep = base.indexOf("__");
  let brandPart = "";
  let modelPart = "";
  let beforeSep = "";
  let afterSep = base;
  let packNorm = "";
  let fullNorm = "";

  if (sep >= 0) {
    beforeSep = base.slice(0, sep);
    afterSep = base.slice(sep + 2);
    const parts = afterSep.split("_");
    brandPart = parts[0] || "";
    modelPart = parts
      .slice(1)
      .join(" ")
      .replace(/%2B/g, "+")
      .replace(/%25/g, "%");
    if (parts[0] && /^(store|icon)$/i.test(parts[0])) {
      modelPart = parts.slice(1).join("_");
      const fromPack = beforeSep
        .replace(/^vehicles?_?/i, "")
        .replace(/^store_?/i, "");
      brandPart = fromPack || brandPart;
    }
    modelPart = String(modelPart)
      .replace(/([a-z])(\d)/gi, "$1 $2")
      .replace(/(\d)([a-z])/gi, "$1 $2")
      .replace(/[_-]+/g, " ")
      .trim();
    packNorm = normalizeText(beforeSep.replace(/^FS\d+_?/i, ""));
    fullNorm = normalizeText(
      (beforeSep && afterSep ? `${beforeSep}_${afterSep}` : base).replace(
        /\.png$/i,
        ""
      )
    );
  } else {
    const parts = base.split("_");
    let brandStart = 2;
    if (parts[0] === "" && /^\d+$/.test(parts[1] || "")) brandStart = 2;
    else if (parts[0] === "" && /^\d+px/i.test(parts[1] || "")) brandStart = 2;
    const fsIdx = parts.findIndex((p) => /^FS25/i.test(p) || /^200px-FS25/i.test(p));
    if (fsIdx >= 0) brandStart = fsIdx + 1;
    brandPart = parts[brandStart] || "";
    modelPart = parts
      .slice(brandStart + 1)
      .join(" ")
      .replace(/%2B/g, "+")
      .replace(/%25/g, "%");
    fullNorm = normalizeText(
      base
        .replace(/^_\d+_/, "")
        .replace(/^200px-/i, "")
        .replace(/^FS25_/i, "")
    );
    packNorm = "";
  }

  return {
    filename,
    path: `${folderPath}${filename}`,
    brandNorm: normalizeText(brandPart),
    modelNorm: normalizeText(modelPart),
    fullNorm,
    packNorm,
    originalBrand: brandPart,
    originalModel: modelPart,
  };
}

/**
 * Prefer PNGs whose filename contains the vehicle (or brand+vehicle) compact string.
 * When this fails (common for mod hub names vs file tokens), findVehicleImageDynamic falls back to fuzzy-only scoring.
 */
function filenameMatchesVehicleStrict(filename, vehicleName, brandName) {
  let base = String(filename).replace(/^.*[/\\]/, "").replace(/\.png$/i, "");
  try {
    base = decodeURIComponent(base);
  } catch (e) {
    /* ignore */
  }
  const file = normalizeCompact(base);
  if (!file || !vehicleName) return false;

  const vn = normalizeCompactFold(vehicleName);
  for (const c of compactVariantsForStrictFileMatch(vn)) {
    if (c.length >= 4 && file.includes(c)) return true;
  }

  if (brandName && vehicleName) {
    const withSpace = normalizeCompactFold(`${brandName} ${vehicleName}`);
    if (withSpace.length >= 4 && file.includes(withSpace)) return true;
    const nospace = normalizeCompactFold(`${brandName}${vehicleName}`);
    if (nospace.length >= 4 && file.includes(nospace)) return true;
  }

  if (vn.length > 0 && vn.length < 4 && brandName) {
    const combined = normalizeCompactFold(`${brandName}${vehicleName}`);
    if (combined.length >= 4 && file.includes(combined)) return true;
  }

  return false;
}

/**
 * "Platform semitrailer" vs mod "Plateausattelanhänger" / Flatbed — same equipment, different wording.
 */
function modSchwarzmuellerPlatformTrailerMatch(vehicleNameNorm, brandNameNorm, img) {
  if (!img?.fullNorm) return false;
  if (!brandNameNorm.includes("schwarzmueller")) return false;
  const hay = `${img.fullNorm}${img.modelNorm || ""}${img.packNorm || ""}`;
  if (!hay.includes("schwarzmueller")) return false;
  const v = vehicleNameNorm;
  if (!v.includes("platform") || !v.includes("semi")) return false;
  return (
    hay.includes("plateau") ||
    hay.includes("flatbed") ||
    hay.includes("sattel") ||
    hay.includes("anhaenger") ||
    hay.includes("anhanger")
  );
}

/**
 * J&M often omitted from mod folder names; game "X-Tended Reach 1112" vs file "...GPS__X-Tended Reach 1112 + GPS".
 * Runs before curated so a real mod PNG wins over a missing/broken curated J&M path.
 */
function modJmXtendedReachMatch(vehicleNameNorm, brandNameNorm, img) {
  if (!brandNameNorm.includes("jm") || !img?.fullNorm) return false;
  if (!vehicleNameNorm.includes("xtended") || !vehicleNameNorm.includes("1112")) {
    return false;
  }
  const hay = `${img.fullNorm}${img.packNorm || ""}`;
  const fn = normalizeCompact(String(img.filename || "").replace(/\.png$/i, ""));
  // Folder must say X-Tended / XTended — "Patriotic" packs still embed the title in hay and would false-match
  if (!fn.includes("xtended")) {
    return false;
  }
  const hasCore =
    (hay.includes("xtendedreach1112") || hay.includes("xtendedreach")) &&
    hay.includes("1112");
  const fnOk =
    fn.includes("xtended") &&
    fn.includes("1112") &&
    (fn.includes("reach") || fn.includes("xtended"));
  return hasCore || fnOk;
}

/**
 * Export script names like ModFolder__Universal shovel with camera.png — brand "Lizard" is not in the path;
 * fullNorm still contains the full normalized display title. Prefer before curated.
 */
function modLizardExportDisplayNameMatch(vehicleNameNorm, brandNameNorm, img) {
  if (!brandNameNorm.includes("lizard") || !img?.fullNorm) return false;
  if (vehicleNameNorm.length < 10) return false;
  return img.fullNorm.includes(vehicleNameNorm);
}

/**
 * Game title often just "2500" for a weight — curated matches many wrong 2500 PNGs. Fendt weight pack:
 * FS25_FendtWeightsPack__store_weight2500
 */
function modFendtWeightsPackMatch(vehicleNameNorm, brandNameNorm, img) {
  if (!brandNameNorm.includes("fendt") || !img?.fullNorm) return false;
  const m = vehicleNameNorm.match(/(\d{3,4})/);
  if (!m) return false;
  const d = m[1];
  const hay = `${img.fullNorm}${img.packNorm || ""}${normalizeCompact(String(img.filename || "").replace(/\.png$/i, ""))}`;
  if (!hay.includes("fendt")) return false;
  if (!hay.includes(d)) return false;
  return (
    hay.includes("weight") ||
    hay.includes("gewicht") ||
    hay.includes("ballast")
  );
}

/**
 * Shop name "Multifarmer 70.2" vs texture id MF44.9CS-170-CVTRONIC — no shared substring without linking the line.
 */
function modMerloMultifarmerPackMatch(vehicleNameNorm, brandNameNorm, img) {
  if (!brandNameNorm.includes("merlo") || !img?.fullNorm) return false;
  if (!vehicleNameNorm.includes("multifarmer")) return false;
  const fn = normalizeCompact(String(img.filename || "").replace(/\.png$/i, ""));
  if (
    fn.includes("schaufel") ||
    fn.includes("hochkip") ||
    fn.includes("kippschauf")
  ) {
    return false;
  }
  const hay = `${img.fullNorm}${img.packNorm || ""}${fn}`;
  if (!hay.includes("merlo")) return false;
  return hay.includes("mf44") || hay.includes("cvtronic");
}

/**
 * Fuzzy score vehicle text against one image cache. Curated items/ is scored first in findVehicleImageDynamic; mod extract is fallback.
 */
function scoreVehicleImageCache(
  cache,
  vehicleNameNorm,
  brandNameNorm,
  typeNameNorm,
  vehicleName,
  minAcceptScore = 3
) {
  let bestMatch = null;
  let bestScore = 0;

  cache.forEach((img) => {
    let score = 0;

    let brandBonus = 0;
    if (brandNameNorm && img.brandNorm) {
      if (img.brandNorm === brandNameNorm) {
        brandBonus = 10;
      } else if (
        brandNameNorm.length >= 3 &&
        img.brandNorm.includes(brandNameNorm.substring(0, 3))
      ) {
        brandBonus = 4;
      } else if (
        (brandNameNorm === "john" && img.brandNorm.includes("johndeere")) ||
        (brandNameNorm === "mf" && img.brandNorm.includes("massey")) ||
        (brandNameNorm === "jd" && img.brandNorm.includes("johndeere")) ||
        (brandNameNorm === "massey" && img.brandNorm.includes("massey"))
      ) {
        brandBonus = 8;
      } else if (
        img.brandNorm.length >= 3 &&
        brandNameNorm.includes(img.brandNorm.substring(0, 3))
      ) {
        brandBonus = 4;
      }
    }
    if (
      brandNameNorm &&
      img.packNorm &&
      img.packNorm.length >= 4 &&
      img.packNorm.includes(brandNameNorm)
    ) {
      brandBonus = Math.max(brandBonus, 8);
    }

    if (vehicleNameNorm && img.modelNorm) {
      if (img.modelNorm === vehicleNameNorm) {
        score += 25;
      } else if (
        vehicleNameNorm.length >= 3 &&
        img.modelNorm.includes(vehicleNameNorm)
      ) {
        score += 15;
      } else if (
        img.modelNorm.length >= 3 &&
        vehicleNameNorm.includes(img.modelNorm)
      ) {
        score += 12;
      }

      const vehicleNumbers = vehicleNameNorm.match(/(\d+)/g) || [];
      const imageNumbers = img.modelNorm.match(/(\d+)/g) || [];

      if (vehicleNumbers.length > 0 && imageNumbers.length > 0) {
        let hasExactNumberMatch = false;
        vehicleNumbers.forEach((vNum) => {
          imageNumbers.forEach((iNum) => {
            if (vNum === iNum) {
              hasExactNumberMatch = true;
              if (vNum.length >= 4) {
                score += 12;
              } else if (vNum.length >= 3) {
                score += 8;
              } else {
                score += 4;
              }
            } else if (vNum.length >= 3 && iNum.length >= 3) {
              const vNumInt = parseInt(vNum, 10);
              const iNumInt = parseInt(iNum, 10);
              const diff = Math.abs(vNumInt - iNumInt);

              if (diff > 1000) {
                score -= 8;
              } else if (diff > 500) {
                score -= 4;
              } else if (diff > 100) {
                score -= 2;
              }
            }
          });
        });

        if (
          !hasExactNumberMatch &&
          vehicleNumbers.length > 0 &&
          vehicleNumbers[0].length >= 3
        ) {
          score -= 3;
        }
      }

      const vehicleAlphaNum =
        vehicleNameNorm.match(/(\d+[a-z]+|[a-z]+\d+)/g) || [];
      vehicleAlphaNum.forEach((pattern) => {
        if (img.modelNorm.includes(pattern)) {
          score += 8;
        }
      });

      const vehicleWords = vehicleNameNorm
        .split(/\s+/)
        .filter((w) => w.length >= 3);
      const modelWords = img.modelNorm
        .split(/\s+/)
        .filter((w) => w.length >= 3);

      let wordMatches = 0;
      vehicleWords.forEach((vWord) => {
        modelWords.forEach((mWord) => {
          if (
            vWord === mWord ||
            vWord.includes(mWord) ||
            mWord.includes(vWord)
          ) {
            wordMatches++;
          }
        });
      });

      if (wordMatches > 0) {
        score += wordMatches * 3;
      }
    }

    // Filenames (especially mod: PackName__Brand_Model) — fullNorm aligns when modelNorm split is imperfect
    if (img.fullNorm && vehicleNameNorm) {
      const compactCombo =
        brandNameNorm && vehicleNameNorm
          ? brandNameNorm + vehicleNameNorm
          : vehicleNameNorm;
      if (compactCombo.length >= 5) {
        if (img.fullNorm === compactCombo) {
          score += 18;
        } else if (
          img.fullNorm.includes(compactCombo) ||
          compactCombo.includes(img.fullNorm)
        ) {
          score += 14;
        } else if (brandNameNorm && brandNameNorm.length >= 3 && img.fullNorm.includes(brandNameNorm)) {
          let vHit = false;
          for (const v of compactVariantsForStrictFileMatch(vehicleNameNorm)) {
            if (v.length >= 4 && img.fullNorm.includes(v)) {
              vHit = true;
              break;
            }
          }
          if (vHit) {
            score += 12;
          }
        }
      }
    }

    if (typeNameNorm) {
      if (
        typeNameNorm.includes("trailer") &&
        img.modelNorm.includes("trailer")
      ) {
        score += 15;
      } else if (
        typeNameNorm.includes("header") &&
        img.modelNorm.includes("header")
      ) {
        score += 15;
      } else if (
        typeNameNorm.includes("header") &&
        !img.modelNorm.includes("header") &&
        !img.modelNorm.includes("trailer")
      ) {
        score -= 5;
      } else if (
        typeNameNorm.includes("trailer") &&
        !img.modelNorm.includes("trailer") &&
        !img.modelNorm.includes("header")
      ) {
        score -= 5;
      }
    }

    score += brandBonus;

    if (score > bestScore && score >= minAcceptScore) {
      bestScore = score;
      bestMatch = img;
    }
  });

  return { bestMatch, bestScore };
}

function buildVehicleYearsPanelHtml(vehicle) {
  if (!vehicleHasYears(vehicle)) return "";

  const modelYear = getVehicleModelYear(vehicle);
  const decadeLabel = getVehicleDecadeLabel(vehicle);
  const reliability = getVehicleReliability(vehicle);
  const maintainability = getVehicleMaintainability(vehicle);

  const yearLine =
    modelYear != null
      ? `<div class="d-flex justify-content-between mb-1">
          <small class="text-muted">${_safe(t("vehicles.vyModelYear"))}</small>
          <strong>${modelYear}${decadeLabel ? ` <span class="text-muted fw-normal">(${_safe(decadeLabel)})</span>` : ""}</strong>
        </div>`
      : `<div class="mb-1"><small class="text-muted">${_safe(t("vehicles.yearUnknown"))}</small></div>`;

  const relLine =
    reliability != null || maintainability != null
      ? `<div class="d-flex justify-content-between gap-2 mt-1">
          ${reliability != null ? `<small class="text-muted">${_safe(t("vehicles.vyReliability", { pct: formatReliabilityPercent(reliability) }))}</small>` : ""}
          ${maintainability != null ? `<small class="text-muted">${_safe(t("vehicles.vyMaintainability", { pct: formatReliabilityPercent(maintainability) }))}</small>` : ""}
        </div>`
      : "";

  return `
    <div class="mb-3 border border-secondary rounded p-2 vy-vehicle-panel">
      <small class="text-farm-accent fw-semibold d-block mb-2">
        <i class="bi bi-calendar3 me-1"></i>${t("vehicles.vyPanelTitle")}
      </small>
      ${yearLine}
      ${relLine}
    </div>`;
}

export function showVehiclesSection() {
  const sectionShell = document.getElementById("section-content");
  const dyn = document.getElementById("section-content-dynamic");
  if (dyn?.querySelector("#vehicles-grid")) {
    if (sectionShell) {
      sectionShell.classList.add("farm-glass-page--vehicles");
      sectionShell.classList.remove("d-none");
    }
    this.bindVehiclesScrollPerf();
    this.loadVehicles();
    return;
  }

  const vehiclesHTML = `
            <div class="row mb-4">
                <div class="col-12 text-center">
                    <h2 class="text-farm-accent">
                        <i class="bi bi-truck me-2"></i>
                        ${t("vehicles.title")}
                    </h2>
                    <p class="lead text-muted">${t("vehicles.subtitle")}</p>
                </div>
            </div>

            <div class="row mb-4 d-none" id="ads-fleet-summary-row">
                <div class="col-md-4">
                    <div class="card border-0 vehicle-summary-card text-white"
                         style="background: linear-gradient(135deg, #6f42c1, #5a32a3);">
                        <div class="card-body text-center">
                            <h5 class="card-title"><i class="bi bi-tools me-2"></i>${t("vehicles.adsInService")}</h5>
                            <h2 class="display-4" id="ads-in-service-count">0</h2>
                            <small class="text-light opacity-90">${t("vehicles.adsInServiceHint")}</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card border-0 vehicle-summary-card text-white"
                         style="cursor: pointer; transition: all 0.3s ease; background: linear-gradient(135deg, #fd7e14, #e8590c);"
                         onclick="dashboard.filterVehiclesBySummaryCard('needs-repair')"
                         onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 15px rgba(0,0,0,0.2)'"
                         onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                        <div class="card-body text-center">
                            <h5 class="card-title"><i class="bi bi-wrench-adjustable me-2"></i>${t("vehicles.adsNeedsRepair")}</h5>
                            <h2 class="display-4" id="ads-needs-repair-count">0</h2>
                            <small class="text-light opacity-90">${t("vehicles.adsNeedsRepairHint")}</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card border-0 vehicle-summary-card text-white"
                         style="background: linear-gradient(135deg, #20c997, #0ca678);">
                        <div class="card-body text-center">
                            <h5 class="card-title"><i class="bi bi-calendar-x me-2"></i>${t("vehicles.adsOverdue")}</h5>
                            <h2 class="display-4" id="ads-overdue-count">0</h2>
                            <small class="text-light opacity-90">${t("vehicles.adsOverdueHint")}</small>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row mb-4">
                <div class="col-md-4">
                    <div class="card bg-farm-primary text-white border-0 vehicle-summary-card"
                         style="cursor: pointer; transition: all 0.3s ease;"
                         onclick="dashboard.filterVehiclesBySummaryCard('all')"
                         onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 15px rgba(0,0,0,0.2)'"
                         onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                        <div class="card-body text-center">
                            <h5 class="card-title">
                                <i class="bi bi-truck me-2"></i>${t("vehicles.summaryTotal")}
                            </h5>
                            <h2 class="display-4" id="total-vehicles-count">0</h2>
                            <small class="text-light opacity-75">${t("vehicles.summaryTotalHint")}</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card bg-farm-warning text-dark border-0 vehicle-summary-card"
                         style="cursor: pointer; transition: all 0.3s ease;"
                         onclick="dashboard.filterVehiclesBySummaryCard('low-fuel')"
                         onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 15px rgba(0,0,0,0.2)'"
                         onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                        <div class="card-body text-center">
                            <h5 class="card-title">
                                <i class="bi bi-fuel-pump me-2"></i>${t("vehicles.summaryLowFuel")}
                            </h5>
                            <h2 class="display-4" id="low-fuel-count">0</h2>
                            <small class="text-dark opacity-75">${t("vehicles.summaryLowFuelHint")}</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card border-0 vehicle-summary-card"
                         style="cursor: pointer; transition: all 0.3s ease; background: linear-gradient(135deg, #dc3545, #c82333);"
                         onclick="dashboard.filterVehiclesBySummaryCard('damaged')"
                         onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 20px rgba(220,53,69,0.4)'"
                         onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 10px rgba(220,53,69,0.2)'">
                        <div class="card-body text-center text-white">
                            <h5 class="card-title">
                                <i class="bi bi-exclamation-triangle-fill me-2"></i>${t("vehicles.summaryHighDamage")}
                            </h5>
                            <h2 class="display-4" id="damaged-vehicles-count">0</h2>
                            <small class="text-light opacity-90">
                                <i class="bi bi-shield-exclamation me-1"></i>${t("vehicles.summaryHighDamageHint")}
                            </small>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row mb-4">
                <div class="col-12">
                    <div class="card shadow-lg border-farm-accent">
                        <div class="card-header text-white">
                            <h6 class="card-title mb-0">
                                <i class="bi bi-funnel me-2"></i>
                                ${t("vehicles.filtersTitle")}
                                <button class="btn btn-sm btn-outline-light ms-2" onclick="dashboard.toggleVehicleFilters()" id="vehicle-filter-toggle-btn">
                                    <i class="bi bi-chevron-down"></i> ${t("vehicles.showFilters")}
                                </button>
                            </h6>
                        </div>
                        <div class="card-body d-none" id="vehicle-filters-panel">
                            <div class="row g-3">
                                <div class="col-md-3">
                                    <label class="form-label text-farm-accent">${t("vehicles.labelVehicleType")}</label>
                                    <select class="form-select form-select-sm" id="vehicle-type-filter">
                                        <option value="">${t("vehicles.optAllTypes")}</option>
                                        <option value="tractor">${t("vehicles.optTractors")}</option>
                                        <option value="motorized">${t("vehicles.optMotorized")}</option>
                                        <option value="trailer">${t("vehicles.optTrailers")}</option>
                                        <option value="implement">${t("vehicles.optImplements")}</option>
                                        <option value="cultivator">${t("vehicles.optCultivators")}</option>
                                        <option value="unknown">${t("vehicles.optPalletsOthers")}</option>
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label text-farm-accent">${t("vehicles.labelFuelLevel")}</label>
                                    <select class="form-select form-select-sm" id="vehicle-fuel-filter">
                                        <option value="">${t("vehicles.optFuelAll")}</option>
                                        <option value="empty">${t("vehicles.optFuelEmpty")}</option>
                                        <option value="low">${t("vehicles.optFuelLow")}</option>
                                        <option value="medium">${t("vehicles.optFuelMedium")}</option>
                                        <option value="full">${t("vehicles.optFuelFull")}</option>
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label text-farm-accent">${t("vehicles.labelStatus")}</label>
                                    <select class="form-select form-select-sm" id="vehicle-status-filter">
                                        <option value="">${t("vehicles.optStatusAll")}</option>
                                        <option value="active">${t("vehicles.optStatusEngineOn")}</option>
                                        <option value="inactive">${t("vehicles.optStatusEngineOff")}</option>
                                        <option value="damaged">${t("vehicles.optStatusDamaged")}</option>
                                        <option value="needs-repair">${t("vehicles.optStatusNeedsRepair")}</option>
                                    </select>
                                </div>
                                <div class="col-md-3 d-flex align-items-end">
                                    <button class="btn btn-farm-accent w-100" onclick="dashboard.applyVehicleFilters()">
                                        <i class="bi bi-search me-1"></i> ${t("vehicles.applyFilters")}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row" id="vehicles-grid">
                </div>
        `;

  document.getElementById("section-content-dynamic").innerHTML = vehiclesHTML;
  if (sectionShell) {
    sectionShell.classList.add("farm-glass-page--vehicles");
    sectionShell.classList.remove("d-none");
  }

  this.bindVehiclesScrollPerf();

  // Load and display vehicles
  this.loadVehicles();
}

/** Pause heavy vehicle re-renders while the main pane is scrolling (Electron backdrop-filter jank). */
export function bindVehiclesScrollPerf() {
  if (this._vehiclesScrollBound) return;
  this._vehiclesScrollBound = true;
  this._vehiclesUiScrollPaused = false;
  this._vehiclesUiRefreshPending = false;

  const scrollRoot = window;
  let scrollEndTimer = null;

  scrollRoot.addEventListener(
    "scroll",
    () => {
      if (this.currentSection !== "vehicles") return;
      this._vehiclesUiScrollPaused = true;
      document
        .getElementById("section-content")
        ?.classList.add("farm-glass-page--scrolling");
      clearTimeout(scrollEndTimer);
      scrollEndTimer = setTimeout(() => {
        this._vehiclesUiScrollPaused = false;
        document
          .getElementById("section-content")
          ?.classList.remove("farm-glass-page--scrolling");
        if (this._vehiclesUiRefreshPending) {
          this._vehiclesUiRefreshPending = false;
          this.flushVehiclesUiRefresh();
        }
      }, 180);
    },
    { passive: true, capture: true }
  );
}

/** Debounced refresh for realtime ticks — avoids full card rebuild during active scroll. */
export function scheduleVehiclesUiRefresh(options = {}) {
  if (options.immediate) {
    clearTimeout(this._vehiclesUiRefreshTimer);
    this._vehiclesUiRefreshPending = false;
    return this.flushVehiclesUiRefresh();
  }
  clearTimeout(this._vehiclesUiRefreshTimer);
  this._vehiclesUiRefreshTimer = setTimeout(() => {
    this._vehiclesUiRefreshTimer = null;
    if (this._vehiclesUiScrollPaused) {
      this._vehiclesUiRefreshPending = true;
      return;
    }
    this.flushVehiclesUiRefresh();
  }, 450);
}

export function flushVehiclesUiRefresh() {
  if (this._vehiclesUiRefreshRaf) {
    cancelAnimationFrame(this._vehiclesUiRefreshRaf);
  }
  this._vehiclesUiRefreshRaf = requestAnimationFrame(() => {
    this._vehiclesUiRefreshRaf = 0;
    this.updateVehicleSummaryCards();
    if (typeof this.applyVehicleFilters === "function") {
      this.applyVehicleFilters();
    } else {
      this.renderVehicleCards(this.vehicles || []);
    }
  });
}

// Generate vehicle display using local images
export function generateVehicleDisplay(vehicleName, brandName, typeName, hints) {
  const cacheKey = buildVehicleImageCacheKey(
    vehicleName,
    brandName,
    typeName
  );
  const cachedDisplay = vehicleDisplayCache.get(cacheKey);
  if (cachedDisplay) return cachedDisplay;

  // Try to find a local image first
  const localImage = this.getLocalVehicleImage(
    vehicleName,
    brandName,
    typeName,
    hints
  );

  if (localImage) {
    const out = {
      imageUrl: localImage,
      isImage: true,
      displayText: vehicleName,
    };
    if (localImage.includes("_514_FS25_SILOKING")) {
      out.wikiFallbackUrl = SILOKING_TRAILEDLINE_WIKI_THUMB;
    }
    vehicleDisplayCache.set(cacheKey, out);
    return out;
  }

  // Fallback to CSS-based display if no local image found
  const vehicleTypeColors = {
    tractor: { bg: "#2E7D32", text: "#FFFFFF" },
    teleHandler: { bg: "#F57F17", text: "#FFFFFF" },
    trailer: { bg: "#5D4037", text: "#FFFFFF" },
    motorized: { bg: "#1976D2", text: "#FFFFFF" },
    harvester: { bg: "#F44336", text: "#FFFFFF" },
    implement: { bg: "#7B1FA2", text: "#FFFFFF" },
    cultivator: { bg: "#689F38", text: "#FFFFFF" },
    pallet: { bg: "#FF8F00", text: "#000000" },
    car: { bg: "#424242", text: "#FFFFFF" },
    forestryExcavator: { bg: "#795548", text: "#FFFFFF" },
    waterTrailer: { bg: "#2196F3", text: "#FFFFFF" },
    manureTrailer: { bg: "#8D6E63", text: "#FFFFFF" },
    livestockTrailer: { bg: "#E65100", text: "#FFFFFF" },
    augerWagon: { bg: "#9C27B0", text: "#FFFFFF" },
    mixerWagon: { bg: "#673AB7", text: "#FFFFFF" },
    default: { bg: "#607D8B", text: "#FFFFFF" },
  };

  const brandColors = {
    "John Deere": { bg: "#2E7D32", text: "#FFFF00" },
    JOHNDEERE: { bg: "#2E7D32", text: "#FFFF00" },
    Volvo: { bg: "#1565C0", text: "#FFFFFF" },
    JCB: { bg: "#FFB300", text: "#000000" },
    Manitou: { bg: "#D32F2F", text: "#FFFFFF" },
    International: { bg: "#B71C1C", text: "#FFFFFF" },
    INTERNATIONAL: { bg: "#B71C1C", text: "#FFFFFF" },
    Kotte: { bg: "#4CAF50", text: "#FFFFFF" },
    KOTTE: { bg: "#4CAF50", text: "#FFFFFF" },
    "Wilson Trailer": { bg: "#1976D2", text: "#FFFFFF" },
    WILSON: { bg: "#1976D2", text: "#FFFFFF" },
  };

  let colors =
    brandColors[brandName] ||
    vehicleTypeColors[typeName] ||
    vehicleTypeColors.default;

  let displayText = vehicleName;
  if (displayText.length > 15) {
    if (brandName && brandName !== "None" && brandName !== "NONE") {
      displayText = brandName;
    } else {
      displayText = displayText.substring(0, 12) + "...";
    }
  }

  const fallbackDisplay = {
    background: colors.bg,
    textColor: colors.text,
    displayText: displayText,
    isImage: false,
  };
  vehicleDisplayCache.set(cacheKey, fallbackDisplay);
  return fallbackDisplay;
}

// Match vehicles to local images
export function getLocalVehicleImage(vehicleName, brandName, typeName, hints) {
  // Skip image matching for bigBags, pallets, and other storage items
  const skipImageTypes = ["bigbag", "pallet"];
  if (skipImageTypes.includes(typeName?.toLowerCase())) {
    console.log(
      `[LocalImage] Skipping image for storage item type: ${typeName}`
    );
    return null;
  }

  const cacheKey = buildVehicleImageCacheKey(
    vehicleName,
    brandName,
    typeName
  );
  if (vehicleImageMatchCache.has(cacheKey)) {
    return vehicleImageMatchCache.get(cacheKey);
  }

  const tryDynamic = (name) => {
    if (!name || name === "Unknown" || name === "—") return null;
    return this.findVehicleImageDynamic(name, brandName, typeName);
  };

  // First try to find image through dynamic matching
  let dynamicMatch = tryDynamic(vehicleName);
  if (!dynamicMatch && hints?.storeName) {
    const storeLabel = String(hints.storeName).trim();
    if (storeLabel && storeLabel !== String(vehicleName || "").trim()) {
      dynamicMatch = tryDynamic(storeLabel);
    }
  }
  if (dynamicMatch) {
    vehicleImageMatchCache.set(cacheKey, dynamicMatch);
    return dynamicMatch;
  }

  // Create search terms from vehicle name, brand, and type
  const searchTerms = [
    vehicleName,
    brandName,
    typeName,
    `${brandName} ${vehicleName}`.replace(/\s+/g, " ").trim(),
  ].filter(
    (term) => term && term !== "Unknown" && term !== "None" && term !== "NONE"
  );

  // Common vehicle model mappings based on the filenames we saw
  const vehicleModelMap = {
    // John Deere tractors
    "8R 410": "_44_FS25_John_Deere_8R_Series.png",
    "8r": "_44_FS25_John_Deere_8R_Series.png",
    "john deere 8r": "_44_FS25_John_Deere_8R_Series.png",
    "john deere tractor": "_28_FS25_John_Deere_6R_Series.png",
    "john deere": "_28_FS25_John_Deere_6R_Series.png",

    // New Holland T7 family (shared store icon across HP variants)
    "T7.260": "vehicles__store_t7.png",
    "T7 260": "vehicles__store_t7.png",
    t7260: "vehicles__store_t7.png",
    "new holland t7.260": "vehicles__store_t7.png",
    "new holland t7": "vehicles__store_t7.png",
    t7: "vehicles__store_t7.png",
    "t7 series": "vehicles__store_t7.png",

    // Case IH Puma family (single shop icon, many HP/name variants)
    "case ih puma 260cvxdrive": "vehicles__store_puma.png",
    "case ih puma 260 cvxdrive": "vehicles__store_puma.png",
    "case ih puma 260": "vehicles__store_puma.png",
    "case ih puma": "vehicles__store_puma.png",
    "puma 260cvxdrive": "vehicles__store_puma.png",
    "puma 260": "vehicles__store_puma.png",
    puma260cvxdrive: "vehicles__store_puma.png",
    puma260: "vehicles__store_puma.png",
    puma: "vehicles__store_puma.png",

    // DEUTZ-FAHR 8-series family (same icon across 8 TTV variants)
    "8280 ttv": "_38_FS25_DEUTZ-FAHR_Series_8_TTV.png",
    "deutz-fahr 8280 ttv": "_38_FS25_DEUTZ-FAHR_Series_8_TTV.png",
    "deutz fahr 8280 ttv": "_38_FS25_DEUTZ-FAHR_Series_8_TTV.png",
    "deutz-fahr series 8 ttv": "_38_FS25_DEUTZ-FAHR_Series_8_TTV.png",
    "deutz fahr series 8 ttv": "_38_FS25_DEUTZ-FAHR_Series_8_TTV.png",
    deutzfahr8280ttv: "_38_FS25_DEUTZ-FAHR_Series_8_TTV.png",
    deutzfahr8ttv: "_38_FS25_DEUTZ-FAHR_Series_8_TTV.png",
    "series 8 ttv": "_38_FS25_DEUTZ-FAHR_Series_8_TTV.png",
    "8 ttv": "_38_FS25_DEUTZ-FAHR_Series_8_TTV.png",

    // Bailey Bale & Pallet trailer family (same icon across size variants)
    "bailey bale and pallet trailer":
      "FS25_Bailey_Bale__store_BALE16.png",
    "bailey bale":
      "FS25_Bailey_Bale__store_BALE16.png",
    bailey: "FS25_Bailey_Bale__store_BALE16.png",
    "bale and pallet": "FS25_Bailey_Bale__store_BALE16.png",
    "bale and pallet trailer":
      "FS25_Bailey_Bale__store_BALE16.png",
    bale16: "FS25_Bailey_Bale__store_BALE16.png",
    bale18: "FS25_Bailey_Bale__store_BALE16.png",
    "bailey bale16": "FS25_Bailey_Bale__store_BALE16.png",
    "bailey bale18": "FS25_Bailey_Bale__store_BALE16.png",

    // Zetor Crystal HD family
    "zetor crystal hd 170": "_26_FS25_Zetor_CRYSTAL_HD.png",
    "zetor crystal hd": "_26_FS25_Zetor_CRYSTAL_HD.png",
    "crystal hd 170": "_26_FS25_Zetor_CRYSTAL_HD.png",
    "crystal hd": "_26_FS25_Zetor_CRYSTAL_HD.png",
    zetorcrystalhd170: "_26_FS25_Zetor_CRYSTAL_HD.png",
    zetorcrystalhd: "_26_FS25_Zetor_CRYSTAL_HD.png",

    // ROPA Tiger 6 family (shared icon across XL/S variants)
    "tiger 6 xl": "vehicles__store_tiger6S.png",
    "ropa tiger 6 xl": "vehicles__store_tiger6S.png",
    "ropa tiger 6": "vehicles__store_tiger6S.png",
    tiger6xl: "vehicles__store_tiger6S.png",
    tiger6: "vehicles__store_tiger6S.png",
    tiger6s: "vehicles__store_tiger6S.png",

    // JCB
    "541-70 AGRI PRO": "_115_FS25_JCB_541-70_AGRI_PRO.png",
    "541-70": "_115_FS25_JCB_541-70_AGRI_PRO.png",
    jcb: "_115_FS25_JCB_541-70_AGRI_PRO.png",

    // Manitou
    "M50-4": "_162_FS25_Manitou_M50-4.png",
    m50: "_162_FS25_Manitou_M50-4.png",
    manitou: "_162_FS25_Manitou_M50-4.png",

    // Volvo
    EC380DL: "_535_FS25_Volvo_EC380DL.png",
    ec380: "_535_FS25_Volvo_EC380DL.png",
    volvo: "_535_FS25_Volvo_EC380DL.png",

    // International
    "Transtar II": "_64_FS25_INTERNATIONAL_Transtar_II_Eagle.png",
    transtar: "_64_FS25_INTERNATIONAL_Transtar_II_Eagle.png",
    "Series 200": "_78_FS25_INTERNATIONAL_Series_200.png",
    international: "_64_FS25_INTERNATIONAL_Transtar_II_Eagle.png",

    // Kotte
    "TSA 30000": "_316_FS25_Kotte_TSA_30000.png",
    tsa: "_316_FS25_Kotte_TSA_30000.png",
    "FRC 65": "_317_FS25_Kotte_FRC_65.png",
    frc: "_317_FS25_Kotte_FRC_65.png",
    kotte: "_316_FS25_Kotte_TSA_30000.png",

    // SILOKING (literal + in filename — %2B in URLs breaks static file lookup)
    "TrailedLine 4.0 System 1000+":
      "_514_FS25_SILOKING_TrailedLine_4.0_System_1000+.png",
    "trailedline 4.0 system 1000+":
      "_514_FS25_SILOKING_TrailedLine_4.0_System_1000+.png",
    trailedline: "_514_FS25_SILOKING_TrailedLine_4.0_System_1000+.png",
    "siloking trailedline":
      "_514_FS25_SILOKING_TrailedLine_4.0_System_1000+.png",
    siloking: "_514_FS25_SILOKING_TrailedLine_4.0_System_1000+.png",

    // Wilson
    Silverstar: "_523_FS25_Wilson_Trailer_Silverstar.png",
    wilson: "_523_FS25_Wilson_Trailer_Silverstar.png",

    // LODE KING
    "Renown Drop Deck": "_201_FS25_LODE_KING_Renown_Drop_Deck.png",
    lodeking: "_201_FS25_LODE_KING_Renown_Drop_Deck.png",
    "lode king": "_201_FS25_LODE_KING_Renown_Drop_Deck.png",

    // Hawe
    "SUW 5000": "_186_FS25_Hawe_SUW_5000.png",
    hawe: "_186_FS25_Hawe_SUW_5000.png",

    // Lizard
    "MKS 32": "_520_FS25_Lizard_MKS_32.png",
    lizard: "_520_FS25_Lizard_MKS_32.png",

    // Kärcher
    "HDS 9/18-4 M": "_613_FS25_Kärcher_HDS_9-18-4M.png",
    kärcher: "_613_FS25_Kärcher_HDS_9-18-4M.png",
    kaercher: "_613_FS25_Kärcher_HDS_9-18-4M.png",

    // Kubota
    "RTV-XG850 SIDEKICK": "_75_FS25_Kubota_RTV-XG850_SIDEKICK.png",
    kubota: "_75_FS25_Kubota_RTV-XG850_SIDEKICK.png",
    sidekick: "_75_FS25_Kubota_RTV-XG850_SIDEKICK.png",

    // STEMA
    TRIUS: "_598_FS25_STEMA_TRIUS.png",
    stema: "_598_FS25_STEMA_TRIUS.png",

    // TMC Cancela
    "THX-180": "_537_FS25_TMC_Cancela_THX-180.png",
    tmccancela: "_537_FS25_TMC_Cancela_THX-180.png",

    // Abi
    1600: "_518_FS25_Abi_1600.png",
    abi: "_518_FS25_Abi_1600.png",

    // Heizomat
    "HM 10-500 KF": "_543_FS25_Heizomat_HM_10-500_KF.png",
    heizomat: "_543_FS25_Heizomat_HM_10-500_KF.png",

    // Albutt
    "Bale Fork F155A (Telehandler)":
      "_102_200px-FS25_Albutt_F155A_Bale_Fork.png",
    F155A: "_102_200px-FS25_Albutt_F155A_Bale_Fork.png",
    albutt: "_102_200px-FS25_Albutt_F155A_Bale_Fork.png",

    // MAGSI
    "Bale Fork": "_122_FS25_MAGSI_Bale_Fork.png",
    "Manure Fork": "_733_FS25_MAGSI_Manure_Fork.png",
    magsi: "_122_FS25_MAGSI_Bale_Fork.png",

    // PÖTTINGER
    "TERRIA 6040": "_221_FS25_PÖTTINGER_TERRIA_6040.png",
    "terria 6040": "_221_FS25_PÖTTINGER_TERRIA_6040.png",
    terria: "_221_FS25_PÖTTINGER_TERRIA_6040.png",
    "pöttinger terria": "_221_FS25_PÖTTINGER_TERRIA_6040.png",
    pöttinger: "_221_FS25_PÖTTINGER_TERRIA_6040.png",
    poettinger: "_221_FS25_PÖTTINGER_TERRIA_6040.png",

    // Krampe
    "SKS 30/1050": "_205_FS25_Krampe_SKS_30-1050.png",
    "sks 30/1050": "_205_FS25_Krampe_SKS_30-1050.png",
    "sks 30-1050": "_205_FS25_Krampe_SKS_30-1050.png",
    sks: "_205_FS25_Krampe_SKS_30-1050.png",
    "krampe sks": "_205_FS25_Krampe_SKS_30-1050.png",
    krampe: "_205_FS25_Krampe_SKS_30-1050.png",

    // Tenwinkel
    "FGB 600": "_557_FS25_Tenwinkel_FGB_600.png",
    "fbg 600": "_557_FS25_Tenwinkel_FGB_600.png",
    fbg: "_557_FS25_Tenwinkel_FGB_600.png",
    "tenwinkel fbg": "_557_FS25_Tenwinkel_FGB_600.png",
    tenwinkel: "_557_FS25_Tenwinkel_FGB_600.png",
  };

  // Exact map keys only — substring/partial matching caused many wrong thumbnails
  for (const term of searchTerms) {
    const termLower = term.toLowerCase().trim();
    if (vehicleModelMap[termLower]) {
      const filename = vehicleModelMap[termLower];
      const normalized = normalizeItemImageFilename(filename);
      const inModExtract =
        Array.isArray(modExtractImageFilenames) &&
        modExtractImageFilenames.some((f) => String(f).toLowerCase() === String(normalized).toLowerCase());
      const dir = inModExtract ? "items_mod_extract" : "items";
      const resolved = `/assests/img/${dir}/${normalized}`;
      vehicleImageMatchCache.set(cacheKey, resolved);
      return resolved;
    }
  }

  vehicleImageMatchCache.set(cacheKey, null);
  return null;
}

function buildCuratedFuzzyImagePool(
  curatedAll,
  vehicleNameNorm,
  brandNameNorm,
  directCompactMatch
) {
  const fromDirect = curatedAll.filter(directCompactMatch);
  if (fromDirect.length > 0) return fromDirect;
  if (!vehicleNameNorm && !brandNameNorm) return [];

  const prefix = vehicleNameNorm.slice(0, 4);
  const pool = curatedAll.filter((img) => {
    if (brandNameNorm && img.brandNorm && img.brandNorm.includes(brandNameNorm)) {
      return true;
    }
    if (prefix.length >= 3 && img.modelNorm && img.modelNorm.includes(prefix)) {
      return true;
    }
    return false;
  });
  return pool.length > 300 ? pool.slice(0, 300) : pool;
}

// Dynamic image matching using fuzzy search
export function findVehicleImageDynamic(vehicleName, brandName, typeName) {
  // Enhanced normalization function
  const normalizeText = (text) => {
    if (!text) return "";
    return text
      .toString()
      .toLowerCase()
      .replace(/ß/g, "ss")
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/[\u002D\u2010-\u2015\u2212\uFF0D]/g, "")
      .replace(/[^a-z0-9]/g, "") // Remove special chars
      .replace(/series/g, "")
      .replace(/model/g, "")
      .replace(/fs25/g, "")
      .replace(/imgi/g, "");
  };

  const vehicleNameNorm = normalizeText(vehicleName);
  const brandNameNorm = normalizeText(brandName);
  const typeNameNorm = normalizeText(typeName);

  // Debug logging (only for specific cases)
  if (
    vehicleNameNorm.includes("8570") ||
    vehicleNameNorm.includes("trailer")
  ) {
    console.log(
      `[LocalImage] Searching for vehicle: "${vehicleName}" | brand: "${brandName}" | type: "${typeName}"`
    );
    console.log(
      `[LocalImage] Normalized: vehicle="${vehicleNameNorm}" | brand="${brandNameNorm}" | type="${typeNameNorm}"`
    );
  }

  // Cache for image files (populate once): full items/ + items_mod_extract/ lists from API
  if (!this.vehicleImageCacheCuratedBuilt) {
    this.vehicleImageCacheCurated = [];
    for (const filenameRaw of itemsImageFilenames) {
      const entry = buildShopImageCacheEntry(
        filenameRaw,
        "/assests/img/items/",
        normalizeText
      );
      if (entry) this.vehicleImageCacheCurated.push(entry);
    }
    this.vehicleImageCacheCuratedBuilt = true;
  }

  if (!this.vehicleImageCacheModBuilt) {
    this.vehicleImageCacheMod = [];
    for (const filenameRaw of modExtractImageFilenames) {
      const entry = buildShopImageCacheEntry(
        filenameRaw,
        "/assests/img/items_mod_extract/",
        normalizeText
      );
      if (entry) this.vehicleImageCacheMod.push(entry);
    }
    this.vehicleImageCacheModBuilt = true;
  }

  const curatedAll = this.vehicleImageCacheCurated || [];
  const modAll = this.vehicleImageCacheMod || [];

  /** Filename already contains compact vehicle/brand text — allow moderate scores. */
  const MIN_SCORE_STRICT_FILTER = 10;
  /** Curated items/ is huge — keep fuzzy bar high to limit wrong PNGs. */
  const MIN_SCORE_FUZZY_CURATED = 22;
  /** Mod items_mod_extract/ — fewer collisions per pack; slightly lower bar + fullNorm bonus in scoring. */
  const MIN_SCORE_FUZZY_MOD = 16;

  // Direct compact-name pass for pack/store exports (e.g. vehicles__store_fenix3000)
  const compactNeedle = normalizeCompactFold(vehicleName || "");
  const compactBrandNeedle = normalizeCompactFold(`${brandName || ""}${vehicleName || ""}`);
  const directNeedles = new Set([compactNeedle, compactBrandNeedle].filter(Boolean));
  if (brandNameNorm && compactNeedle.startsWith(brandNameNorm) && compactNeedle.length > brandNameNorm.length + 4) {
    directNeedles.add(compactNeedle.slice(brandNameNorm.length));
  }
  const slashTrim = normalizeCompactFold(String(vehicleName || "").replace(/\/\d+$/i, ""));
  if (slashTrim) directNeedles.add(slashTrim);
  // Shared-series icons: in-game titles include horsepower variant (e.g. "T7.260"),
  // while store files may keep only the family token ("store_t7").
  const seriesFromName = String(vehicleName || "")
    .toLowerCase()
    .match(/\b([a-z]+)\s?(\d{1,2})(?:[.,]\d{2,4})\b/);
  if (seriesFromName) {
    directNeedles.add(normalizeCompactFold(`${seriesFromName[1]}${seriesFromName[2]}`));
  }
  const familyText = String(`${brandName || ""} ${vehicleName || ""}`).toLowerCase();
  if (familyText.includes("case") && familyText.includes("puma")) {
    directNeedles.add("puma");
    directNeedles.add("storepuma");
  }
  if (familyText.includes("deutz") && familyText.includes("ttv")) {
    directNeedles.add("series8ttv");
    directNeedles.add("8280ttv");
    directNeedles.add("8ttv");
  }
  for (const n of [...directNeedles]) {
    if (/^[a-z]+\d{4,6}$/.test(n)) {
      directNeedles.add(n.replace(/(\d)\d$/, "$1"));
    }
    if (/^\d{4,6}$/.test(n)) {
      directNeedles.add(n.slice(0, -1));
    }
    const seriesPrefix = n.match(/^([a-z]+\d{1,2})\d{2,4}$/);
    if (seriesPrefix) {
      directNeedles.add(seriesPrefix[1]);
    }
  }
  const directCompactMatch = (img) => {
    const f = normalizeCompactFold(String(img?.filename || "").replace(/\.png$/i, ""));
    if (!f) return false;
    for (const needle of directNeedles) {
      if (needle && needle.length >= 5 && f.includes(needle)) return true;
    }
    return false;
  };
  const exactStoreTokenMatch = (img) => {
    const raw = String(img?.filename || "").toLowerCase();
    for (const needle of directNeedles) {
      if (!needle || needle.length < 2) continue;
      const re = new RegExp(`(?:^|__)store_${needle}(?:_|\\.|$)`, "i");
      if (re.test(raw)) return true;
    }
    return false;
  };
  const curatedStoreExact = curatedAll.filter(exactStoreTokenMatch);
  if (curatedStoreExact.length === 1) return curatedStoreExact[0].path;
  if (curatedStoreExact.length > 1) {
    const bestStoreCur = scoreVehicleImageCache(
      curatedStoreExact,
      vehicleNameNorm,
      brandNameNorm,
      typeNameNorm,
      vehicleName,
      6
    );
    if (bestStoreCur.bestMatch && bestStoreCur.bestScore >= 6) return bestStoreCur.bestMatch.path;
  }
  const modStoreExact = modAll.filter(exactStoreTokenMatch);
  if (modStoreExact.length === 1) return modStoreExact[0].path;
  if (modStoreExact.length > 1) {
    const bestStoreMod = scoreVehicleImageCache(
      modStoreExact,
      vehicleNameNorm,
      brandNameNorm,
      typeNameNorm,
      vehicleName,
      6
    );
    if (bestStoreMod.bestMatch && bestStoreMod.bestScore >= 6) return bestStoreMod.bestMatch.path;
  }
  const curatedDirect = curatedAll.filter(directCompactMatch);
  if (curatedDirect.length === 1) return curatedDirect[0].path;
  if (curatedDirect.length > 1) {
    const bestCur = scoreVehicleImageCache(
      curatedDirect,
      vehicleNameNorm,
      brandNameNorm,
      typeNameNorm,
      vehicleName,
      8
    );
    if (bestCur.bestMatch && bestCur.bestScore >= 8) return bestCur.bestMatch.path;
  }
  const modDirect = modAll.filter(directCompactMatch);
  if (modDirect.length === 1) return modDirect[0].path;
  if (modDirect.length > 1) {
    const best = scoreVehicleImageCache(
      modDirect,
      vehicleNameNorm,
      brandNameNorm,
      typeNameNorm,
      vehicleName,
      9
    );
    if (best.bestMatch && best.bestScore >= 9) return best.bestMatch.path;
  }

  const modJmXt = modAll.filter((img) =>
    modJmXtendedReachMatch(vehicleNameNorm, brandNameNorm, img)
  );
  if (modJmXt.length === 1) {
    console.log(
      `[LocalImage] Mod extract (J&M X-Tended): ${vehicleName} -> ${modJmXt[0].filename}`
    );
    return modJmXt[0].path;
  }
  if (modJmXt.length > 1) {
    const jmRes = scoreVehicleImageCache(
      modJmXt,
      vehicleNameNorm,
      brandNameNorm,
      typeNameNorm,
      vehicleName,
      8
    );
    if (jmRes.bestMatch && jmRes.bestScore >= 8) {
      console.log(
        `[LocalImage] Mod extract (J&M X-Tended): ${vehicleName} -> ${jmRes.bestMatch.filename} (score: ${jmRes.bestScore})`
      );
      return jmRes.bestMatch.path;
    }
  }

  const modLizard = modAll.filter((img) =>
    modLizardExportDisplayNameMatch(vehicleNameNorm, brandNameNorm, img)
  );
  if (modLizard.length === 1) {
    console.log(
      `[LocalImage] Mod extract (Lizard display name): ${vehicleName} -> ${modLizard[0].filename}`
    );
    return modLizard[0].path;
  }
  if (modLizard.length > 1) {
    const lzRes = scoreVehicleImageCache(
      modLizard,
      vehicleNameNorm,
      brandNameNorm,
      typeNameNorm,
      vehicleName,
      8
    );
    if (lzRes.bestMatch && lzRes.bestScore >= 8) {
      console.log(
        `[LocalImage] Mod extract (Lizard display name): ${vehicleName} -> ${lzRes.bestMatch.filename} (score: ${lzRes.bestScore})`
      );
      return lzRes.bestMatch.path;
    }
  }

  const modFendtW = modAll.filter((img) =>
    modFendtWeightsPackMatch(vehicleNameNorm, brandNameNorm, img)
  );
  if (modFendtW.length === 1) {
    console.log(
      `[LocalImage] Mod extract (Fendt weight): ${vehicleName} -> ${modFendtW[0].filename}`
    );
    return modFendtW[0].path;
  }
  if (modFendtW.length > 1) {
    const fwRes = scoreVehicleImageCache(
      modFendtW,
      vehicleNameNorm,
      brandNameNorm,
      typeNameNorm,
      vehicleName,
      8
    );
    if (fwRes.bestMatch && fwRes.bestScore >= 8) {
      console.log(
        `[LocalImage] Mod extract (Fendt weight): ${vehicleName} -> ${fwRes.bestMatch.filename} (score: ${fwRes.bestScore})`
      );
      return fwRes.bestMatch.path;
    }
  }

  const modMerlo = modAll.filter((img) =>
    modMerloMultifarmerPackMatch(vehicleNameNorm, brandNameNorm, img)
  );
  if (modMerlo.length === 1) {
    console.log(
      `[LocalImage] Mod extract (Merlo Multifarmer): ${vehicleName} -> ${modMerlo[0].filename}`
    );
    return modMerlo[0].path;
  }
  if (modMerlo.length > 1) {
    const mlRes = scoreVehicleImageCache(
      modMerlo,
      vehicleNameNorm,
      brandNameNorm,
      typeNameNorm,
      vehicleName,
      8
    );
    if (mlRes.bestMatch && mlRes.bestScore >= 8) {
      console.log(
        `[LocalImage] Mod extract (Merlo Multifarmer): ${vehicleName} -> ${mlRes.bestMatch.filename} (score: ${mlRes.bestScore})`
      );
      return mlRes.bestMatch.path;
    }
  }

  const curatedStrict = curatedAll.filter((img) =>
    filenameMatchesVehicleStrict(img.filename, vehicleName, brandName)
  );
  let curatedResult = scoreVehicleImageCache(
    curatedStrict,
    vehicleNameNorm,
    brandNameNorm,
    typeNameNorm,
    vehicleName,
    MIN_SCORE_STRICT_FILTER
  );
  if (curatedResult.bestMatch && curatedResult.bestScore >= MIN_SCORE_STRICT_FILTER) {
    console.log(
      `[LocalImage] Dynamic match (strict name): ${vehicleName} -> ${curatedResult.bestMatch.filename} (score: ${curatedResult.bestScore})`
    );
    return curatedResult.bestMatch.path;
  }

  const modStrict = modAll.filter((img) =>
    filenameMatchesVehicleStrict(img.filename, vehicleName, brandName)
  );
  let modResult = scoreVehicleImageCache(
    modStrict,
    vehicleNameNorm,
    brandNameNorm,
    typeNameNorm,
    vehicleName,
    MIN_SCORE_STRICT_FILTER
  );
  if (modResult.bestMatch && modResult.bestScore >= MIN_SCORE_STRICT_FILTER) {
    console.log(
      `[LocalImage] Mod extract (strict name): ${vehicleName} -> ${modResult.bestMatch.filename} (score: ${modResult.bestScore})`
    );
    return modResult.bestMatch.path;
  }

  const modSeries = modAll.filter((img) =>
    modExtractSeriesPackMatch(vehicleNameNorm, brandNameNorm, img)
  );
  if (modSeries.length === 1) {
    console.log(
      `[LocalImage] Mod extract (series pack): ${vehicleName} -> ${modSeries[0].filename}`
    );
    return modSeries[0].path;
  }
  if (modSeries.length > 1) {
    modResult = scoreVehicleImageCache(
      modSeries,
      vehicleNameNorm,
      brandNameNorm,
      typeNameNorm,
      vehicleName,
      8
    );
    if (modResult.bestMatch && modResult.bestScore >= 8) {
      console.log(
        `[LocalImage] Mod extract (series pack): ${vehicleName} -> ${modResult.bestMatch.filename} (score: ${modResult.bestScore})`
      );
      return modResult.bestMatch.path;
    }
  }

  const modPlatform = modAll.filter((img) =>
    modSchwarzmuellerPlatformTrailerMatch(vehicleNameNorm, brandNameNorm, img)
  );
  if (modPlatform.length === 1) {
    console.log(
      `[LocalImage] Mod extract (platform/semi trailer): ${vehicleName} -> ${modPlatform[0].filename}`
    );
    return modPlatform[0].path;
  }
  if (modPlatform.length > 1) {
    modResult = scoreVehicleImageCache(
      modPlatform,
      vehicleNameNorm,
      brandNameNorm,
      typeNameNorm,
      vehicleName,
      8
    );
    if (modResult.bestMatch && modResult.bestScore >= 8) {
      console.log(
        `[LocalImage] Mod extract (platform/semi trailer): ${vehicleName} -> ${modResult.bestMatch.filename} (score: ${modResult.bestScore})`
      );
      return modResult.bestMatch.path;
    }
  }

  // Last resort: fuzzy scoring on full mod cache (items_mod_extract — still included; threshold tuned for mod names)
  modResult = scoreVehicleImageCache(
    modAll,
    vehicleNameNorm,
    brandNameNorm,
    typeNameNorm,
    vehicleName,
    MIN_SCORE_FUZZY_MOD
  );
  if (modResult.bestMatch && modResult.bestScore >= MIN_SCORE_FUZZY_MOD) {
    console.log(
      `[LocalImage] Mod extract (fuzzy): ${vehicleName} -> ${modResult.bestMatch.filename} (score: ${modResult.bestScore})`
    );
    return modResult.bestMatch.path;
  }

  const curatedFuzzyPool = buildCuratedFuzzyImagePool(
    curatedAll,
    vehicleNameNorm,
    brandNameNorm,
    directCompactMatch
  );
  if (curatedFuzzyPool.length > 0) {
    curatedResult = scoreVehicleImageCache(
      curatedFuzzyPool,
      vehicleNameNorm,
      brandNameNorm,
      typeNameNorm,
      vehicleName,
      MIN_SCORE_FUZZY_CURATED
    );
    if (curatedResult.bestMatch && curatedResult.bestScore >= MIN_SCORE_FUZZY_CURATED) {
      console.log(
        `[LocalImage] Dynamic match (fuzzy): ${vehicleName} -> ${curatedResult.bestMatch.filename} (score: ${curatedResult.bestScore})`
      );
      return curatedResult.bestMatch.path;
    }
  }

  return null;
}

// Format operating time from milliseconds to readable format
export function formatOperatingTime(operatingTimeMs) {
  if (!operatingTimeMs || operatingTimeMs === 0) {
    return "0h";
  }

  // Convert milliseconds to hours
  const hours = Math.round(operatingTimeMs / (1000 * 60 * 60));

  if (hours < 1) {
    return "0h";
  } else if (hours < 24) {
    return `${hours}h`;
  } else if (hours < 8760) {
    // Less than a year
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  } else {
    const years = Math.floor(hours / 8760);
    const remainingHours = hours % 8760;
    const days = Math.floor(remainingHours / 24);
    if (days > 0) {
      return `${years}y ${days}d`;
    } else {
      return `${years}y`;
    }
  }
}

// Vehicle Image Mapping (keeping for future use when wiki URLs are fixed)
export function getVehicleWikiImage(vehicleName, brandName, typeName) {
  // Mapping of vehicle names and keywords to their FS25 wiki images
  const vehicleImageMap = {
    // John Deere Tractors
    "8R 410":
      "https://farmingsimulator.wiki.gg/images/thumb/5/54/Johndeere8r410.png/300px-Johndeere8r410.png",
    "8r": "https://farmingsimulator.wiki.gg/images/thumb/5/54/Johndeere8r410.png/300px-Johndeere8r410.png",
    "john deere tractor":
      "https://farmingsimulator.wiki.gg/images/thumb/5/54/Johndeere8r410.png/300px-Johndeere8r410.png",
    "X9 1100":
      "https://farmingsimulator.wiki.gg/images/thumb/a/a4/Johndeere_x9_1100.png/300px-Johndeere_x9_1100.png",
    x9: "https://farmingsimulator.wiki.gg/images/thumb/a/a4/Johndeere_x9_1100.png/300px-Johndeere_x9_1100.png",

    // McCormick
    "X8.631 VT-Drive":
      "https://farmingsimulator.wiki.gg/images/thumb/c/c4/Mccormick_x8631_vt-drive.png/300px-Mccormick_x8631_vt-drive.png",
    mccormick:
      "https://farmingsimulator.wiki.gg/images/thumb/c/c4/Mccormick_x8631_vt-drive.png/300px-Mccormick_x8631_vt-drive.png",

    // JCB
    "541-70 AGRI PRO":
      "https://farmingsimulator.wiki.gg/images/thumb/7/7e/Jcb_541-70_agri_pro.png/300px-Jcb_541-70_agri_pro.png",
    "541-70":
      "https://farmingsimulator.wiki.gg/images/thumb/7/7e/Jcb_541-70_agri_pro.png/300px-Jcb_541-70_agri_pro.png",
    "jcb telehandler":
      "https://farmingsimulator.wiki.gg/images/thumb/7/7e/Jcb_541-70_agri_pro.png/300px-Jcb_541-70_agri_pro.png",

    // Manitou
    "M50-4":
      "https://farmingsimulator.wiki.gg/images/thumb/8/8c/Manitou_m50-4.png/300px-Manitou_m50-4.png",
    m50: "https://farmingsimulator.wiki.gg/images/thumb/8/8c/Manitou_m50-4.png/300px-Manitou_m50-4.png",
    "manitou telehandler":
      "https://farmingsimulator.wiki.gg/images/thumb/8/8c/Manitou_m50-4.png/300px-Manitou_m50-4.png",
    "MLT 841-145 PS+":
      "https://farmingsimulator.wiki.gg/images/thumb/d/d5/Manitou_mlt_841-145_ps%2B.png/300px-Manitou_mlt_841-145_ps%2B.png",

    // Volvo
    EC380DL:
      "https://farmingsimulator.wiki.gg/images/thumb/3/3e/Volvo_ec380dl.png/300px-Volvo_ec380dl.png",
    ec380:
      "https://farmingsimulator.wiki.gg/images/thumb/3/3e/Volvo_ec380dl.png/300px-Volvo_ec380dl.png",
    "volvo excavator":
      "https://farmingsimulator.wiki.gg/images/thumb/3/3e/Volvo_ec380dl.png/300px-Volvo_ec380dl.png",

    // International
    "Transtar II":
      "https://farmingsimulator.wiki.gg/images/thumb/a/ac/International_transtar_ii.png/300px-International_transtar_ii.png",
    transtar:
      "https://farmingsimulator.wiki.gg/images/thumb/a/ac/International_transtar_ii.png/300px-International_transtar_ii.png",
    "Series 200":
      "https://farmingsimulator.wiki.gg/images/thumb/5/5c/International_series_200.png/300px-International_series_200.png",
    "international truck":
      "https://farmingsimulator.wiki.gg/images/thumb/a/ac/International_transtar_ii.png/300px-International_transtar_ii.png",

    // Kotte
    "TSA 30000":
      "https://farmingsimulator.wiki.gg/images/thumb/8/8f/Kotte_tsa_30000.png/300px-Kotte_tsa_30000.png",
    tsa: "https://farmingsimulator.wiki.gg/images/thumb/8/8f/Kotte_tsa_30000.png/300px-Kotte_tsa_30000.png",
    "FRC 65":
      "https://farmingsimulator.wiki.gg/images/thumb/f/f8/Kotte_frc_65.png/300px-Kotte_frc_65.png",
    frc: "https://farmingsimulator.wiki.gg/images/thumb/f/f8/Kotte_frc_65.png/300px-Kotte_frc_65.png",
    kotte:
      "https://farmingsimulator.wiki.gg/images/thumb/8/8f/Kotte_tsa_30000.png/300px-Kotte_tsa_30000.png",

    // Hawe
    "SUW 5000":
      "https://farmingsimulator.wiki.gg/images/thumb/4/4c/Hawe_suw_5000.png/300px-Hawe_suw_5000.png",
    suw: "https://farmingsimulator.wiki.gg/images/thumb/4/4c/Hawe_suw_5000.png/300px-Hawe_suw_5000.png",
    hawe: "https://farmingsimulator.wiki.gg/images/thumb/4/4c/Hawe_suw_5000.png/300px-Hawe_suw_5000.png",

    // Lizard
    "MKS 32":
      "https://farmingsimulator.wiki.gg/images/thumb/9/92/Lizard_mks_32.png/300px-Lizard_mks_32.png",
    mks: "https://farmingsimulator.wiki.gg/images/thumb/9/92/Lizard_mks_32.png/300px-Lizard_mks_32.png",
    lizard:
      "https://farmingsimulator.wiki.gg/images/thumb/9/92/Lizard_mks_32.png/300px-Lizard_mks_32.png",

    // Wilson
    Silverstar:
      "https://farmingsimulator.wiki.gg/images/thumb/1/1f/Wilson_silverstar.png/300px-Wilson_silverstar.png",
    wilson:
      "https://farmingsimulator.wiki.gg/images/thumb/1/1f/Wilson_silverstar.png/300px-Wilson_silverstar.png",

    // Krampe
    "SKS 30/1050":
      "https://farmingsimulator.wiki.gg/images/thumb/8/8a/Krampe_sks_30-1050.png/300px-Krampe_sks_30-1050.png",
    krampe:
      "https://farmingsimulator.wiki.gg/images/thumb/8/8a/Krampe_sks_30-1050.png/300px-Krampe_sks_30-1050.png",

    // LODE KING
    "Renown Drop Deck":
      "https://farmingsimulator.wiki.gg/images/thumb/7/7c/Lodeking_renown_drop_deck.png/300px-Lodeking_renown_drop_deck.png",
    lodeking:
      "https://farmingsimulator.wiki.gg/images/thumb/7/7c/Lodeking_renown_drop_deck.png/300px-Lodeking_renown_drop_deck.png",
    "lode king":
      "https://farmingsimulator.wiki.gg/images/thumb/7/7c/Lodeking_renown_drop_deck.png/300px-Lodeking_renown_drop_deck.png",

    // Heizomat
    "HM 10-500 KF":
      "https://farmingsimulator.wiki.gg/images/thumb/2/2b/Heizomat_hm_10-500_kf.png/300px-Heizomat_hm_10-500_kf.png",
    heizomat:
      "https://farmingsimulator.wiki.gg/images/thumb/2/2b/Heizomat_hm_10-500_kf.png/300px-Heizomat_hm_10-500_kf.png",

    // Siloking
    "TrailedLine 4.0 System 1000+":
      "https://farmingsimulator.wiki.gg/images/thumb/d/d6/Siloking_trailedline_4.0_system_1000%2B.png/300px-Siloking_trailedline_4.0_system_1000%2B.png",
    trailedline:
      "https://farmingsimulator.wiki.gg/images/thumb/d/d6/Siloking_trailedline_4.0_system_1000%2B.png/300px-Siloking_trailedline_4.0_system_1000%2B.png",
    siloking:
      "https://farmingsimulator.wiki.gg/images/thumb/d/d6/Siloking_trailedline_4.0_system_1000%2B.png/300px-Siloking_trailedline_4.0_system_1000%2B.png",

    // Kärcher
    "HDS 9/18-4 M":
      "https://farmingsimulator.wiki.gg/images/thumb/0/05/Kaercher_hds_9-18-4_m.png/300px-Kaercher_hds_9-18-4_m.png",
    hds: "https://farmingsimulator.wiki.gg/images/thumb/0/05/Kaercher_hds_9-18-4_m.png/300px-Kaercher_hds_9-18-4_m.png",
    kaercher:
      "https://farmingsimulator.wiki.gg/images/thumb/0/05/Kaercher_hds_9-18-4_m.png/300px-Kaercher_hds_9-18-4_m.png",
    kärcher:
      "https://farmingsimulator.wiki.gg/images/thumb/0/05/Kaercher_hds_9-18-4_m.png/300px-Kaercher_hds_9-18-4_m.png",

    // Kubota
    "RTV-XG850 SIDEKICK":
      "https://farmingsimulator.wiki.gg/images/thumb/a/a9/Kubota_rtv-xg850_sidekick.png/300px-Kubota_rtv-xg850_sidekick.png",
    rtv: "https://farmingsimulator.wiki.gg/images/thumb/a/a9/Kubota_rtv-xg850_sidekick.png/300px-Kubota_rtv-xg850_sidekick.png",
    kubota:
      "https://farmingsimulator.wiki.gg/images/thumb/a/a9/Kubota_rtv-xg850_sidekick.png/300px-Kubota_rtv-xg850_sidekick.png",
    sidekick:
      "https://farmingsimulator.wiki.gg/images/thumb/a/a9/Kubota_rtv-xg850_sidekick.png/300px-Kubota_rtv-xg850_sidekick.png",

    // STEMA
    TRIUS:
      "https://farmingsimulator.wiki.gg/images/thumb/6/6f/Stema_trius.png/300px-Stema_trius.png",
    trius:
      "https://farmingsimulator.wiki.gg/images/thumb/6/6f/Stema_trius.png/300px-Stema_trius.png",
    stema:
      "https://farmingsimulator.wiki.gg/images/thumb/6/6f/Stema_trius.png/300px-Stema_trius.png",

    // TMC Cancela
    "THX-180":
      "https://farmingsimulator.wiki.gg/images/thumb/9/9a/Tmccancela_thx-180.png/300px-Tmccancela_thx-180.png",
    thx: "https://farmingsimulator.wiki.gg/images/thumb/9/9a/Tmccancela_thx-180.png/300px-Tmccancela_thx-180.png",
    tmccancela:
      "https://farmingsimulator.wiki.gg/images/thumb/9/9a/Tmccancela_thx-180.png/300px-Tmccancela_thx-180.png",

    // Abi
    1600: "https://farmingsimulator.wiki.gg/images/thumb/0/09/Abi_1600.png/300px-Abi_1600.png",
    abi: "https://farmingsimulator.wiki.gg/images/thumb/0/09/Abi_1600.png/300px-Abi_1600.png",

    // PÖTTINGER
    "TERRIA 6040":
      "https://farmingsimulator.wiki.gg/images/thumb/8/8a/Poettinger_terria_6040.png/300px-Poettinger_terria_6040.png",
    terria:
      "https://farmingsimulator.wiki.gg/images/thumb/8/8a/Poettinger_terria_6040.png/300px-Poettinger_terria_6040.png",
    pöttinger:
      "https://farmingsimulator.wiki.gg/images/thumb/8/8a/Poettinger_terria_6040.png/300px-Poettinger_terria_6040.png",
    poettinger:
      "https://farmingsimulator.wiki.gg/images/thumb/8/8a/Poettinger_terria_6040.png/300px-Poettinger_terria_6040.png",

    // Tenwinkel
    "FGB 600":
      "https://farmingsimulator.wiki.gg/images/thumb/f/f5/Tenwinkel_fgb_600.png/300px-Tenwinkel_fgb_600.png",
    fgb: "https://farmingsimulator.wiki.gg/images/thumb/f/f5/Tenwinkel_fgb_600.png/300px-Tenwinkel_fgb_600.png",
    tenwinkel:
      "https://farmingsimulator.wiki.gg/images/thumb/f/f5/Tenwinkel_fgb_600.png/300px-Tenwinkel_fgb_600.png",

    // Albutt
    "Bale Fork F155A (Telehandler)":
      "https://farmingsimulator.wiki.gg/images/thumb/a/a5/Albutt_bale_fork_f155a_%28telehandler%29.png/300px-Albutt_bale_fork_f155a_%28telehandler%29.png",
    "bale fork":
      "https://farmingsimulator.wiki.gg/images/thumb/a/a5/Albutt_bale_fork_f155a_%28telehandler%29.png/300px-Albutt_bale_fork_f155a_%28telehandler%29.png",
    albutt:
      "https://farmingsimulator.wiki.gg/images/thumb/a/a5/Albutt_bale_fork_f155a_%28telehandler%29.png/300px-Albutt_bale_fork_f155a_%28telehandler%29.png",

    // MAGSI
    "Bale Fork":
      "https://farmingsimulator.wiki.gg/images/thumb/f/f1/Magsi_bale_fork.png/300px-Magsi_bale_fork.png",
    "Manure Fork":
      "https://farmingsimulator.wiki.gg/images/thumb/e/e2/Magsi_manure_fork.png/300px-Magsi_manure_fork.png",
    "manure fork":
      "https://farmingsimulator.wiki.gg/images/thumb/e/e2/Magsi_manure_fork.png/300px-Magsi_manure_fork.png",
    magsi:
      "https://farmingsimulator.wiki.gg/images/thumb/f/f1/Magsi_bale_fork.png/300px-Magsi_bale_fork.png",

    // Train Cars (generic)
    Train:
      "https://farmingsimulator.wiki.gg/images/thumb/c/c8/Train_locomotive.png/300px-Train_locomotive.png",
    locomotive:
      "https://farmingsimulator.wiki.gg/images/thumb/c/c8/Train_locomotive.png/300px-Train_locomotive.png",
    "Grain Wagon":
      "https://farmingsimulator.wiki.gg/images/thumb/f/f4/Train_grain_wagon.png/300px-Train_grain_wagon.png",
    "grain wagon":
      "https://farmingsimulator.wiki.gg/images/thumb/f/f4/Train_grain_wagon.png/300px-Train_grain_wagon.png",
    "Sugarbeet Wagon":
      "https://farmingsimulator.wiki.gg/images/thumb/9/9d/Train_sugarbeet_wagon.png/300px-Train_sugarbeet_wagon.png",
    "sugarbeet wagon":
      "https://farmingsimulator.wiki.gg/images/thumb/9/9d/Train_sugarbeet_wagon.png/300px-Train_sugarbeet_wagon.png",
    "Woodchips Wagon":
      "https://farmingsimulator.wiki.gg/images/thumb/7/7a/Train_woodchips_wagon.png/300px-Train_woodchips_wagon.png",
    "woodchips wagon":
      "https://farmingsimulator.wiki.gg/images/thumb/7/7a/Train_woodchips_wagon.png/300px-Train_woodchips_wagon.png",
    "Timber Wagon":
      "https://farmingsimulator.wiki.gg/images/thumb/b/b8/Train_timber_wagon.png/300px-Train_timber_wagon.png",
    "timber wagon":
      "https://farmingsimulator.wiki.gg/images/thumb/b/b8/Train_timber_wagon.png/300px-Train_timber_wagon.png",
    "Flatbed Wagon":
      "https://farmingsimulator.wiki.gg/images/thumb/b/b8/Train_timber_wagon.png/300px-Train_timber_wagon.png",
    "flatbed wagon":
      "https://farmingsimulator.wiki.gg/images/thumb/b/b8/Train_timber_wagon.png/300px-Train_timber_wagon.png",

    // Pallets and Big Bags - Generic Images for Storage Items
    Wheat:
      "https://farmingsimulator.wiki.gg/images/thumb/6/6a/Pallet_wheat.png/300px-Pallet_wheat.png",
    wheat:
      "https://farmingsimulator.wiki.gg/images/thumb/6/6a/Pallet_wheat.png/300px-Pallet_wheat.png",
    Seeds:
      "https://farmingsimulator.wiki.gg/images/thumb/a/a7/Bigbag_seeds.png/300px-Bigbag_seeds.png",
    seeds:
      "https://farmingsimulator.wiki.gg/images/thumb/a/a7/Bigbag_seeds.png/300px-Bigbag_seeds.png",
    "Bag of fertilizer":
      "https://farmingsimulator.wiki.gg/images/thumb/c/c2/Pallet_fertilizer.png/300px-Pallet_fertilizer.png",
    fertilizer:
      "https://farmingsimulator.wiki.gg/images/thumb/c/c2/Pallet_fertilizer.png/300px-Pallet_fertilizer.png",
    "Bag of mineral feed":
      "https://farmingsimulator.wiki.gg/images/thumb/d/d4/Pallet_mineral_feed.png/300px-Pallet_mineral_feed.png",
    "Mineral Feed":
      "https://farmingsimulator.wiki.gg/images/thumb/d/d4/Pallet_mineral_feed.png/300px-Pallet_mineral_feed.png",
    "mineral feed":
      "https://farmingsimulator.wiki.gg/images/thumb/d/d4/Pallet_mineral_feed.png/300px-Pallet_mineral_feed.png",
    "Canister with herbicide":
      "https://farmingsimulator.wiki.gg/images/thumb/8/81/Canister_herbicide.png/300px-Canister_herbicide.png",
    Herbicide:
      "https://farmingsimulator.wiki.gg/images/thumb/8/81/Canister_herbicide.png/300px-Canister_herbicide.png",
    herbicide:
      "https://farmingsimulator.wiki.gg/images/thumb/8/81/Canister_herbicide.png/300px-Canister_herbicide.png",
    "Honey Pallet":
      "https://farmingsimulator.wiki.gg/images/thumb/f/f3/Pallet_honey.png/300px-Pallet_honey.png",
    honey:
      "https://farmingsimulator.wiki.gg/images/thumb/f/f3/Pallet_honey.png/300px-Pallet_honey.png",
    Eggs: "https://farmingsimulator.wiki.gg/images/thumb/e/e4/Pallet_eggs.png/300px-Pallet_eggs.png",
    eggs: "https://farmingsimulator.wiki.gg/images/thumb/e/e4/Pallet_eggs.png/300px-Pallet_eggs.png",
    "Garlic Pallet":
      "https://farmingsimulator.wiki.gg/images/thumb/2/2a/Pallet_garlic.png/300px-Pallet_garlic.png",
    garlic:
      "https://farmingsimulator.wiki.gg/images/thumb/2/2a/Pallet_garlic.png/300px-Pallet_garlic.png",
    "Strawberries Pallet":
      "https://farmingsimulator.wiki.gg/images/thumb/4/4c/Pallet_strawberries.png/300px-Pallet_strawberries.png",
    strawberries:
      "https://farmingsimulator.wiki.gg/images/thumb/4/4c/Pallet_strawberries.png/300px-Pallet_strawberries.png",
    "Tomatoes Pallet":
      "https://farmingsimulator.wiki.gg/images/thumb/7/7d/Pallet_tomatoes.png/300px-Pallet_tomatoes.png",
    tomatoes:
      "https://farmingsimulator.wiki.gg/images/thumb/7/7d/Pallet_tomatoes.png/300px-Pallet_tomatoes.png",
    "Chilli Peppers Pallet":
      "https://farmingsimulator.wiki.gg/images/thumb/1/15/Pallet_chilli.png/300px-Pallet_chilli.png",
    chilli:
      "https://farmingsimulator.wiki.gg/images/thumb/1/15/Pallet_chilli.png/300px-Pallet_chilli.png",
  };

  // Debug logging to understand what we're trying to match
  console.log(
    `[VehicleImage] Trying to match: "${vehicleName}" | Brand: "${brandName}" | Type: "${typeName}"`
  );

  // Create search terms - combine all relevant information
  const searchTerms = [
    vehicleName,
    brandName,
    `${brandName} ${vehicleName}`,
    `${vehicleName} ${brandName}`,
    typeName,
  ].filter(
    (term) =>
      term &&
      term.toLowerCase() !== "none" &&
      term.toLowerCase() !== "unknown"
  );

  // Try exact matches first for all search terms
  for (const term of searchTerms) {
    if (term && vehicleImageMap[term]) {
      console.log(`[VehicleImage] Exact match found for "${term}"`);
      return vehicleImageMap[term];
    }
  }

  // Try case-insensitive matches
  for (const term of searchTerms) {
    if (!term) continue;
    const termLower = term.toLowerCase();
    for (const [mapKey, url] of Object.entries(vehicleImageMap)) {
      if (mapKey.toLowerCase() === termLower) {
        console.log(
          `[VehicleImage] Case-insensitive match found: "${term}" -> "${mapKey}"`
        );
        return url;
      }
    }
  }

  // Try partial/fuzzy matching with very flexible approach
  for (const term of searchTerms) {
    if (!term) continue;
    const termLower = term.toLowerCase().trim();

    // Skip very short terms to avoid false positives
    if (termLower.length < 3) continue;

    for (const [mapKey, url] of Object.entries(vehicleImageMap)) {
      const mapKeyLower = mapKey.toLowerCase();

      // Direct substring matches
      if (
        termLower.includes(mapKeyLower) ||
        mapKeyLower.includes(termLower)
      ) {
        console.log(
          `[VehicleImage] Substring match found: "${term}" matched with "${mapKey}"`
        );
        return url;
      }

      // Word-by-word matching
      const termWords = termLower
        .split(/\s+/)
        .filter((word) => word.length > 2);
      const mapWords = mapKeyLower
        .split(/\s+/)
        .filter((word) => word.length > 2);

      // Check if any significant words match
      for (const termWord of termWords) {
        for (const mapWord of mapWords) {
          if (
            termWord === mapWord ||
            termWord.includes(mapWord) ||
            mapWord.includes(termWord)
          ) {
            console.log(
              `[VehicleImage] Word match found: "${termWord}" (from "${term}") matched with "${mapWord}" (from "${mapKey}")`
            );
            return url;
          }
        }
      }
    }
  }

  console.log(
    `[VehicleImage] No match found for any search terms: ${searchTerms.join(
      ", "
    )}`
  );
  return null;
}

// Helper function to make images work with CORS proxy
export function proxifyImageUrl(imageUrl) {
  if (!imageUrl) return null;

  // Use a CORS proxy to bypass cross-origin restrictions
  const corsProxies = [
    "https://corsproxy.io/?",
    "https://api.allorigins.win/raw?url=",
    "https://cors-anywhere.herokuapp.com/",
  ];

  // Try the first proxy
  return corsProxies[0] + encodeURIComponent(imageUrl);
}

export function getBrandImageUrl(brandImagePath, brandName) {
  // If the brand image path starts with "data/", it's a game file path that won't work in browser
  if (brandImagePath && brandImagePath.startsWith("data/")) {
    console.log(
      `[VehicleImage] Game file path detected: ${brandImagePath}, using brand fallback`
    );
    return null; // Return null so we fall back to icons
  }

  // If it's already a web URL, return it
  if (
    brandImagePath &&
    (brandImagePath.startsWith("http://") ||
      brandImagePath.startsWith("https://"))
  ) {
    return brandImagePath;
  }

  // For brands without web images, we could add specific brand logo URLs here
  const brandImageMap = {
    "John Deere":
      "https://logos-world.net/wp-content/uploads/2020/11/John-Deere-Logo.png",
    Volvo:
      "https://logos-world.net/wp-content/uploads/2020/04/Volvo-Logo.png",
    JCB: "https://logos-world.net/wp-content/uploads/2020/12/JCB-Logo.png",
    Manitou:
      "https://logos-world.net/wp-content/uploads/2023/08/Manitou-Logo.png",
    International:
      "https://logos-world.net/wp-content/uploads/2023/01/International-Logo.png",
    // Add more brand logos as needed
  };

  return brandImageMap[brandName] || null;
}

// Vehicle Management Methods
export async function loadVehicles() {
  const farmId = window.dashboard?.activeFarmId || this.activeFarmId || 1;
  const grid = document.getElementById("vehicles-grid");
  const canPaintFromMemory =
    grid &&
    !grid.querySelector(".vehicle-card") &&
    Array.isArray(this.vehicles) &&
    this.vehicles.length > 0;

  if (canPaintFromMemory) {
    const merged = this.vehicles.filter((v) => vehicleMatchesActiveFarm(v, farmId));
    this.vehicles = merged;
    this.updateVehicleSummaryCards();
    if (typeof this.applyVehicleFilters === "function") {
      this.applyVehicleFilters();
    } else {
      this.renderVehicleCards(this.vehicles);
    }
  }

  try {
    const base =
      typeof window !== "undefined" && window.dashboard?.getAPIBaseURL
        ? window.dashboard.getAPIBaseURL()
        : getAPIBaseURL();
    const response = await fetch(`${base}/api/vehicles`);
    if (response.ok) {
      const allVehicles = await response.json();
      const filtered = allVehicles
        ? allVehicles.filter((v) => vehicleMatchesActiveFarm(v, farmId))
        : [];
      const displayVehicles = filtered.filter((v) => !this.isStorageItem(v));
      const nextFp = vehicleListUiFingerprint(displayVehicles);
      const sameFleet =
        nextFp === this._lastVehicleCardsFingerprint &&
        filtered.length === (this.vehicles?.length ?? 0);

      this.vehicles = filtered;
      this.updateVehicleSummaryCards();
      if (!sameFleet) {
        if (typeof this.applyVehicleFilters === "function") {
          this.applyVehicleFilters();
        } else {
          this.renderVehicleCards(this.vehicles);
        }
      }
    } else {
      console.error("Failed to load vehicles:", response.statusText);
      this.vehicles = [];
    }
  } catch (error) {
    console.error("Error loading vehicles:", error);
    this.vehicles = [];
  }
}

export function updateVehicleSummaryCards() {
  const vehicles = this.vehicles || [];
  // Filter out storage items for summary counts
  const displayVehicles = vehicles.filter((v) => !this.isStorageItem(v));
  const totalCount = displayVehicles.length;

  const lowFuelCount = displayVehicles.filter((v) => {
    // Skip fuel calculations for vehicles that don't use traditional fuel
    const skipFuelTypes = ["highPressureWasher", "High Pressure Washer"];
    if (!v.isMotorized || skipFuelTypes.includes(v.typeName)) return false;

    // Check fuel from multiple sources like in createVehicleCard
    let fuelPercentage = 0;
    if (v.fuelCapacity > 0 && v.fuelLevel > 0) {
      fuelPercentage = (v.fuelLevel / v.fuelCapacity) * 100;
    } else if (v.fillLevels && v.fillLevels["DIESEL"]) {
      const diesel = v.fillLevels["DIESEL"];
      fuelPercentage =
        diesel.capacity > 0 ? (diesel.level / diesel.capacity) * 100 : 0;
    }

    return fuelPercentage < 25;
  }).length;

  const damagedCount = displayVehicles.filter((v) => isVehicleHighWear(v)).length;

  this.setElementText("total-vehicles-count", totalCount);
  this.setElementText("low-fuel-count", lowFuelCount);
  this.setElementText("damaged-vehicles-count", damagedCount);

  const adsFleet = summarizeAdsFleet(displayVehicles);
  const adsRow = document.getElementById("ads-fleet-summary-row");
  if (adsRow) {
    adsRow.classList.toggle("d-none", !adsFleet.enabled);
    this.setElementText("ads-in-service-count", adsFleet.inServiceCount);
    this.setElementText("ads-needs-repair-count", adsFleet.needsRepairCount);
    this.setElementText("ads-overdue-count", adsFleet.overdueMaintenanceCount);
  }
}

export function renderVehicleCards(vehicles) {
  const grid = document.getElementById("vehicles-grid");
  if (!grid) return;

  if (!vehicles || vehicles.length === 0) {
    grid.innerHTML = `
      <div class="col-12 text-center py-5">
        <i class="bi bi-truck fs-1 text-muted mb-3"></i>
        <h4 class="text-muted">${t("vehicles.emptyNoneTitle")}</h4>
        <p class="text-muted">${t("vehicles.emptyNoneBody")}</p>
      </div>
    `;
    return;
  }

  // Filter out storage items (pallets and bigBags) from display
  const displayVehicles = vehicles.filter(
    (vehicle) => !this.isStorageItem(vehicle)
  );

  if (displayVehicles.length === 0) {
    grid.innerHTML = `
      <div class="col-12 text-center py-5">
        <i class="bi bi-truck fs-1 text-muted mb-3"></i>
        <h4 class="text-muted">${t("vehicles.emptyStorageTitle")}</h4>
        <p class="text-muted">${t("vehicles.emptyStorageBody")}</p>
      </div>
    `;
    this._lastVehicleCardsFingerprint = "";
    return;
  }

  const fingerprint = vehicleListUiFingerprint(displayVehicles);
  if (
    fingerprint === this._lastVehicleCardsFingerprint &&
    grid.querySelector(".vehicle-card")
  ) {
    return;
  }
  this._lastVehicleCardsFingerprint = fingerprint;

  if (this._vehicleCardsRenderRaf) {
    cancelAnimationFrame(this._vehicleCardsRenderRaf);
    this._vehicleCardsRenderRaf = 0;
  }

  const BATCH = 8;
  let index = 0;
  grid.innerHTML = "";

  const renderBatch = () => {
    if (index >= displayVehicles.length) {
      this._vehicleCardsRenderRaf = 0;
      return;
    }
    const slice = displayVehicles.slice(index, index + BATCH);
    index += BATCH;
    grid.insertAdjacentHTML(
      "beforeend",
      slice.map((vehicle) => this.createVehicleCard(vehicle)).join("")
    );
    this._vehicleCardsRenderRaf = requestAnimationFrame(renderBatch);
  };

  this._vehicleCardsRenderRaf = requestAnimationFrame(renderBatch);
}

export function createVehicleCard(vehicle) {
  const brandName = resolveVehicleBrandLabel(vehicle.brand);
  const brandImagePath =
    typeof vehicle.brand === "object" && vehicle.brand.image
      ? vehicle.brand.image
      : null;

  // Generate vehicle display data for CSS styling
  const displayName = resolveVehicleDisplayName(vehicle);
  const vehicleDisplay = this.generateVehicleDisplay(
    displayName,
    brandName,
    vehicle.typeName,
    {
      storeName:
        vehicle.storeName ||
        vehicle.vehicleYears?.storeName ||
        null,
    }
  );

  // Calculate fuel percentage - check multiple possible fuel sources
  // Skip fuel display for vehicles that don't use traditional fuel
  const skipFuelTypes = ["highPressureWasher", "High Pressure Washer"];
  let fuelPercentage = 0;
  const shouldShowFuel =
    vehicle.isMotorized && !skipFuelTypes.includes(vehicle.typeName);

  if (shouldShowFuel) {
    if (vehicle.fuelCapacity > 0 && vehicle.fuelLevel > 0) {
      fuelPercentage = Math.round(
        (vehicle.fuelLevel / vehicle.fuelCapacity) * 100
      );
    } else if (vehicle.fillLevels && vehicle.fillLevels["DIESEL"]) {
      const diesel = vehicle.fillLevels["DIESEL"];
      fuelPercentage =
        diesel.capacity > 0
          ? Math.round((diesel.level / diesel.capacity) * 100)
          : 0;
    }
  }
  const damagePercentage = Math.round(getVehicleDamageFraction(vehicle) * 100);
  const conditionPercentage = Math.round(getVehicleConditionFraction(vehicle) * 100);
  const adsPanel = buildAdsVehiclePanelHtml(vehicle);
  const vyPanel = buildVehicleYearsPanelHtml(vehicle);
  const adsWarnClass = vehicleNeedsAdsWarning(vehicle)
    ? " vehicle-card--ads-warn"
    : "";
  const adsHeaderWarn =
    vehicleNeedsAdsWarning(vehicle)
      ? `<span class="badge bg-danger ms-1" title="${_safe(t("vehicles.adsCardWarnTitle"))}"><i class="bi bi-exclamation-triangle-fill"></i></span>`
      : "";
  const modelYear = getVehicleModelYear(vehicle);
  const yearBadge =
    modelYear != null
      ? `<span class="badge bg-info text-dark ms-1" title="${_safe(t("vehicles.vyModelYear"))}">${modelYear}</span>`
      : isVehicleYearUnknown(vehicle)
        ? `<span class="badge bg-secondary ms-1">${_safe(t("vehicles.yearUnknownShort"))}</span>`
        : "";
  const statusIcon = vehicle.engineOn
    ? "bi-play-circle-fill text-success"
    : "bi-pause-circle text-muted";
  const vehicleIcon = this.getVehicleIcon(
    vehicle.vehicleType,
    vehicle.typeName
  );

  const storageItem = isStorageItem(vehicle);

  // Fill levels summary
  const fillSummary =
    Object.keys(vehicle.fillLevels || {}).length > 0
      ? Object.entries(vehicle.fillLevels)
          .map(([type, data]) => {
            const percentage =
              data.capacity > 0
                ? Math.round((data.level / data.capacity) * 100)
                : 0;
            return `<small class="text-muted d-block">${t("vehicles.cardCargoLine", { type, pct: percentage })}</small>`;
          })
          .join("")
      : `<small class="text-muted">${t("vehicles.cardNoCargo")}</small>`;

  return `
    <div class="col-lg-4 col-md-6 mb-4 vehicle-card-col">
      <div class="card bg-secondary h-100 vehicle-card${adsWarnClass}" data-vehicle-id="${
        vehicle.id
      }">
        <div class="card-header d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center">
            <div class="me-3 d-flex align-items-center">
              <i class="bi ${vehicleIcon} fs-4 text-farm-accent me-2"></i>
              ${
                vehicleDisplay.isImage
                  ? `<div class="vehicle-display-container vehicle-shop-thumb"
                        onclick="dashboard.showVehicleImage('${vehicleDisplay.imageUrl}', '${vehicleDisplay.displayText}', '${String(brandName).replace(/'/g, "\\'")}')">
                     <img class="vehicle-shop-thumb-img" src="${vehicleDisplay.imageUrl}" alt="${_safe(vehicleDisplay.displayText)}"${
                       vehicleDisplay.wikiFallbackUrl
                         ? ` data-wiki-fallback="${vehicleDisplay.wikiFallbackUrl}"`
                         : ""
                     }
                          onerror="if(this.dataset.wikiFallback&&!this.dataset.wikiTried){this.dataset.wikiTried='1';this.src=this.dataset.wikiFallback;return;}this.style.display='none';this.nextElementSibling.style.display='flex';"
                          onmouseover="this.style.transform='scale(1.05)'"
                          onmouseout="this.style.transform='scale(1)'" />
                     <div class="vehicle-shop-thumb-fallback">
                       ${_safe(vehicleDisplay.displayText)}
                     </div>
                     <div class="vehicle-shop-thumb-zoom">
                       <i class="bi bi-zoom-in"></i>
                     </div>
                   </div>`
                  : `<div class="vehicle-display-container" style="width: 80px; height: 60px; border-radius: 8px; background: ${vehicleDisplay.background}; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.3); box-shadow: 0 2px 6px rgba(0,0,0,0.15); position: relative; overflow: hidden;">
                     <div style="color: ${vehicleDisplay.textColor}; font-size: 10px; font-weight: bold; text-align: center; padding: 2px; line-height: 1.1; word-wrap: break-word; max-width: 76px;">
                       ${_safe(vehicleDisplay.displayText)}
                     </div>
                     <div style="position: absolute; top: 2px; right: 2px; width: 12px; height: 12px; border-radius: 50%; background: rgba(255,255,255,0.2);"></div>
                     <div style="position: absolute; bottom: 2px; left: 2px; width: 16px; height: 2px; background: rgba(255,255,255,0.3); border-radius: 1px;"></div>
                   </div>`
              }
            </div>
            <div>
              <h6 class="mb-0 text-truncate" style="max-width: 140px;" title="${_safe(displayName)}">
                ${_safe(displayName)}${yearBadge}${adsHeaderWarn}
              </h6>
              <small class="text-muted">${_safe(brandName || "—")}</small>
            </div>
          </div>
          <i class="bi ${statusIcon} fs-5"></i>
        </div>

        <div class="card-body">
          ${
            !storageItem
              ? `
            <div class="row g-2 mb-3">
              <div class="col-12">
                <div class="d-flex align-items-center">
                  <i class="bi bi-clock text-farm-accent me-2"></i>
                  <div>
                    <small class="text-muted d-block">${t("vehicles.cardOperatingTime")}</small>
                    <strong>${this.formatOperatingTime(
                      vehicle.operatingTime || 0
                    )}</strong>
                  </div>
                </div>
              </div>
            </div>
          `
              : ""
          }

          ${
            shouldShowFuel
              ? `
            <div class="mb-3">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <small class="text-muted">
                  <i class="bi bi-fuel-pump me-1"></i>${t("vehicles.cardFuel")}
                </small>
                <small class="text-muted">${fuelPercentage}%</small>
              </div>
              <div class="progress" style="height: 6px;">
                <div class="progress-bar ${this.getFuelBarColor(
                  fuelPercentage
                )}"
                     style="width: ${fuelPercentage}%"></div>
              </div>
            </div>
          `
              : ""
          }

          ${
            !storageItem
              ? `
            <div class="mb-3">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <small class="text-muted">
                  <i class="bi bi-wrench me-1"></i>${t("vehicles.cardCondition")}
                </small>
                <small class="text-muted">${conditionPercentage}%</small>
              </div>
              <div class="progress" style="height: 6px;">
                <div class="progress-bar ${this.getDamageBarColor(
                  damagePercentage
                )}"
                     style="width: ${conditionPercentage}%"></div>
              </div>
            </div>
            ${adsPanel}
            ${vyPanel && !vehicle?.ads?.enabled ? vyPanel : ""}
          `
              : ""
          }

          <div class="mb-2">
            <small class="text-muted d-block mb-1">
              <i class="bi bi-box me-1"></i>${t("vehicles.cardCargoStatus")}
            </small>
            ${fillSummary}
          </div>

          ${
            vehicle.attachedImplementsCount > 0
              ? `
            <div class="mb-2">
              <small class="text-muted">
                <i class="bi bi-link-45deg me-1"></i>
                ${t(
                  vehicle.attachedImplementsCount === 1
                    ? "vehicles.cardImplementsOne"
                    : "vehicles.cardImplementsMany",
                  { count: vehicle.attachedImplementsCount }
                )}
              </small>
            </div>
          `
              : ""
          }
        </div>

        <div class="card-footer">
          <div class="d-flex justify-content-between align-items-center">
            <small class="text-muted">
              <i class="bi bi-geo-alt me-1"></i>
              ${Math.round(vehicle.position?.x || 0)}, ${Math.round(
    vehicle.position?.z || 0
  )}
            </small>
            <div>
              <span class="badge ${this.getVehicleTypeBadge(
                vehicle.vehicleType,
                vehicle.typeName
              )}">
                ${vehicle.typeName || vehicle.vehicleType}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function getVehicleIcon(vehicleType, typeName = "") {
  // More specific icons based on vehicle type and typeName
  const typeNameLower = typeName.toLowerCase();

  // Check specific type names first for more accurate icons
  if (
    typeNameLower.includes("locomotive") ||
    typeNameLower.includes("train")
  ) {
    return "bi-train-front";
  } else if (
    typeNameLower.includes("telehandler") ||
    typeNameLower.includes("teleHandler")
  ) {
    return "bi-ladder";
  } else if (
    typeNameLower.includes("excavator") ||
    typeNameLower.includes("forestryexcavator")
  ) {
    return "bi-cone-striped";
  } else if (
    typeNameLower.includes("car") ||
    typeNameLower.includes("pickup")
  ) {
    return "bi-car-front";
  } else if (
    typeNameLower.includes("washer") ||
    typeNameLower.includes("pressure")
  ) {
    return "bi-droplet";
  } else if (
    typeNameLower.includes("ibc") ||
    typeNameLower.includes("liquidtank") ||
    typeNameLower.includes("liquid tank")
  ) {
    return "bi-droplet-fill";
  } else if (
    typeNameLower.includes("pallet") ||
    typeNameLower.includes("bigbag")
  ) {
    return "bi-box";
  } else if (
    typeNameLower.includes("trailer") &&
    typeNameLower.includes("train")
  ) {
    return "bi-train-freight-front";
  }

  // Fallback to general vehicle type icons
  const icons = {
    motorized: "bi-truck",
    tractor: "bi-truck",
    trailer: "bi-box-seam",
    harvester: "bi-scissors",
    cultivator: "bi-gear-wide-connected",
    implement: "bi-wrench",
    unknown: "bi-question-circle",
  };
  return icons[vehicleType] || icons.unknown;
}

export function getFuelBarColor(percentage) {
  if (percentage > 75) return "bg-success";
  if (percentage > 25) return "bg-warning";
  return "bg-danger";
}

export function getDamageBarColor(damagePercentage) {
  if (damagePercentage > 50) return "bg-danger";
  if (damagePercentage > 20) return "bg-warning";
  return "bg-success";
}

/**
 * Pallets, big bags, and liquid bulk containers (IBCs) — tracked as vehicles/placeables in game data.
 * Match typeName, display name, and filename so items are not missed when typeName is "unknown".
 */
export function isStorageItem(vehicle) {
  if (!vehicle || typeof vehicle !== "object") return false;
  const brandLabel =
    vehicle.brand &&
    (typeof vehicle.brand === "string"
      ? vehicle.brand
      : vehicle.brand.name || "");
  const blob = [
    vehicle.typeName,
    vehicle.name,
    vehicle.filename,
    vehicle.vehicleType,
    brandLabel,
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase())
    .join(" ");
  if (!blob.trim()) return false;

  // Real vehicles/tools — not loose consumables on the ground
  if (
    /pallet\s*fork|palletfork/i.test(blob) ||
    /pallet\s*trailer/i.test(blob) ||
    /bale\s+and\s+pallet/i.test(blob)
  ) {
    return false;
  }

  if (
    blob.includes("bigbag") ||
    blob.includes("big_bag") ||
    /\bbig\s+bag\b/.test(blob)
  ) {
    return true;
  }

  if (
    /\bibc\b/.test(blob) ||
    blob.includes("liquidtank") ||
    blob.includes("liquid_tank") ||
    blob.includes("bulkliquid")
  ) {
    return true;
  }

  if (
    blob.includes("pallet") ||
    blob.includes("palette") ||
    blob.includes("pallete")
  ) {
    return true;
  }

  return false;
}

export function getVehicleTypeBadge(vehicleType, typeName = "") {
  const typeNameLower = typeName.toLowerCase();

  // More specific badges based on typeName
  if (
    typeNameLower.includes("locomotive") ||
    typeNameLower.includes("train")
  ) {
    return "bg-primary";
  } else if (typeNameLower.includes("telehandler")) {
    return "bg-warning";
  } else if (
    typeNameLower.includes("excavator") ||
    typeNameLower.includes("forestry")
  ) {
    return "bg-danger";
  } else if (
    typeNameLower.includes("car") ||
    typeNameLower.includes("pickup")
  ) {
    return "bg-info";
  } else if (
    typeNameLower.includes("ibc") ||
    typeNameLower.includes("liquidtank") ||
    typeNameLower.includes("liquid tank")
  ) {
    return "bg-info text-dark";
  } else if (
    typeNameLower.includes("pallet") ||
    typeNameLower.includes("bigbag")
  ) {
    return "bg-light text-dark";
  } else if (
    typeNameLower.includes("washer") ||
    typeNameLower.includes("pressure")
  ) {
    return "bg-info";
  }

  // Fallback to general vehicle type badges
  const badges = {
    motorized: "bg-success",
    tractor: "bg-success",
    trailer: "bg-secondary",
    harvester: "bg-warning",
    cultivator: "bg-primary",
    implement: "bg-secondary",
    unknown: "bg-dark",
  };
  return badges[vehicleType] || badges.unknown;
}

export function toggleVehicleFilters() {
  const panel = document.getElementById("vehicle-filters-panel");
  const button = document.getElementById("vehicle-filter-toggle-btn");

  if (panel && button) {
    const isHidden = panel.classList.contains("d-none");
    if (isHidden) {
      panel.classList.remove("d-none");
      button.innerHTML = `<i class="bi bi-chevron-up"></i> ${t("vehicles.hideFilters")}`;
    } else {
      panel.classList.add("d-none");
      button.innerHTML = `<i class="bi bi-chevron-down"></i> ${t("vehicles.showFilters")}`;
    }
  }
}

export function applyVehicleFilters() {
  const typeFilter =
    document.getElementById("vehicle-type-filter")?.value || "";
  const fuelFilter =
    document.getElementById("vehicle-fuel-filter")?.value || "";
  const statusFilter =
    document.getElementById("vehicle-status-filter")?.value || "";

  // Start by filtering to only show player-owned vehicles (ownerFarmId: 1) and exclude storage items
  let filteredVehicles = [...(this.vehicles || [])].filter(
    (v) =>
      vehicleMatchesActiveFarm(v, this.activeFarmId || 1) &&
      !this.isStorageItem(v)
  );

  // Apply type filter with improved matching
  if (typeFilter) {
    filteredVehicles = filteredVehicles.filter((v) => {
      const vehicleType = v.vehicleType || "unknown";

      // Direct match first
      if (vehicleType === typeFilter) {
        return true;
      }

      // Handle legacy/alternative mappings
      if (typeFilter === "tractor" && vehicleType === "motorized") {
        // Identify tractors within motorized vehicles
        const brandName = resolveVehicleBrandLabel(v.brand);
        const typeName = v.typeName || "";
        return (
          typeName.toLowerCase().includes("tractor") ||
          brandName?.toLowerCase().includes("john deere") ||
          brandName?.toLowerCase().includes("johndeere") ||
          brandName?.toLowerCase().includes("mccormick")
        );
      }

      return false;
    });

    console.log(
      `[Filter] Applied type filter "${typeFilter}", found ${filteredVehicles.length} vehicles`
    );
  }

  // Apply fuel filter
  if (fuelFilter) {
    filteredVehicles = filteredVehicles.filter((v) => {
      // Skip fuel calculations for vehicles that don't use traditional fuel
      const skipFuelTypes = ["highPressureWasher", "High Pressure Washer"];
      if (!v.isMotorized || skipFuelTypes.includes(v.typeName)) {
        return fuelFilter === "empty"; // High pressure washers are considered "empty" for filtering
      }

      if (v.fuelCapacity === 0) return fuelFilter === "empty";
      const fuelPercentage = (v.fuelLevel / v.fuelCapacity) * 100;

      switch (fuelFilter) {
        case "empty":
          return fuelPercentage === 0;
        case "low":
          return fuelPercentage > 0 && fuelPercentage < 25;
        case "medium":
          return fuelPercentage >= 25 && fuelPercentage <= 75;
        case "full":
          return fuelPercentage > 75;
        default:
          return true;
      }
    });
  }

  // Apply status filter
  if (statusFilter) {
    filteredVehicles = filteredVehicles.filter((v) => {
      switch (statusFilter) {
        case "active":
          return v.engineOn || v.speed > 0;
        case "inactive":
          return !v.engineOn && v.speed === 0;
        case "damaged":
          return isVehicleHighWear(v);
        case "needs-repair":
          return isVehicleInNeedOfRepair(v);
        default:
          return true;
      }
    });
  }

  this.renderVehicleCards(filteredVehicles);
}

export function filterVehiclesBySummaryCard(filterType) {
  // Reset all filters first
  document.getElementById("vehicle-type-filter").value = "";
  document.getElementById("vehicle-fuel-filter").value = "";
  document.getElementById("vehicle-status-filter").value = "";

  // Apply the specific filter based on the summary card clicked, excluding storage items
  let filteredVehicles = [...(this.vehicles || [])].filter(
    (v) => !this.isStorageItem(v)
  );

  switch (filterType) {
    case "all":
      // Show all vehicles (no additional filtering needed)
      break;

    case "low-fuel":
      filteredVehicles = filteredVehicles.filter((v) => {
        // Skip fuel calculations for vehicles that don't use traditional fuel
        const skipFuelTypes = ["highPressureWasher", "High Pressure Washer"];
        if (!v.isMotorized || skipFuelTypes.includes(v.typeName))
          return false;

        // Check fuel from multiple sources like in summary cards
        let fuelPercentage = 0;
        if (v.fuelCapacity > 0 && v.fuelLevel > 0) {
          fuelPercentage = (v.fuelLevel / v.fuelCapacity) * 100;
        } else if (v.fillLevels && v.fillLevels["DIESEL"]) {
          const diesel = v.fillLevels["DIESEL"];
          fuelPercentage =
            diesel.capacity > 0 ? (diesel.level / diesel.capacity) * 100 : 0;
        }

        return fuelPercentage < 25;
      });

      // Update the fuel filter dropdown to show what's selected
      document.getElementById("vehicle-fuel-filter").value = "low";
      break;

    case "damaged":
      filteredVehicles = filteredVehicles.filter((v) => isVehicleHighWear(v));
      document.getElementById("vehicle-status-filter").value = "damaged";
      break;

    case "needs-repair":
      filteredVehicles = filteredVehicles.filter((v) =>
        isVehicleInNeedOfRepair(v)
      );
      document.getElementById("vehicle-status-filter").value = "needs-repair";
      break;
  }

  console.log(
    `[SummaryCardFilter] Applied filter "${filterType}", showing ${filteredVehicles.length} vehicles`
  );
  this.renderVehicleCards(filteredVehicles);

  // Scroll to the vehicles grid
  const vehiclesGrid = document.getElementById("vehicles-grid");
  if (vehiclesGrid) {
    vehiclesGrid.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export function setElementText(elementId, text) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = text;
  }
}

export function showVehicleImage(imageUrl, vehicleName, brandName) {
  // Set modal content
  const modalImage = document.getElementById("vehicleModalImage");
  const modalTitle = document.getElementById("vehicleModalTitle");
  const modalInfo = document.getElementById("vehicleModalInfo");

  if (modalImage && modalTitle) {
    modalImage.src = imageUrl;
    modalImage.alt = vehicleName;
    modalTitle.textContent = vehicleName;

    if (modalInfo) {
      modalInfo.innerHTML = `
        <i class="bi bi-info-circle me-1"></i>
        ${
          brandName && brandName !== "Unknown" ? `${brandName} - ` : ""
        }${vehicleName}
      `;
    }
  }

  // Show the modal
  const modal = new bootstrap.Modal(
    document.getElementById("vehicleImageModal")
  );
  modal.show();
}