// Regression: the vehicles grid + summary cards must be scoped to the ACTIVE farm.
// On multi-farm dedicated servers the merged fleet contains the same model owned by
// several farms (e.g. two "MF 9S", one per farm). If any render/count path uses the
// unfiltered fleet, those distinct-but-same-named vehicles look "duplicated" in the UI.
// These tests pin the scoping in the two pure-ish entry points so the bug can't return.
import test from "node:test";
import assert from "node:assert/strict";

// Minimal DOM stub: filterVehiclesBySummaryCard touches a few elements (filter selects,
// the grid for scrollIntoView); updateVehicleSummaryCards toggles the ADS summary row.
globalThis.window = globalThis.window || {
  fetch: async () => ({ ok: false, json: async () => ({}) }),
  location: { pathname: "/" },
};
globalThis.document = globalThis.document || {
  getElementById: () => ({
    value: "",
    scrollIntoView() {},
    classList: { toggle() {} },
  }),
};

const vehicles = await import("../web/assests/js/modules/vehicles.js");

// Same model owned by farm 1 and farm 2, plus a second farm-1 vehicle.
const mixedFleet = [
  { id: 1, name: "MF 9S", ownerFarmId: 1, isMotorized: true, fuelCapacity: 100, fuelLevel: 100 },
  { id: 2, name: "MF 9S", ownerFarmId: 2, isMotorized: true, fuelCapacity: 100, fuelLevel: 100 },
  { id: 3, name: "Baler", ownerFarmId: 1, isMotorized: false },
  { id: 4, name: "Trailer", ownerFarmId: 100, isMotorized: false },
];

function makeCtx() {
  return {
    activeFarmId: 1,
    vehicles: mixedFleet,
    isStorageItem: () => false,
    setElementText(id, val) {
      (this._texts ||= {})[id] = val;
    },
    renderVehicleCards(list) {
      this._rendered = list;
    },
  };
}

test("filterVehiclesBySummaryCard('all') renders only the active farm's vehicles", () => {
  const ctx = makeCtx();
  vehicles.filterVehiclesBySummaryCard.call(ctx, "all");
  const ids = (ctx._rendered || []).map((v) => v.id).sort();
  assert.deepEqual(ids, [1, 3], "should render farm-1 vehicles only (not farm 2 / 100)");
});

test("updateVehicleSummaryCards total counts only the active farm", () => {
  const ctx = makeCtx();
  vehicles.updateVehicleSummaryCards.call(ctx);
  assert.equal(ctx._texts["total-vehicles-count"], 2, "farm-1 vehicles: MF 9S + Baler");
});

test("switching active farm re-scopes both the grid and the count", () => {
  const ctx = makeCtx();
  ctx.activeFarmId = 2;
  vehicles.filterVehiclesBySummaryCard.call(ctx, "all");
  assert.deepEqual((ctx._rendered || []).map((v) => v.id), [2]);
  vehicles.updateVehicleSummaryCards.call(ctx);
  assert.equal(ctx._texts["total-vehicles-count"], 1);
});
