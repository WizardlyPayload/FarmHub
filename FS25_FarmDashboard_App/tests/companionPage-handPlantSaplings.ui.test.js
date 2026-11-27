/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "handPlantSaplings";
const ui = loadCompanionPage(KEY, { title: "Hand Plant Saplings", group: "storage" });

afterEach(() => { document.body.innerHTML = ""; });

test("renders owned sapling pieces and does not call them planted trees", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { rackCount: 1, backpackCount: 1, recordedPieces: 9 } },
      rows: [
        { farmId: 1, placeableId: "rack-a", placeable: "Own sapling rack",
          area: "rack", treeKey: "1_1", tree: "Pine", pieces: 6, areaCapacityPieces: 10 },
        { farmId: 1, placeableId: "rack-a", placeable: "Own sapling rack",
          area: "backpack", backpackIndex: 1, treeKey: "2_1", tree: "Oak",
          pieces: 3, areaCapacityPieces: 5 },
        { farmId: 2, placeableId: "rack-b", placeable: "Foreign rack",
          area: "rack", treeKey: "1_1", tree: "Pine", pieces: 99, areaCapacityPieces: 100 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Own sapling rack");
  expect(host.textContent).toContain("Backpack 1");
  expect(host.textContent).toContain("Pine");
  expect(host.textContent).toContain("Oak");
  expect(host.textContent).toContain("do not prove trees planted");
  expect(host.textContent).not.toContain("Foreign rack");
});
