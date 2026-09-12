// @ts-nocheck
/**
 * Field display clusters: GPS painted-blob identity (merge/extend in-game)
 * plus optional manual groups from Settings. Nearby same-crop parcels stay separate.
 */

function farmlandIdOf(f) {
  const n = Number(f?.farmlandId ?? f?.id);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function quantize8(n) {
  return Math.round(Number(n) / 8) * 8;
}

function collectPts(poly) {
  if (!Array.isArray(poly) || poly.length < 3) return null;
  const out = [];
  for (const pt of poly) {
    const x = Number(pt?.x ?? pt?.[0]);
    const z = Number(pt?.z ?? pt?.[1] ?? pt?.[2]);
    if (Number.isFinite(x) && Number.isFinite(z)) out.push({ x, z });
  }
  return out.length >= 3 ? out : null;
}

/** 2D points for bbox: GPS `outline` first, then i3d polygon / corners. */
function fieldPoints2d(field) {
  return (
    collectPts(field?.outline) ||
    collectPts(field?.polygon) ||
    collectPts(field?.boundary) ||
    collectPts(field?.corners)
  );
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

export function outlineAreaHectares(outline) {
  const pts = collectPts(outline);
  if (!pts) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    sum += pts[i].x * pts[j].z - pts[j].x * pts[i].z;
  }
  return Math.abs(sum) * 0.5 / 10000;
}

/** Shared GPS / worker-menu blob. Same key → one field on cards and stats. */
export function paintedBlobKey(field) {
  const raw = field?.paintedBlobKey;
  if (typeof raw === "string" && raw.length > 3) return raw;
  const box = fieldBBox2d(field);
  if (!box) return "";
  return `b:${quantize8(box.minX)}:${quantize8(box.minZ)}:${quantize8(box.maxX)}:${quantize8(box.maxZ)}`;
}

function samePaintedBlob(a, b) {
  const ka = paintedBlobKey(a);
  const kb = paintedBlobKey(b);
  return Boolean(ka) && ka === kb;
}

function sameFarm(a, b) {
  return Number(a?.ownerFarmId ?? a?.farmId ?? 0) === Number(b?.ownerFarmId ?? b?.farmId ?? 0);
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
 * @param {{ manualGroups?: number[][] }} pref
 * @returns {{ clusterId: string, fields: object[] }[]}
 */
export function buildFieldDisplayClusters(fields, pref) {
  const list = Array.isArray(fields) ? fields.filter(Boolean) : [];
  if (list.length === 0) return [];

  const manualRaw = Array.isArray(pref?.manualGroups) ? pref.manualGroups : [];
  const manual = manualRaw
    .map((g) =>
      [...new Set((g || []).map((x) => parseInt(String(x), 10)).filter((n) => !Number.isNaN(n) && n > 0))]
    )
    .filter((g) => g.length >= 2);

  const uf = new UnionFind(list.length);
  const idxByFarmland = new Map();
  list.forEach((f, i) => {
    const id = farmlandIdOf(f);
    if (id) idxByFarmland.set(id, i);
  });

  // GPS merge/extend: one painted blob is one field card.
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (sameFarm(list[i], list[j]) && samePaintedBlob(list[i], list[j])) {
        uf.union(i, j);
      }
    }
  }

  for (const group of manual) {
    let first = -1;
    for (const fid of group) {
      const i = idxByFarmland.get(fid);
      if (i == null) continue;
      if (first < 0) first = i;
      else uf.union(first, i);
    }
  }

  const roots = new Map();
  for (let i = 0; i < list.length; i++) {
    const r = uf.find(i);
    if (!roots.has(r)) roots.set(r, []);
    roots.get(r).push(list[i]);
  }

  const clusters = [];
  for (const group of roots.values()) {
    const ids = group.map(farmlandIdOf).sort((a, b) => a - b);
    const idSet = new Set(ids);
    let prefix = group.length > 1 ? "p" : "s";
    for (const g of manual) {
      if (g.length >= 2 && g.every((id) => idSet.has(id))) {
        prefix = "m";
        break;
      }
    }
    clusters.push({ clusterId: `${prefix}-${ids.join("-")}`, fields: group });
  }

  return clusters.sort((a, b) => farmlandIdOf(a.fields[0]) - farmlandIdOf(b.fields[0]));
}

function clusterHectares(sorted) {
  const seen = new Set();
  let sum = 0;
  let bestOutlineHa = 0;
  let bestOutline = null;
  for (const f of sorted) {
    const k = paintedBlobKey(f);
    if (k) {
      if (seen.has(k)) continue;
      seen.add(k);
    }
    sum += Number(f?.hectares) || 0;
    if (Array.isArray(f?.outline) && f.outline.length >= 3) {
      const ha = outlineAreaHectares(f.outline);
      if (ha > bestOutlineHa) {
        bestOutlineHa = ha;
        bestOutline = f.outline;
      }
    }
  }
  if (bestOutlineHa > 0.05 && bestOutlineHa >= sum * 0.85) {
    return Math.round(bestOutlineHa * 100) / 100;
  }
  return sum;
}

function pickClusterOutline(sorted) {
  let best = null;
  let bestHa = -1;
  for (const f of sorted) {
    if (!Array.isArray(f?.outline) || f.outline.length < 3) continue;
    const ha = outlineAreaHectares(f.outline);
    if (ha >= bestHa) {
      bestHa = ha;
      best = f.outline;
    }
  }
  return best;
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
  const ha = clusterHectares(sorted);
  const outline = pickClusterOutline(sorted) || rep.outline;
  const blobKey = paintedBlobKey({ ...rep, outline });

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
    outline: outline || rep.outline,
    paintedBlobKey: blobKey || rep.paintedBlobKey,
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
    weedPercent: maxNum("weedPercent"),
    weedAlertThresholdPct: rep.weedAlertThresholdPct ?? sorted[0]?.weedAlertThresholdPct ?? 15,
    moisture: rep.moisture?.enabled ? rep.moisture : sorted.find((f) => f.moisture?.enabled)?.moisture ?? null,
    baleCountOnField: maxNum("baleCountOnField"),
    baleCount: maxNum("baleCount"),
  };
}

export function clusterFieldsForDisplay(fields, pref) {
  return buildFieldDisplayClusters(fields, pref)
    .map((c) => syntheticFieldFromCluster(c))
    .filter(Boolean);
}

function fieldShowsWitheredArable(f) {
  if (!f?.isWithered) return false;
  if (String(f.fruitType || "").toUpperCase() === "GRASS") return false;
  return true;
}
