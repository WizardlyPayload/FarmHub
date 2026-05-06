/**
 * Maps offline field-rule actions to implement categories and matches the active farm’s
 * vehicle list (filename / typeName / name heuristics). Best-effort when the game API
 * does not expose formal specialization types.
 *
 * (Does not import `vehicles.js` — that module loads `apiStorage`, which imports `fields.js`.)
 */

import { RULES_ENGINE_FALLBACK_ACTION } from "./rules-engine.js";
import { getBaseGameLabelsForRole } from "./base-game-tool-catalog.js";
import { t } from "./i18n/i18n.js";

/** Stable hash → [0, modulo) for varied picks without RNG flicker per field. */
function hashPickIndex(seedStr, modulo) {
  if (modulo <= 0) return 0;
  let h = 5381;
  const s = String(seedStr || "");
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return Math.abs(h) % modulo;
}

function suggestionVarietySeed(field, roleId, actionKey, suffix = "") {
  const fid = field?.farmlandId ?? field?.id ?? "";
  return `${fid}|${roleId}|${actionKey || ""}|${suffix}`;
}

/**
 * Stable map from rules-engine action keys to recommended tool roles.
 * Avoids relying on substring matches against translated action text.
 */
const ACTION_KEY_TO_ROLES = {
  "rules.action.cultivateReseed": ["cultivator", "seeder"],
  "rules.action.combineHarvest": ["harvester", "tractor", "grain_trailer"],
  "rules.action.mowGrass": ["mower", "forage_wagon", "baler", "wrapper"],
  "rules.action.runSoilScan": ["soil_scanner"],
  "rules.action.mulchStubble": ["mulcher"],
  "rules.action.ploughBeforeNextCrop": ["plow", "cultivator", "seeder"],
  "rules.action.ploughThenSeedbed": ["plow", "cultivator", "seeder"],
  "rules.action.ploughDeepCultivate": ["plow"],
  "rules.action.directDrill": ["seeder"],
  "rules.action.cultivateMulchedDrill": ["cultivator", "seeder"],
  "rules.action.cultivateStubbleDrill": ["cultivator", "seeder"],
  "rules.action.spreadLimeBeforeSeed": ["lime_spreader"],
  "rules.action.spreadLimeEmerged": ["lime_spreader"],
  "rules.action.limePastureMap": ["lime_spreader"],
  "rules.action.checkPasturePH": ["lime_spreader"],
  "rules.action.cultivateMulch": ["cultivator"],
  "rules.action.buildSoilN": ["fertilizer_spreader"],
  "rules.action.fertilizeForDrilling": ["fertilizer_spreader"],
  "rules.action.fertilizeStep": ["fertilizer_spreader"],
  "rules.action.addNTarget": ["fertilizer_spreader"],
  "rules.action.topUpNitrogen": ["fertilizer_spreader"],
  "rules.action.sowPlant": ["seeder"],
  "rules.action.sowSeedbed": ["seeder"],
  "rules.action.rollFirstStage": ["roller"],
  "rules.action.optionalOrganicFirst": ["fertilizer_spreader"],
  "rules.action.weedMechanically": ["weeder"],
  "rules.action.sprayHerbicide": ["sprayer"],
  "rules.action.tedDryHay": ["tedder", "baler", "wrapper"],
  "rules.action.finishGrass": ["tedder", "windrower", "baler", "wrapper"],
  "rules.action.tedderOrBale": ["tedder", "baler", "wrapper"],
  "rules.action.baleStrawForage": ["baler", "forage_wagon", "windrower"],
  "rules.action.baleHay": ["baler", "forage_wagon", "windrower"],
  "rules.action.baleStrawWagon": ["baler", "forage_wagon", "windrower"],
  "rules.action.clearAllWindrows": ["baler", "forage_wagon", "windrower", "tedder"],
  "rules.action.clearStrawGrassWindrows": ["baler", "forage_wagon", "windrower", "tedder"],
  "rules.action.clearStrawHay": ["baler", "forage_wagon", "windrower", "tedder"],
  "rules.action.clearGrassHay": ["baler", "forage_wagon", "windrower", "tedder"],
  "rules.action.clearLooseForage": ["baler", "forage_wagon", "windrower", "tedder"],
  "rules.action.clearStrawGrassOrHay": ["baler", "forage_wagon", "windrower", "tedder"],
  "rules.action.pickupSwath": ["forage_wagon", "harvester", "baler"],
  "rules.action.clearSwath": ["baler", "forage_wagon"],
  "rules.action.moveOneBale": ["loader"],
  "rules.action.moveBales": ["loader"],
  "rules.action.pickStones": ["stone_picker", "roller"],
  "rules.action.finishFlaggedSoilWork": [
    "cultivator",
    "lime_spreader",
    "fertilizer_spreader",
    "sprayer",
    "plow",
    "roller",
  ],
  "rules.action.prepareDrill": ["cultivator", "plow", "seeder"],
  "rules.action.fallback": [],
  "rules.monitorTowardHarvest": [],
};

function isStorageItemVehicle(v) {
  if (!v || !v.typeName) return false;
  const typeName = String(v.typeName).toLowerCase();
  return (
    typeName.includes("pallet") ||
    typeName.includes("bigbag") ||
    typeName.includes("big bag")
  );
}

/** @typedef {{ id: string, labelKey: string, patterns: RegExp[] }} ToolRole */

/** @type {ToolRole[]} */
const TOOL_ROLES = [
  {
    id: "cultivator",
    labelKey: "tools.role.cultivator",
    patterns: [/cultivat/i, /\bdisc\b/i, /harrow/i, /stubble.?cult/i, /chisel/i, /field.?cult/i],
  },
  {
    id: "plow",
    labelKey: "tools.role.plow",
    patterns: [/plow/i, /reversible/i, /subsoil/i, /ripper/i, /mouldboard/i],
  },
  {
    id: "mulcher",
    labelKey: "tools.role.mulcher",
    patterns: [/mulch/i, /shred/i, /stubble.?cutter/i],
  },
  {
    id: "lime_spreader",
    labelKey: "tools.role.limeSpreader",
    patterns: [/lime/i, /spread.*lime/i, /bunning/i],
  },
  {
    id: "fertilizer_spreader",
    labelKey: "tools.role.fertilizerSpreader",
    patterns: [
      /fertil/i,
      /slurry/i,
      /manure/i,
      /tanker/i,
      /inject/i,
      /solid.*spread/i,
      /self.?propelled.*nutri/i,
    ],
  },
  {
    id: "sprayer",
    labelKey: "tools.role.sprayer",
    patterns: [/spray/i, /sprayer/i, /self.?propelled.*spray/i],
  },
  {
    id: "seeder",
    labelKey: "tools.role.seeder",
    patterns: [/seed/i, /drill/i, /plant/i, /sow/i, /air.?seeder/i],
  },
  {
    id: "roller",
    labelKey: "tools.role.roller",
    patterns: [/roller/i, /roll\b/i],
  },
  {
    id: "mower",
    labelKey: "tools.role.mower",
    patterns: [/mower/i, /conditioner/i, /cutter.?bar/i],
  },
  {
    id: "tedder",
    labelKey: "tools.role.tedder",
    patterns: [/tedder/i, /ted\b/i],
  },
  {
    id: "windrower",
    labelKey: "tools.role.windrower",
    patterns: [/rake/i, /windrow/i, /merger/i, /row.?crop.*head/i],
  },
  {
    id: "baler",
    labelKey: "tools.role.baler",
    patterns: [/baler/i, /bale.?wrapper/i, /round.?baler/i, /square.?baler/i],
  },
  {
    id: "wrapper",
    labelKey: "tools.role.wrapper",
    patterns: [/wrapper/i, /wrap\b/i, /silage.?wrap/i],
  },
  {
    id: "forage_wagon",
    labelKey: "tools.role.forageWagon",
    patterns: [/forage/i, /loading.?wagon/i, /pickup\b/i, /pick.?up/i, /pickup.?header/i],
  },
  {
    id: "harvester",
    labelKey: "tools.role.harvester",
    patterns: [/combine/i, /harvest/i, /draper/i, /grain.?header/i, /corn.?head/i],
  },
  {
    id: "tractor",
    labelKey: "tools.role.tractor",
    patterns: [/tractor/i, /\bmt\d/i],
  },
  {
    id: "grain_trailer",
    labelKey: "tools.role.grainTrailer",
    patterns: [/trailer/i, /auger/i, /chaser/i, /cart\b/i, /tipper/i, /semi\b/i, /tandem/i],
  },
  {
    id: "stone_picker",
    labelKey: "tools.role.stonePicker",
    patterns: [/stone/i, /rock.?picker/i, /collector/i],
  },
  {
    id: "weeder",
    labelKey: "tools.role.weeder",
    patterns: [/weed/i, /hoe\b/i, /inter.?row/i, /mechanical.?weed/i],
  },
  {
    id: "loader",
    labelKey: "tools.role.loader",
    patterns: [/telehandler/i, /tele.?handler/i, /loader/i, /handler/i, /frontloader/i, /bale.?trail/i, /lowloader/i, /stacker/i],
  },
  {
    id: "soil_scanner",
    labelKey: "tools.role.soilScanner",
    patterns: [/soil.?scan/i, /sampler/i, /precision.?farm/i, /isaria/i, /nutrient.?sensor/i],
  },
];

function vehicleHaystack(v) {
  const brand =
    v && typeof v.brand === "object"
      ? `${v.brand.title || ""} ${v.brand.name || ""}`
      : String(v?.brand || "");
  return [
    v?.filename,
    v?.name,
    v?.typeName,
    v?.vehicleType,
    brand,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function vehicleHasLimeFillUnit(v) {
  const fl = v?.fillLevels;
  if (!fl || typeof fl !== "object") return false;
  return Object.keys(fl).some((k) => String(k).toUpperCase() === "LIME");
}

function isDedicatedCombine(v) {
  const h = vehicleHaystack(v);
  return /combine|draper|grain.?header|corn.?head|self.?propelled.?harvest/i.test(h);
}

function vehicleMatchesRole(v, role) {
  const h = vehicleHaystack(v);
  if (!h.trim()) return false;
  if (role.id === "tractor") {
    if (isDedicatedCombine(v)) return false;
    if (/forage harvester|potato harvester|beet harvester|sugarbeet harvester/i.test(h)) return false;
    return role.patterns.some((re) => re.test(h));
  }
  if (role.id === "grain_trailer") {
    if (/forage.?wagon|loading.?wagon|baler|pickup\b|header.?cart/i.test(h)) return false;
    return role.patterns.some((re) => re.test(h));
  }
  if (role.id === "lime_spreader") {
    if (vehicleHasLimeFillUnit(v)) return true;
  }
  return role.patterns.some((re) => re.test(h));
}

function roleById(id) {
  return TOOL_ROLES.find((r) => r.id === id) || null;
}

/**
 * Infer which tool categories fit the current rule action (Layer 1 wording from rules-engine).
 * @param {object} field
 * @param {string} action — the (possibly localized) action text
 * @param {string} [actionKey] — stable i18n key from the rules engine (preferred when present)
 * @returns {string[]} role ids (deduped, ordered)
 */
export function inferToolRoleIds(field, action, actionKey) {
  if (actionKey && Object.prototype.hasOwnProperty.call(ACTION_KEY_TO_ROLES, actionKey)) {
    const baseRoles = ACTION_KEY_TO_ROLES[actionKey].slice();
    if (field?.needsRolling && !baseRoles.includes("roller")) baseRoles.push("roller");
    if (
      field?.needsWeeding &&
      (field.growthState || 0) <= 2 &&
      !baseRoles.includes("weeder")
    ) {
      baseRoles.push("weeder");
    }
    return baseRoles;
  }

  const a = String(action || "").toLowerCase();
  const roles = [];
  const push = (id) => {
    if (!roles.includes(id)) roles.push(id);
  };

  if (!a || a === String(RULES_ENGINE_FALLBACK_ACTION).toLowerCase()) {
    return [];
  }

  if (a.includes("start over") || a.includes("re-seed")) {
    push("cultivator");
    push("seeder");
    return roles;
  }
  if (a.includes("combine-harvest") || (a.includes("combine") && a.includes("harvest"))) {
    push("harvester");
    push("tractor");
    push("grain_trailer");
    return roles;
  }
  if (a.includes("mow") || a.includes("grass is ready")) {
    push("mower");
    push("forage_wagon");
    push("baler");
    push("wrapper");
    return roles;
  }
  if (a.includes("soil scan")) {
    push("soil_scanner");
    return roles;
  }
  if (a.includes("mulch stubble")) {
    push("mulcher");
    return roles;
  }
  if (a.includes("primary tillage before") || a.includes("plough or deep-cultivate, then finish")) {
    push("plow");
    push("cultivator");
    push("seeder");
    return roles;
  }
  if (a.includes("no-till") || a.includes("direct-drill")) {
    push("seeder");
    return roles;
  }
  if (a.includes("cultivate mulched stubble") || a.includes("cultivate stubble")) {
    push("cultivator");
    push("seeder");
    return roles;
  }
  if (a.includes("plough") || a.includes("plow") || a.includes("deep-cultivate")) {
    push("plow");
    return roles;
  }
  if (a.includes("spread lime") || a.includes("lime pasture") || a.includes("pasture ph")) {
    push("lime_spreader");
    return roles;
  }
  if (a.includes("cultivate to work in mulched")) {
    push("cultivator");
    return roles;
  }
  if (a.includes("build soil n") || (a.includes("fertilize") && (a.includes("spray") || a.includes("nutrient")))) {
    push("fertilizer_spreader");
    return roles;
  }
  if (a.includes("sow") || a.includes("plant your next") || a.includes("no-till drill")) {
    push("seeder");
    return roles;
  }
  if (a.includes("work the stubble")) {
    push("mulcher");
    push("cultivator");
    push("plow");
    push("seeder");
    return roles;
  }
  if (a.includes("roll") && a.includes("growth")) {
    push("roller");
    return roles;
  }
  if (a.includes("weed mechanically")) {
    push("weeder");
    return roles;
  }
  if (a.includes("herbicide") || (a.includes("spray") && a.includes("weed"))) {
    push("sprayer");
    return roles;
  }
  if (a.includes("kg n/ha") || a.includes("nitrogen") || a.includes("top up")) {
    push("fertilizer_spreader");
    return roles;
  }
  if (a.includes("tedder") || (a.includes("ted") && a.includes("hay"))) {
    push("tedder");
    push("baler");
    push("wrapper");
    return roles;
  }
  if (a.includes("finish grass") || (a.includes("merge") && a.includes("bale"))) {
    push("tedder");
    push("windrower");
    push("baler");
    push("wrapper");
    return roles;
  }
  if (a.includes("bale") && (a.includes("straw") || a.includes("hay") || a.includes("windrow") || a.includes("forage"))) {
    push("baler");
    push("forage_wagon");
    push("windrower");
    return roles;
  }
  if (
    a.includes("windrow") ||
    a.includes("loose straw") ||
    a.includes("loose forage") ||
    a.includes("swath")
  ) {
    push("baler");
    push("forage_wagon");
    push("windrower");
    push("tedder");
    return roles;
  }
  if (a.includes("pick up") && a.includes("swath")) {
    push("forage_wagon");
    push("harvester");
    push("baler");
    return roles;
  }
  if (a.includes("clear the swath") || a.includes("baler or forage")) {
    push("baler");
    push("forage_wagon");
    return roles;
  }
  if (a.includes("move") && a.includes("bale")) {
    push("loader");
    return roles;
  }
  if (a.includes("pick stones") || a.includes("bury them")) {
    push("stone_picker");
    push("roller");
    return roles;
  }
  if (a.includes("finish flagged soil work")) {
    push("cultivator");
    push("lime_spreader");
    push("fertilizer_spreader");
    push("sprayer");
    push("plow");
    push("roller");
    return roles;
  }
  if (a.includes("prepare soil") || a.includes("drill or plant")) {
    push("cultivator");
    push("plow");
    push("seeder");
    return roles;
  }
  if (a.includes("tend ") && a.includes("harvest-ready")) {
    push("roller");
    push("sprayer");
    push("weeder");
    push("fertilizer_spreader");
    return roles;
  }
  if (a.includes("monitor ") && a.includes("toward harvest")) {
    return [];
  }

  if (field?.needsRolling) {
    push("roller");
  }
  if (field?.needsWeeding && (field.growthState || 0) <= 2) {
    push("weeder");
  }

  return roles;
}

function displayNameForVehicle(v) {
  const bo = v && typeof v.brand === "object" ? v.brand : null;
  const brand = bo
    ? `${String(bo.title || "").trim()} ${String(bo.name || "").trim()}`.trim()
    : String(v?.brand || "").trim();
  const tn = (v.typeName || "").trim();
  const n = (v.name || "").trim();
  const model =
    tn && n && tn.toLowerCase() !== n.toLowerCase() ? `${tn} — ${n}` : tn || n || "Unnamed equipment";
  if (brand) return `${brand} · ${model}`;
  return model;
}

function pickPrimaryMatch(matches) {
  const u = [...new Set(matches)].filter(Boolean).sort((x, y) => x.localeCompare(y));
  return u[0] || "";
}

/**
 * Among similarly good fleet matches, pick one deterministically so different fields
 * don’t all show the same tractor/implement name.
 */
function pickVariedOwnedVehicle(candidates, field, roleId, actionKey) {
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0].score;
  let pool = candidates.filter((c) => c.score >= best - 0.55);
  if (pool.length < 2) {
    pool = candidates.slice(0, Math.min(6, candidates.length));
  }
  const idx = hashPickIndex(suggestionVarietySeed(field, roleId, actionKey, "fleet"), pool.length);
  return pool[idx];
}

function estimateWorkingWidthMeters(haystack, modelName = "") {
  const h = `${String(haystack || "")} ${String(modelName || "")}`.toLowerCase();
  const m = h.match(/(\d+(?:\.\d+)?)\s?m\b/);
  if (m) return Number(m[1]);
  const mm = h.match(/\b(\d{4})\b/);
  if (mm) {
    const raw = Number(mm[1]);
    if (raw >= 1200 && raw <= 18000) return raw / 1000;
  }
  return null;
}

function targetWidthByFieldSize(field) {
  const ha = Number(field?.hectares ?? 0);
  if (!Number.isFinite(ha) || ha <= 0) return 5;
  if (ha < 2) return 2.5;
  if (ha < 8) return 4.5;
  if (ha < 20) return 6.5;
  return 9;
}

function widthFitScore(width, target) {
  if (!Number.isFinite(width)) return 0.35;
  const diff = Math.abs(width - target);
  return Math.max(0, 1 - diff / Math.max(2, target));
}

function scoreOwnedVehicleForRole(v, role, field) {
  const hay = vehicleHaystack(v);
  const width = estimateWorkingWidthMeters(hay, v?.typeName || v?.name || "");
  const target = targetWidthByFieldSize(field);
  let score = 1 + widthFitScore(width, target) * 4;
  if (vehicleHasLimeFillUnit(v) && role.id === "lime_spreader") score += 2;
  if (/self.?propelled/i.test(hay)) score += 0.5;
  return { score, width };
}

function buildShopCatalog() {
  if (typeof window === "undefined") return [];
  const consumableRe =
    /bigbag|big bag|pallet|tank\b|barrel|box|bottle|bale.?twine|bale.?net|seed(s)?\b|fertili[sz]er\b|lime\b|food\b|oil\b|clothes|cheese|milk|cake|flour|furniture|boards|cement|carton/i;
  const implementHintRe =
    /plow|plough|cultivat|disc|harrow|seeder|planter|drill|sprayer|spreader|roller|mower|tedder|rake|windrow|baler|wrapper|wagon|trailer|auger|cart|weeder|hoe|scanner|combine|harvester|loader|telehandler|tractor/i;
  const files = Array.isArray(window.__farmdashShopImageFilenames)
    ? window.__farmdashShopImageFilenames
    : [];
  return files
    .map((f) => {
      const base = String(f || "")
        .replace(/\.png$/i, "")
        .replace(/^.*__/, "")
        .replace(/^vehicles?_?/, "")
        .replace(/^store_?/, "")
        .replace(/_/g, " ")
        .trim();
      if (!base) return null;
      if (consumableRe.test(base)) return null;
      if (!implementHintRe.test(base)) return null;
      return { label: base, haystack: base.toLowerCase() };
    })
    .filter(Boolean);
}

/**
 * Merge scanned shop PNG names with the base-game label table; dedupe; score by working width;
 * pick one row with deterministic variety so the same lime spreader isn’t always chosen.
 */
function pickShopExampleForRole(meta, roleId, field, actionKey) {
  if (!meta) return null;
  const target = targetWidthByFieldSize(field);
  const fromFiles = buildShopCatalog()
    .filter((item) => vehicleMatchesRole({ name: item.label, typeName: item.label }, meta))
    .map((item) => {
      const w = estimateWorkingWidthMeters(item.haystack, item.label);
      return {
        label: item.label,
        haystack: item.haystack,
        score: widthFitScore(w, target),
        source: "scan",
      };
    });

  const baseLabels = getBaseGameLabelsForRole(roleId);
  const fromBase = baseLabels.map((label) => ({
    label,
    haystack: label.toLowerCase(),
    score: 0.42 + widthFitScore(estimateWorkingWidthMeters(label.toLowerCase(), label), target) * 0.25,
    source: "catalog",
  }));

  const seen = new Set();
  const merged = [];
  for (const row of [...fromFiles, ...fromBase]) {
    const key = String(row.label || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }

  if (!merged.length) return null;
  merged.sort((a, b) => b.score - a.score);
  const best = merged[0].score;
  let pool = merged.filter((r) => r.score >= best - 0.35);
  if (pool.length < 2) {
    pool = merged.slice(0, Math.min(12, merged.length));
  }
  const idx = hashPickIndex(suggestionVarietySeed(field, roleId, actionKey, "shop"), pool.length);
  return pool[idx];
}

/**
 * @param {object[]} vehicles
 * @param {number} farmId
 * @param {string[]} roleIds
 * @param {object} [field]
 * @param {string} [actionKey]
 * @returns {{ owned: { roleId: string, matches: string[] }[], missing: { roleId: string, labelKey: string }[] }}
 */
export function matchToolRolesToFleet(vehicles, farmId, roleIds, field, actionKey) {
  const fid = Number(farmId) || 1;
  const list = Array.isArray(vehicles) ? vehicles : [];
  const farmVehicles = list.filter(
    (v) =>
      v &&
      Number(v.ownerFarmId ?? v.farmId ?? 0) === fid &&
      !isStorageItemVehicle(v) &&
      String(v.propertyState || "OWNED").toUpperCase() !== "SOLD"
  );

  const owned = [];
  const missing = [];

  for (const id of roleIds) {
    const meta = roleById(id);
    if (!meta) continue;
    const matches = [];
    for (const v of farmVehicles) {
      if (vehicleMatchesRole(v, meta)) {
        matches.push(displayNameForVehicle(v));
      }
    }
    if (matches.length) {
      const scored = farmVehicles
        .filter((v) => vehicleMatchesRole(v, meta))
        .map((v) => ({ v, ...scoreOwnedVehicleForRole(v, meta, field) }));
      const picked = pickVariedOwnedVehicle(scored, field, id, actionKey);
      if (picked && picked.v) {
        owned.push({ roleId: id, matches: [displayNameForVehicle(picked.v)] });
      } else {
        owned.push({ roleId: id, matches: [pickPrimaryMatch(matches)] });
      }
    } else {
      missing.push({ roleId: id, labelKey: meta.labelKey });
    }
  }

  return { owned, missing };
}

/**
 * Plain-text lines for inlining into HTML (caller escapes).
 * @param {object[]} vehicles
 * @param {number} farmId
 * @param {string} action
 * @param {object} [field]
 * @param {string} [actionKey] — stable i18n key for the action; preferred over text matching
 * @returns {string[]}
 */
export function buildToolGuidanceLines(vehicles, farmId, action, field, actionKey) {
  const roleIds = inferToolRoleIds(field || {}, action, actionKey);
  if (roleIds.length === 0) return [];

  const { owned, missing } = matchToolRolesToFleet(vehicles, farmId, roleIds, field, actionKey);
  const lines = [];

  if (owned.length) {
    const first = owned[0];
    const meta = roleById(first.roleId);
    const label = meta ? t(meta.labelKey) : first.roleId;
    const pick = first.matches && first.matches[0] ? first.matches[0] : "";
    lines.push(`${t("tools.useFromYourFleet")}: ${label}${pick ? `: ${pick}` : ""}`);
  }

  /** Shop hint only when a role is missing from the fleet, or when nothing matched (same as before, avoids duplicating fleet + shop for the same role). */
  const shopRoleId =
    missing.length > 0 ? missing[0].roleId : owned.length === 0 ? roleIds[0] : null;
  if (shopRoleId) {
    const meta = roleById(shopRoleId);
    const roleLabel = meta ? t(meta.labelKey) : shopRoleId;
    const shopPick = pickShopExampleForRole(meta, shopRoleId, field, actionKey);
    if (shopPick && shopPick.label) {
      lines.push(`${t("tools.buyLeaseSuggestion")}: ${roleLabel}: ${shopPick.label}`);
    }
  }

  if (!lines.length) {
    lines.push(t("tools.typicalToolsFallback"));
  }

  return lines;
}
