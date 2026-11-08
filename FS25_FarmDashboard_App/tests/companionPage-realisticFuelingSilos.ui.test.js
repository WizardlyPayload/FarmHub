/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "realisticFuelingSilos";
const ui = loadCompanionPage(KEY, { title: "Realistic Fueling System silos", group: "storage" });

afterEach(() => { document.body.innerHTML = ""; });

test("renders this farm's configured prices without another farm's row", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { siloCount: 1 } },
      rows: [
        { farmId: 1, placeableId: "owned", name: "Owned yard silo", dieselPerLitre: 1.537, defPerLitre: 1.245 },
        { farmId: 2, placeableId: "foreign", name: "Foreign silo", dieselPerLitre: 4.0, defPerLitre: 4.0 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Owned yard silo");
  expect(host.textContent).toContain("1.537");
  expect(host.textContent).toContain("1.245");
  expect(host.textContent).toContain("do not prove any fuel sale");
  expect(host.textContent).not.toContain("Foreign silo");
});
