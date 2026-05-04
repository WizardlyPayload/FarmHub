// FS25 FarmDashboard | tests/realtime-connector.fanOut.test.js | Plan v5 C3
//
// Validates `_fanOutClusters` semantics: **one dashboard row per cluster** (aggregates),
// global counter counts **cluster rows**, `trimmed` counts **animal heads** skipped.

function fanOut(husbandry, clusters, globalCounter) {
  const out = [];
  const PEN_CLUSTER_ROW_CAP = 4096;
  const GLOBAL_ROW_CAP = (globalCounter && Number.isFinite(globalCounter.cap))
    ? globalCounter.cap
    : 8000;
  let clusterRowsThisPen = 0;
  let trimmedHeads = 0;

  for (let ci = 0; ci < clusters.length; ci++) {
    const c = clusters[ci];
    if (!c || !c.count || c.count <= 0) continue;

    if (clusterRowsThisPen >= PEN_CLUSTER_ROW_CAP) {
      trimmedHeads += c.count;
      continue;
    }
    if (globalCounter && (globalCounter.emitted || 0) >= GLOBAL_ROW_CAP) {
      trimmedHeads += c.count;
      continue;
    }

    const subType = c.subType || 'Unknown';
    const n = c.count;
    out.push({
      id: `pen-cluster-${ci}`,
      clusterCount: n,
      subType,
      __lodClusterAggregate: true,
      __lodSynth: true,
    });
    clusterRowsThisPen += 1;
    if (globalCounter) {
      globalCounter.emitted = (globalCounter.emitted || 0) + 1;
    }
  }

  if (trimmedHeads > 0) {
    husbandry.__lodTrimmed = trimmedHeads;
    if (globalCounter) globalCounter.trimmed = (globalCounter.trimmed || 0) + trimmedHeads;
  }
  if (globalCounter && (globalCounter.emitted || 0) >= GLOBAL_ROW_CAP) {
    globalCounter.capHit = true;
  }
  return out;
}

describe('LOD cluster rows per pen', () => {
  test('one row per cluster even if cluster declares 6000 heads (no per-head fan-out)', () => {
    const counter = { emitted: 0, cap: 100000 };
    const husbandry = {};
    const out = fanOut(husbandry, [{ count: 6000, subType: 'COW' }], counter);
    expect(out.length).toBe(1);
    expect(out[0].clusterCount).toBe(6000);
    expect(husbandry.__lodTrimmed).toBeUndefined();
  });

  test('caps cluster rows at 4096 per pen; trimmed counts skipped heads', () => {
    const counter = { emitted: 0, cap: 100000 };
    const husbandry = {};
    const clusters = [];
    for (let i = 0; i < 4097; i++) clusters.push({ count: 1, subType: 'PIG' });
    const out = fanOut(husbandry, clusters, counter);
    expect(out.length).toBe(4096);
    expect(husbandry.__lodTrimmed).toBe(1);
  });
});

describe('LOD global cluster-row cap', () => {
  test('later pens emit no cluster rows when global cap already reached; trimmed heads match skipped cluster', () => {
    const counter = { emitted: 0, cap: 1 };
    const huA = {};
    const huB = {};
    const a = fanOut(huA, [{ count: 800, subType: 'COW' }], counter);
    const b = fanOut(huB, [{ count: 800, subType: 'COW' }], counter);
    expect(a.length).toBe(1);
    expect(b.length).toBe(0);
    expect(counter.emitted).toBe(1);
    expect(counter.capHit).toBe(true);
    expect(counter.trimmed).toBe(800);
  });

  test('global row cap across pens (one cluster row per pen)', () => {
    const counter = { emitted: 0, cap: 50 };
    const total = [];
    for (let p = 0; p < 60; p++) {
      const hu = {};
      total.push(...fanOut(hu, [{ count: 10, subType: 'PIG' }], counter));
    }
    expect(counter.emitted).toBe(50);
    expect(total.length).toBe(50);
    expect(counter.capHit).toBe(true);
    expect(counter.trimmed).toBe(100);
  });

  test('exactly 1000 cluster rows then trim remaining heads', () => {
    const counter = { emitted: 0, cap: 1000 };
    const clusters = [];
    for (let i = 0; i < 1001; i++) clusters.push({ count: 1, subType: 'SHEEP' });
    const hu = {};
    const out = fanOut(hu, clusters, counter);
    expect(out.length).toBe(1000);
    expect(hu.__lodTrimmed).toBe(1);
    expect(counter.capHit).toBe(true);
  });

  test('zero or negative cluster counts are skipped', () => {
    const counter = { emitted: 0, cap: 100 };
    const hu = {};
    const out = fanOut(hu, [{ count: 0 }, { count: -1 }, { count: 5, subType: 'SHEEP' }], counter);
    expect(out.length).toBe(1);
    expect(out[0].clusterCount).toBe(5);
    expect(counter.emitted).toBe(1);
  });
});
