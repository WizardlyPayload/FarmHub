import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/platform/major-deltas.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/^import .*;\s*$/gm, "");
const helpers = `
  const t = (key, args) => key + JSON.stringify(args || {});
  const resolveBaleInventoryForFarm = (inventory, farmId) =>
    inventory.byFarm?.[String(farmId)] || inventory;
  const sumBaleBucket = (bucket) =>
    ["straw", "grass", "hay", "silage", "other"].reduce((n, key) => n + Number(bucket?.[key] || 0), 0);
  const normalizeVehicleList = (vehicles) => Array.isArray(vehicles) ? vehicles : Object.values(vehicles);
  const vehicleMatchesActiveFarm = (vehicle, farmId) => vehicle.ownerFarmId === farmId;
  const isStorageItem = (vehicle) => vehicle.typeName === "pallet";
`;
const {
  advanceMajorDeltaTracker,
  diffMajorDeltas,
  majorDeltaStreamKey,
  mergeMajorDeltaSnapshot,
  takeMajorDeltaSnapshot,
} = await import(`data:text/javascript,${encodeURIComponent(helpers + compiled)}`);

const binding = (generation, sessionId = "session-a", stateStatus = "snapshot") => ({
  stateStatus,
  exportIdentity: { careerId: "career", sessionId, exportGeneration: generation },
});

const complete = {
  farmId: 1,
  animals: [{ ownerFarmId: 1, animalCount: 3 }],
  stock: { byFarm: { 1: { items: [{ totalLiters: 42515 }] } } },
  baleInventory: { byFarm: { 1: { onField: { straw: 11 }, inStorage: { straw: 0 } } } },
  vehicles: [],
};

test("missing sections are unknown, not a sale or removal", () => {
  const before = takeMajorDeltaSnapshot(complete);
  const partial = takeMajorDeltaSnapshot({ farmId: 1 });
  assert.deepEqual(partial, {
    animalCount: null,
    stockLiters: null,
    balesOnField: null,
    balesInStorage: null,
    storageItemCount: null,
  });
  assert.deepEqual(diffMajorDeltas(before, partial), []);
  const retained = mergeMajorDeltaSnapshot(before, partial);
  assert.deepEqual(retained, before);
  assert.deepEqual(diffMajorDeltas(retained, takeMajorDeltaSnapshot(complete)), []);
});

test("complete zero and changed readings still produce genuine activity", () => {
  const before = takeMajorDeltaSnapshot(complete);
  const after = takeMajorDeltaSnapshot({
    ...complete,
    animals: [],
    stock: { byFarm: {} },
    baleInventory: { byFarm: {} },
  });
  assert.deepEqual(diffMajorDeltas(before, after).map((event) => event.key), [
    "animals:removed:0",
    "stock:sold:0",
    "bales:0:0",
  ]);
});

test("only committed live exports from the same session share a delta stream", () => {
  const scope = "server::1::savegame4";
  const binding = {
    stateStatus: "snapshot",
    exportIdentity: { careerId: "career", sessionId: "session-a", exportGeneration: 1 },
  };
  const key = majorDeltaStreamKey(scope, binding);
  assert.equal(key, `${scope}::career::session-a`);
  assert.equal(majorDeltaStreamKey(scope, { ...binding, stateStatus: "held" }), null);
  assert.equal(majorDeltaStreamKey(scope, {
    ...binding,
    exportIdentity: { ...binding.exportIdentity, exportGeneration: 0 },
  }), null);
  assert.notEqual(majorDeltaStreamKey(scope, {
    ...binding,
    exportIdentity: { ...binding.exportIdentity, sessionId: "session-b" },
  }), key);
});

test("startup empty readings cannot invent animals, stock, or bales added", () => {
  let state = null;
  const scope = "server::1::savegame3";
  const empty = takeMajorDeltaSnapshot({
    farmId: 1, animals: [], stock: { byFarm: {} },
    baleInventory: { byFarm: {} }, vehicles: [],
    sectionOutcomes: {
      animals: { outcome: "empty", readState: "ok", coverage: "complete" },
      stock: { outcome: "zero", readState: "ok", coverage: "complete" },
    },
  });
  const full = takeMajorDeltaSnapshot(complete);
  for (const [generation, snapshot] of [[1, empty], [2, full], [3, full]]) {
    const result = advanceMajorDeltaTracker(state, scope, binding(generation), snapshot);
    state = result.state;
    assert.deepEqual(result.events, []);
  }
  const changed = takeMajorDeltaSnapshot({
    ...complete,
    animals: [{ ownerFarmId: 1, animalCount: 4 }],
    stock: { byFarm: { 1: { items: [{ totalLiters: 43515 }] } } },
    baleInventory: { byFarm: { 1: { onField: { straw: 12 }, inStorage: { straw: 0 } } } },
  });
  const result = advanceMajorDeltaTracker(state, scope, binding(4), changed);
  assert.deepEqual(result.events.map((event) => event.key), [
    "animals:added:4", "stock:bought:43515", "bales:12:0",
  ]);
});

test("same-generation merges, incomplete sections, and held snapshots do not create activity", () => {
  let state = null;
  const scope = "server::1::savegame3";
  const full = takeMajorDeltaSnapshot(complete);
  for (const generation of [1, 2]) {
    state = advanceMajorDeltaTracker(state, scope, binding(generation), full).state;
  }
  const partial = takeMajorDeltaSnapshot({
    ...complete,
    animals: [], stock: { byFarm: {} }, vehicles: [],
    sectionOutcomes: {
      animals: { outcome: "unknown", readState: null, coverage: "unknown" },
      stock: { outcome: "failed", readState: "failed", coverage: "partial" },
      vehicles: { outcome: "partial", readState: "partial", coverage: "partial" },
    },
  });
  assert.equal(partial.animalCount, null);
  assert.equal(partial.stockLiters, null);
  assert.equal(partial.storageItemCount, null);
  let result = advanceMajorDeltaTracker(state, scope, binding(2), partial);
  assert.deepEqual(result.events, []);
  result = advanceMajorDeltaTracker(result.state, scope, binding(3), partial);
  assert.deepEqual(result.events, []);
  result = advanceMajorDeltaTracker(result.state, scope, binding(4), full);
  assert.deepEqual(result.events, []);
  result = advanceMajorDeltaTracker(result.state, scope, binding(5), full);
  assert.deepEqual(result.events, []);
  result = advanceMajorDeltaTracker(result.state, scope, binding(6, "session-a", "held"), full);
  assert.equal(result.state, null);
  assert.deepEqual(result.events, []);
});

test("skipped generations silently rebaseline instead of reporting an uncertain change", () => {
  let state = null;
  const scope = "server::1::savegame3";
  const full = takeMajorDeltaSnapshot(complete);
  state = advanceMajorDeltaTracker(state, scope, binding(1), full).state;
  state = advanceMajorDeltaTracker(state, scope, binding(2), full).state;
  const empty = takeMajorDeltaSnapshot({ farmId: 1, animals: [], stock: { byFarm: {} }, vehicles: [] });
  const result = advanceMajorDeltaTracker(state, scope, binding(4), empty);
  assert.deepEqual(result.events, []);
  assert.equal(result.state.generation, 4);
});

test("bale startup counts wait for complete stock provenance before arming", () => {
  const scope = "server::1::savegame3";
  const provisional = takeMajorDeltaSnapshot({
    ...complete,
    stock: { byFarm: {} },
    baleInventory: { byFarm: { 1: { onField: { straw: 120 }, inStorage: { straw: 0 } } } },
    sectionOutcomes: {
      stock: { outcome: "unknown", readState: null, coverage: "unknown" },
    },
  });
  assert.equal(provisional.balesOnField, null);
  assert.equal(provisional.balesInStorage, null);

  const ready = takeMajorDeltaSnapshot({
    ...complete,
    baleInventory: { byFarm: { 1: { onField: { straw: 378 }, inStorage: { straw: 0 } } } },
    sectionOutcomes: {
      stock: { outcome: "ok", readState: "ok", coverage: "complete" },
    },
  });
  let state = null;
  for (const [generation, snapshot] of [[1, provisional], [2, provisional], [3, ready], [4, ready]]) {
    const result = advanceMajorDeltaTracker(state, scope, binding(generation), snapshot);
    state = result.state;
    assert.deepEqual(result.events, []);
  }
  const changed = takeMajorDeltaSnapshot({
    ...complete,
    baleInventory: { byFarm: { 1: { onField: { straw: 379 }, inStorage: { straw: 0 } } } },
    sectionOutcomes: {
      stock: { outcome: "ok", readState: "ok", coverage: "complete" },
    },
  });
  assert.deepEqual(
    advanceMajorDeltaTracker(state, scope, binding(5), changed).events.map((event) => event.key),
    ["bales:379:0"],
  );
});
