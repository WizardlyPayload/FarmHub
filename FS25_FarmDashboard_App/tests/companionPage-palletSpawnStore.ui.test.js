/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "palletSpawnStore";
const ui = loadCompanionPage(KEY, { title: "Pallet Spawn Store", group: "storage" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows current owned output routing with a stock disclaimer", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { outputCount: 2, storeCount: 1, spawnCount: 1 } },
      rows: [
        { farmId: 1, placeableId: "owned", production: "Greenhouse",
          fillType: "TOMATO", fillTitle: "Tomatoes", mode: "store" },
        { farmId: 1, placeableId: "owned", production: "Greenhouse",
          fillType: "LETTUCE", fillTitle: "Lettuce", mode: "spawn" },
        { farmId: 2, placeableId: "foreign", production: "Other farm factory",
          fillType: "BREAD", mode: "sell" },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Greenhouse");
  expect(host.textContent).toContain("Store without pallets");
  expect(host.textContent).toContain("Spawn/store pallets");
  expect(host.textContent).toContain("not produced pallets, sales or deliveries");
  expect(host.textContent).not.toContain("Other farm factory");
});
