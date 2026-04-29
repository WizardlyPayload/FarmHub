/**
 * Field display clusters: manual groups (settings) + optional auto-merge by bbox + same crop.
 */

function farmlandIdOf(f) {
  const n = Number(f?.farmlandId ?? f?.id);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function fruitKey(f) {
  return String(f?.fruitType || "").toUpperCase() || "UNKNOWN";
}

function growthStateNum(f) {
  return Number(f?.growthState ?? 0) || 0;
}

/** 2D points for bbox: {x,z} or [x,z] / [x,?,z]. */
function fieldPoints2d(field) {
  const poly = field?.polygon || field?.boundary || field?.corners;
  if (!Array.isArray(poly) || poly.length < 3) return null;
  const out = [];
  for (const pt of poly) {
    const x = Number(pt?.x ?? pt?.[0]);
    const z = Number(pt?.z ?? pt?.[1] ?? pt?.[2]);
    if (Number.isFinite(x) && Number.isFinite(z)) out.push({ x, z });
  }
  return out.length >= 3 ? out : null;
}

export function fieldBBox2d(field) {
  const pts = fieldPoints2d(field);
  if (!pts) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return { minX, maxX, minZ, maxZ };
}

function bboxesTouching(b1, b2, pad) {
  if (!b1 || !b2) return false;
  const gapX = Math.max(b1.minX, b2.minX) - Math.min(b1.maxX, b2.maxX);
  const gapZ = Math.max(b1.minZ, b2.minZ) - Math.min(b1.maxZ, b2.maxZ);
  return gapX <= pad && gapZ <= pad;
}

function sameFarm(a, b) {
  return Number(a?.ownerFarmId ?? a?.farmId ?? 0) === Number(b?.ownerFarmId ?? b?.farmId ?? 0);
}

function canAutoPair(a, b, pad) {
  if (!sameFarm(a, b)) return false;
  if (fruitKey(a) !== fruitKey(b)) return false;
  if (Math.abs(growthStateNum(a) - growthStateNum(b)) > 1) return false;
  const ba = fieldBBox2d(a);
  const bb = fieldBBox2d(b);
  return bboxesTouching(ba, bb, pad);
}

class UnionFind {
  constructor(n) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(i) {
    if (this.p[i] !== i) this.p[i] = this.find(this.p[i]);
    return this.p[i];
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.p[rb] = ra;
  }
}

/**
 * @param {object[]} fields
 * @param {{ autoMerge?: boolean, manualGroups?: number[][] }} pref
 * @returns {{ clusterId: string, fields: object[] }[]}
 */
export function buildFieldDisplayClusters(fields, pref) {
  const list = Array.isArray(fields) ? fields.filter(Boolean) : [];
  if (list.length === 0) return [];

  const autoMerge = pref?.autoMerge !== false;
  const manualRaw = Array.isArray(pref?.manualGroups) ? pref.manualGroups : [];
  const manual = manualRaw
    .map((g) =>
      [...new Set((g || []).map((x) => parseInt(String(x), 10)).filter((n) => !Number.isNaN(n) && n > 0))]
    )
    .filter((g) => g.length >= 2);

  const byId = new Map();
  for (const f of list) {
    const id = farmlandIdOf(f);
    if (id) byId.set(id, f);
  }

  const consumed = new Set();
  const clusters = [];

  for (const group of manual) {
    const members = [];
    for (const fid of group) {
      const row = byId.get(fid);
      if (row) {
        members.push(row);
        consumed.add(fid);
      }
    }
    if (members.length >= 2) {
      const ids = members.map(farmlandIdOf).sort((a, b) => a - b);
      clusters.push({ clusterId: `m-${ids.join("-")}`, fields: members });
    }
  }

  const pool = list.filter((f) => !consumed.has(farmlandIdOf(f)));
  if (pool.length === 0) {
    return clusters.sort((a, b) => farmlandIdOf(a.fields[0]) - farmlandIdOf(b.fields[0]));
  }

  if (!autoMerge) {
    for (const f of pool) {
      clusters.push({ clusterId: `s-${farmlandIdOf(f)}`, fields: [f] });
    }
    return clusters.sort((a, b) => farmlandIdOf(a.fields[0]) - farmlandIdOf(b.fields[0]));
  }

  const PAD = 12;
  const idx = new Map();
  pool.forEach((f, i) => idx.set(farmlandIdOf(f), i));
  const uf = new UnionFind(pool.length);
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      if (canAutoPair(pool[i], pool[j], PAD)) uf.union(i, j);
    }
  }
  const roots = new Map();
  for (let i = 0; i < pool.length; i++) {
    const r = uf.find(i);
    if (!roots.has(r)) roots.set(r, []);
    roots.get(r).push(pool[i]);
  }
  for (const group of roots.values()) {
    const ids = group.map(farmlandIdOf).sort((a, b) => a - b);
    const prefix = group.length > 1 ? "a" : "s";
    clusters.push({ clusterId: `${prefix}-${ids.join("-")}`, fields: group });
  }

  return clusters.sort((a, b) => farmlandIdOf(a.fields[0]) - farmlandIdOf(b.fields[0]));
}

/**
 * One synthetic field row for cards (merged display).
 * @param {{ fields: object[] }} cluster
 */
export function syntheticFieldFromCluster(cluster) {
  const fs = cluster.fields.filter(Boolean);
  if (fs.length === 0) return null;
  const sorted = fs.slice().sort((a, b) => farmlandIdOf(a) - farmlandIdOf(b));
  const rep = sorted[0];
  const ids = sorted.map(farmlandIdOf).filter((n) => n > 0);
  const idStr = ids.join(" · ");
  const ha = sorted.reduce((s, f) => s + (Number(f?.hectares) || 0), 0);

  const anyBool = (k) => sorted.some((f) => !!f[k]);
  const maxNum = (k) => Math.max(0, ...sorted.map((f) => Number(f[k]) || 0));

  return {
    ...rep,
    _displayClusterId: cluster.clusterId,
    _clusterFieldIds: ids,
    _clusterFields: sorted,
    farmlandId: ids[0] ?? rep.farmlandId,
    id: ids[0] ?? rep.id,
    name: fs.length > 1 ? `Fields ${idStr}` : rep.name || `Field ${ids[0]}`,
    hectares: ha > 0 ? ha : rep.hectares,
    needsWork: anyBool("needsWork"),
    needsRolling: anyBool("needsRolling"),
    needsWeeding: anyBool("needsWeeding"),
    needsLime: anyBool("needsLime"),
    needsPlowing: sorted.some((f) => f.needsPlowing !== false && Number(f.plowLevel ?? 0) < 1),
    harvestReady: anyBool("harvestReady"),
    isWithered: sorted.some((f) => fieldShowsWitheredArable(f)),
    isHarvested: anyBool("isHarvested"),
    isMulched: anyBool("isMulched"),
    isPrecisionFarming: sorted.some((f) => !!f.isPrecisionFarming),
    isScanned: sorted.some((f) => !!f.isScanned),
    growthState: maxNum("growthState"),
    maxGrowthState: Math.max(...sorted.map((f) => Number(f.maxGrowthState) || 0), 1),
    stoneLevel: maxNum("stoneLevel"),
    weedLevel: maxNum("weedLevel"),
    baleCountOnField: maxNum("baleCountOnField"),
    baleCount: maxNum("baleCount"),
  };
}

function fieldShowsWitheredArable(f) {
  if (!f?.isWithered) return false;
  if (String(f.fruitType || "").toUpperCase() === "GRASS") return false;
  return true;
}
