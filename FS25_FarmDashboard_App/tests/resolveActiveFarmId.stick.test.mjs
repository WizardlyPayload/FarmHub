/**
 * Ensures preferred farm sticks when it owns fields (even with zero animals).
 * Run: node --experimental-strip-types tests/resolveActiveFarmId.stick.test.mjs
 */
import assert from "node:assert/strict";
import { resolveActiveFarmId } from "../../NEW APP/src/lib/farm-scope.ts";

const farms = [
  { id: 1, name: "Main Arable Farm", isPlayer: true, players: {} },
  { id: 2, name: "Main Dairy Farm", isPlayer: true, players: { a: true } },
  { id: 3, name: "Livestock Farm", isPlayer: true, players: {} },
];

const fields = [
  { id: 1, ownerFarmId: 1 },
  { id: 2, ownerFarmId: 1 },
  { id: 3, ownerFarmId: 2 },
  { id: 4, ownerFarmId: 3 },
];

const animals = [
  { ownerFarmId: 2, animalCount: 40 },
  { ownerFarmId: 3, animalCount: 20 },
];

const vehicles = [
  { ownerFarmId: 1, name: "Tractor" },
  { ownerFarmId: 2, name: "Mixer" },
];

assert.equal(
  resolveActiveFarmId({ preferred: 1, farms, fields, animals, vehicles }),
  1,
  "preferred arable farm with fields must not snap to dairy (more animals)"
);

assert.equal(
  resolveActiveFarmId({ preferred: 3, farms, fields, animals, vehicles }),
  3,
  "preferred livestock farm must stick"
);

assert.equal(
  resolveActiveFarmId({ preferred: 2, farms, fields, animals, vehicles }),
  2,
  "preferred dairy farm must stick"
);

assert.equal(
  resolveActiveFarmId({ preferred: 99, farms, fields, animals, vehicles }),
  1,
  "invalid preferred falls back to first player farm id"
);

console.log("resolveActiveFarmId farm-stick tests OK");
