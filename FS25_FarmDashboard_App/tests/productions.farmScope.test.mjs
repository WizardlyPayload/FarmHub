import test from "node:test";
import assert from "node:assert/strict";
import { getOwnedChainsForFarm } from "../web/assests/js/modules/productions.js";

const farmInfo = [
  { id: 0, name: "", players: {} },
  { id: 1, name: "Riverbend Farm", players: [{ name: "Player" }] },
];

test("getOwnedChainsForFarm prefers active farm when ownerFarmId matches", () => {
  const production = {
    chains: [
      { id: 1, name: "Bakery", ownerFarmId: 1 },
      { id: 2, name: "Mill", ownerFarmId: 2 },
    ],
  };
  const chains = getOwnedChainsForFarm(production, 1, farmInfo);
  assert.equal(chains.length, 1);
  assert.equal(chains[0].name, "Bakery");
});

test("getOwnedChainsForFarm falls back to any player farm when active farm has no chains", () => {
  const production = {
    chains: [{ id: 1, name: "Bakery", ownerFarmId: 1 }],
  };
  const chains = getOwnedChainsForFarm(production, 2, farmInfo);
  assert.equal(chains.length, 1);
  assert.equal(chains[0].name, "Bakery");
});
