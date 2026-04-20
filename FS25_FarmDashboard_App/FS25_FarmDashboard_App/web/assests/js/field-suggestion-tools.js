/**
 * Maps offline field-rule actions to implement categories and matches the active farm’s
 * vehicle list (filename / typeName / name heuristics). Best-effort when the game API
 * does not expose formal specialization types.
 *
 * (Does not import `vehicles.js` — that module loads `apiStorage`, which imports `fields.js`.)
 */

import { RULES_ENGINE_FALLBACK_ACTION } from "./rules-engine.js";

function isStorageItemVehicle(v) {
  if (!v || !v.typeName) return false;
  const typeName = String(v.typeName).toLowerCase();
  return (
    typeName.includes("pallet") ||
    typeName.includes("bigbag") ||
    typeName.includes("big bag")
  );
}

/** @typedef {{ id: string, label: string, shopHint: string, patterns: RegExp[] }} ToolRole */

/** @type {ToolRole[]} */
const TOOL_ROLES = [
  {
    id: "cultivator",
    label: "Cultivator / disc harrow",
    shopHint: "a cultivator, disc harrow, or power harrow to work the seedbed",
    patterns: [/cultivat/i, /\bdisc\b/i, /harrow/i, /stubble.?cult/i, /chisel/i, /field.?cult/i],
  },
  {
    id: "plow",
    label: "Plow / deep tillage",
    shopHint: "a plow, reversible plow, or deep cultivator for primary tillage",
    patterns: [/plow/i, /reversible/i, /subsoil/i, /ripper/i, /mouldboard/i],
  },
  {
    id: "mulcher",
    label: "Mulcher / stubble shredder",
    shopHint: "a mulcher or stubble shredder for residue before tillage",
    patterns: [/mulch/i, /shred/i, /stubble.?cutter/i],
  },
  {
    id: "lime_spreader",
    label: "Lime spreader",
    shopHint: "a lime spreader (mounted, trailed, or self-propelled spreader)",
    patterns: [/lime/i, /spread.*lime/i, /bunning/i],
  },
  {
    id: "fertilizer_spreader",
    label: "Fertilizer / manure / slurry",
    shopHint: "a solid fertilizer spreader, slurry tanker, or manure spreader for N/build-up",
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
    label: "Field sprayer",
    shopHint: "a mounted or trailed sprayer for herbicide / liquid applications",
    patterns: [/spray/i, /sprayer/i, /self.?propelled.*spray/i],
  },
  {
    id: "seeder",
    label: "Seeder / planter / drill",
    shopHint: "a seed drill, planter, or direct seeder",
    patterns: [/seed/i, /drill/i, /plant/i, /sow/i, /air.?seeder/i],
  },
  {
    id: "roller",
    label: "Field roller",
    shopHint: "a field roller for seedbed finish / stone knock-down",
    patterns: [/roller/i, /roll\b/i],
  },
  {
    id: "mower",
    label: "Mower / conditioner",
    shopHint: "a mower or mower conditioner for grass / hay",
    patterns: [/mower/i, /conditioner/i, /cutter.?bar/i],
  },
  {
    id: "tedder",
    label: "Tedder",
    shopHint: "a tedder to dry grass windrows for hay",
    patterns: [/tedder/i, /ted\b/i],
  },
  {
    id: "windrower",
    label: "Rake / merger / windrower",
    shopHint: "a rotary rake, merger, or windrower to tidy rows before baling",
    patterns: [/rake/i, /windrow/i, /merger/i, /row.?crop.*head/i],
  },
  {
    id: "baler",
    label: "Baler",
    shopHint: "a round or square baler with the right pickup for straw/grass/hay",
    patterns: [/baler/i, /bale.?wrapper/i, /round.?baler/i, /square.?baler/i],
  },
  {
    id: "wrapper",
    label: "Bale wrapper",
    shopHint: "a bale wrapper for silage (if wrapping wet bales)",
    patterns: [/wrapper/i, /wrap\b/i, /silage.?wrap/i],
  },
  {
    id: "forage_wagon",
    label: "Forage wagon / pickup",
    shopHint: "a forage wagon or pickup system to collect loose straw/grass",
    patterns: [/forage/i, /loading.?wagon/i, /pickup\b/i, /pick.?up/i, /pickup.?header/i],
  },
  {
    id: "harvester",
    label: "Combine harvester",
    shopHint: "a combine harvester with the correct header for this crop",
    patterns: [/combine/i, /harvest/i, /draper/i, /grain.?header/i, /corn.?head/i],
  },
  {
    id: "stone_picker",
    label: "Stone picker / collector",
    shopHint: "a stone picker or collector (or use a heavy roller if that fits your setup)",
    patterns: [/stone/i, /rock.?picker/i, /collector/i],
  },
  {
    id: "weeder",
    label: "Mechanical weeder / hoe",
    shopHint: "a hoe weeder, tined weeder, or cultivator weeder for early-stage weeds",
    patterns: [/weed/i, /hoe\b/i, /inter.?row/i, /mechanical.?weed/i],
  },
  {
    id: "loader",
    label: "Loader / handler / transport",
    shopHint: "a telehandler, wheel loader, front loader, or bale trailer to move bales",
    patterns: [/telehandler/i, /tele.?handler/i, /loader/i, /handler/i, /frontloader/i, /bale.?trail/i, /lowloader/i, /stacker/i],
  },
  {
    id: "soil_scanner",
    label: "Soil scan (Precision Farming)",
    shopHint: "the Precision Farming soil sampler / scanner from the in-game shop (DLC category)",
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

function vehicleMatchesRole(v, role) {
  const h = vehicleHaystack(v);
  if (!h.trim()) return false;
  return role.patterns.some((re) => re.test(h));
}

function roleById(id) {
  return TOOL_ROLES.find((r) => r.id === id) || null;
}

/**
 * Infer which tool categories fit the current rule action (Layer 1 wording from rules-engine).
 * @param {object} field
 * @param {string} action
 * @returns {string[]} role ids (deduped, ordered)
 */
export function inferToolRoleIds(field, action) {
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
  const tn = (v.typeName || "").trim();
  const n = (v.name || "").trim();
  if (tn && n && tn.toLowerCase() !== n.toLowerCase()) return `${tn} — ${n}`;
  return tn || n || "Unnamed equipment";
}

/**
 * @param {object[]} vehicles
 * @param {number} farmId
 * @param {string[]} roleIds
 * @returns {{ owned: { roleId: string, matches: string[] }[], missing: { roleId: string, label: string, shopHint: string }[] }}
 */
export function matchToolRolesToFleet(vehicles, farmId, roleIds) {
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
      owned.push({ roleId: id, matches: [...new Set(matches)].slice(0, 3) });
    } else {
      missing.push({ roleId: id, label: meta.label, shopHint: meta.shopHint });
    }
  }

  return { owned, missing };
}

/**
 * Plain-text lines for embedding in HTML (caller escapes).
 * @param {object[]} vehicles
 * @param {number} farmId
 * @param {string} action
 * @param {object} [field]
 * @returns {string[]}
 */
export function buildToolGuidanceLines(vehicles, farmId, action, field) {
  const roleIds = inferToolRoleIds(field || {}, action);
  if (roleIds.length === 0) return [];

  const { owned, missing } = matchToolRolesToFleet(vehicles, farmId, roleIds);
  const lines = [];

  if (owned.length) {
    const typeLabels = owned
      .map((o) => {
        const meta = roleById(o.roleId);
        return meta ? meta.label : o.roleId;
      })
      .filter(Boolean);
    lines.push(`From your fleet: ${[...new Set(typeLabels)].join(", ")}`);
  }

  if (missing.length) {
    const shopParts = missing.map((m) => `${m.label} — shop if you need this type for the job`);
    lines.push(`Not in your fleet: ${shopParts.join(" · ")}`);
  }

  if (!lines.length) {
    lines.push(
      "Typical tools: match the job to the right shop category (implements / harvesters / spreaders) for this field state."
    );
  }

  return lines;
}
