/**
 * WP-07: every vehicle-like entity is classified once.
 * Run: node --experimental-strip-types --test tests/fleetClassify.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyFleetEntities,
  classifyVehiclePlacement,
  getDisplayFleet,
  isPalletHandlingEquipment,
  isStorageItem,
} from "../../NEW APP/src/lib/fleet-classify.ts";

function frozenSave1Generation() {
  const fleet = [];
  for (let i = 1; i <= 39; i++) {
    fleet.push({
      id: i,
      name: `Tractor ${i}`,
      typeName: "tractor",
      ownerFarmId: 1,
      isMotorized: true,
    });
  }
  fleet.push({
    id: 40,
    name: "Pallet Fork",
    typeName: "palletFork",
    ownerFarmId: 1,
  });
  fleet.push({
    id: 41,
    name: "Bailey Bale and Pallet Trailer",
    typeName: "trailer",
    ownerFarmId: 1,
  });
  const storage = [];
  for (let i = 1; i <= 6; i++) {
    storage.push({
      id: 100 + i,
      name: `Seeds Pallet ${i}`,
      typeName: "pallet",
      ownerFarmId: 1,
    });
  }
  return [...fleet, ...storage];
}

test("frozen 47-entity generation is 41 fleet + 6 storage, each id once", () => {
  const rows = frozenSave1Generation();
  assert.equal(rows.length, 47);
  const classified = classifyFleetEntities(rows, 1);
  assert.equal(classified.fleet.length, 41);
  assert.equal(classified.storage.length, 6);
  assert.equal(classified.dealer.length, 0);
  assert.equal(classified.otherFarm.length, 0);
  assert.equal(classified.unresolved.length, 0);
  assert.equal(getDisplayFleet(rows, 1).length, 41);

  const seen = new Set();
  for (const bucket of Object.values(classified)) {
    for (const row of bucket) {
      assert.equal(seen.has(row.id), false, `id ${row.id} classified twice`);
      seen.add(row.id);
    }
  }
  assert.equal(seen.size, 47);
});

test("pallet-handling equipment stays in Fleet; consumable pallets in Storage", () => {
  assert.equal(isPalletHandlingEquipment({ name: "Pallet Fork", typeName: "implement" }), true);
  assert.equal(isStorageItem({ name: "Pallet Fork", typeName: "implement" }), false);
  assert.equal(isStorageItem({ name: "Seed Pallet", typeName: "pallet", ownerFarmId: 1 }), true);
  assert.equal(isStorageItem({ name: "Big Bag", typeName: "bigBag", ownerFarmId: 1 }), true);
  assert.equal(
    classifyVehiclePlacement(
      { name: "Bailey Bale and Pallet Trailer", typeName: "trailer", ownerFarmId: 1 },
      1
    ),
    "fleet"
  );
});

test("unresolved and other-farm owners are not guessed into the active farm", () => {
  assert.equal(
    classifyVehiclePlacement({ name: "Orphan", typeName: "tractor" }, 1),
    "unresolved"
  );
  assert.equal(
    classifyVehiclePlacement({ name: "Other", typeName: "tractor", ownerFarmId: 2 }, 1),
    "otherFarm"
  );
  assert.equal(
    classifyVehiclePlacement({ name: "Shop", typeName: "tractor", ownerFarmId: 100 }, 1),
    "dealer"
  );
  const mixed = [
    { id: 1, name: "Mine", typeName: "tractor", ownerFarmId: 1 },
    { id: 2, name: "Theirs", typeName: "tractor", ownerFarmId: 2 },
    { id: 3, name: "Unknown owner", typeName: "tractor" },
  ];
  const classified = classifyFleetEntities(mixed, 1);
  assert.deepEqual(
    classified.fleet.map((v) => v.id),
    [1]
  );
  assert.deepEqual(
    classified.otherFarm.map((v) => v.id),
    [2]
  );
  assert.deepEqual(
    classified.unresolved.map((v) => v.id),
    [3]
  );
});
