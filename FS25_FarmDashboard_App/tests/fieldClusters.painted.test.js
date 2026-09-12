/**
 * GPS painted-blob clustering: merged/extended fields share one card and one area.
 */
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

function outlineAreaHectares(outline) {
  const pts = collectPts(outline);
  if (!pts) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    sum += pts[i].x * pts[j].z - pts[j].x * pts[i].z;
  }
  return Math.abs(sum) * 0.5 / 10000;
}

function paintedBlobKey(field) {
  if (typeof field?.paintedBlobKey === "string" && field.paintedBlobKey.length > 3) {
    return field.paintedBlobKey;
  }
  return "";
}

function clusterHectares(sorted) {
  const seen = new Set();
  let sum = 0;
  let bestOutlineHa = 0;
  for (const f of sorted) {
    const k = paintedBlobKey(f);
    if (k) {
      if (seen.has(k)) continue;
      seen.add(k);
    }
    sum += Number(f?.hectares) || 0;
    if (Array.isArray(f?.outline) && f.outline.length >= 3) {
      const ha = outlineAreaHectares(f.outline);
      if (ha > bestOutlineHa) bestOutlineHa = ha;
    }
  }
  if (bestOutlineHa > 0.05 && bestOutlineHa >= sum * 0.85) {
    return Math.round(bestOutlineHa * 100) / 100;
  }
  return sum;
}

describe("painted field blobs", () => {
  test("two original parcels on one GPS blob count area once from the outline", () => {
    const blob = "b:0:0:200:500";
    const outline = [
      [0, 0],
      [200, 0],
      [200, 500],
      [0, 500],
    ];
    const a = { farmlandId: 12, hectares: 5, paintedBlobKey: blob, outline };
    const b = { farmlandId: 13, hectares: 5, paintedBlobKey: blob, outline };
    expect(clusterHectares([a, b])).toBe(10);
  });

  test("two distinct fields still add hectares", () => {
    const a = { farmlandId: 1, hectares: 3, paintedBlobKey: "b:0:0:40:40" };
    const b = { farmlandId: 2, hectares: 4, paintedBlobKey: "b:200:200:240:240" };
    expect(clusterHectares([a, b])).toBe(7);
  });
});

const { productionTs } = require("./helpers/production-source.cjs");
const { clusterFieldsForDisplay } = productionTs("NEW APP/src/lib/rules-engine/field-clusters.ts");

describe("field cards do not auto-merge nearby same-crop parcels", () => {
  test("adjacent grass fields with different GPS blobs stay two cards", () => {
    const a = {
      farmlandId: 11,
      ownerFarmId: 1,
      fruitType: "GRASS",
      growthState: 5,
      hectares: 2,
      paintedBlobKey: "b:0:0:80:80",
      outline: [[0, 0], [80, 0], [80, 80], [0, 80]],
    };
    const b = {
      farmlandId: 12,
      ownerFarmId: 1,
      fruitType: "GRASS",
      growthState: 5,
      hectares: 2,
      paintedBlobKey: "b:90:0:170:80",
      outline: [[90, 0], [170, 0], [170, 80], [90, 80]],
    };
    const rows = clusterFieldsForDisplay([a, b], { autoMerge: true, manualGroups: [] });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.farmlandId).sort()).toEqual([11, 12]);
  });

  test("one GPS-painted blob still shares a card", () => {
    const blob = "b:0:0:200:500";
    const outline = [[0, 0], [200, 0], [200, 500], [0, 500]];
    const a = { farmlandId: 20, ownerFarmId: 1, fruitType: "OAT", paintedBlobKey: blob, outline, hectares: 10 };
    const b = { farmlandId: 21, ownerFarmId: 1, fruitType: "OAT", paintedBlobKey: blob, outline, hectares: 10 };
    const rows = clusterFieldsForDisplay([a, b], { manualGroups: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0]._clusterFieldIds).toEqual([20, 21]);
  });
});
