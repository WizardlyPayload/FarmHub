/**
 * Contract for NEW APP field-card ordering.
 * Keep in sync with NEW APP/src/sections/fields/field-sort.ts
 */
function fieldCardNumber(field) {
  const fromCluster = Array.isArray(field?._clusterFieldIds)
    ? field._clusterFieldIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
    : [];
  if (fromCluster.length) return Math.min(...fromCluster);
  const n = Number(field?.farmlandId ?? field?.id);
  return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
}

function fieldCropSortKey(field) {
  const raw = String(field?.fruitType || "")
    .trim()
    .toLowerCase();
  if (!raw || raw === "empty" || raw === "unknown") return "\uFFFF";
  return raw;
}

function compareByNumber(a, b) {
  return fieldCardNumber(a) - fieldCardNumber(b);
}

function sortBy(rows, compare) {
  return rows.slice().sort(compare);
}

describe("field card sort contract", () => {
  test("number uses farmland id, then the lowest id in a merged cluster", () => {
    const rows = [
      { farmlandId: 12, fruitType: "wheat" },
      { farmlandId: 3, fruitType: "barley" },
      { farmlandId: 40, _clusterFieldIds: [40, 7], fruitType: "canola" },
    ];
    const ordered = sortBy(rows, compareByNumber).map(fieldCardNumber);
    expect(ordered).toEqual([3, 7, 12]);
  });

  test("crop groups by fruit type and leaves empty fields last", () => {
    const rows = [
      { farmlandId: 2, fruitType: "wheat" },
      { farmlandId: 1, fruitType: "empty" },
      { farmlandId: 4, fruitType: "barley" },
      { farmlandId: 3, fruitType: "WHEAT" },
    ];
    const ordered = sortBy(rows, (a, b) => {
      const crop = fieldCropSortKey(a).localeCompare(fieldCropSortKey(b));
      return crop !== 0 ? crop : compareByNumber(a, b);
    });
    expect(ordered.map((r) => r.farmlandId)).toEqual([4, 2, 3, 1]);
  });

  test("size is largest hectares first, then field number", () => {
    const rows = [
      { farmlandId: 8, hectares: 1.2 },
      { farmlandId: 2, hectares: 4 },
      { farmlandId: 5, hectares: 4 },
    ];
    const ordered = sortBy(rows, (a, b) => {
      const size = (Number(b.hectares) || 0) - (Number(a.hectares) || 0);
      return size !== 0 ? size : compareByNumber(a, b);
    });
    expect(ordered.map((r) => r.farmlandId)).toEqual([2, 5, 8]);
  });
});
