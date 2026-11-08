/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "rcSheepBarn";
const ui = loadCompanionPage(KEY, { title: "RC Sheep Barn and Storage", group: "livestock" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows current owned supplies without claiming feeding or manure production", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.1.1.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { barnCount: 1, storedStrawLitres: 2000 } },
      rows: [{ farmId: 1, placeableId: "own", barn: "Own sheep barn",
        strawLitres: 2000, strawCapacityLitres: 100000, availableRationLitres: 1000,
        groups: [{ group: "hay", requiredPercent: 50, storedLitres: 500 }] },
      { farmId: 2, placeableId: "other", barn: "Foreign barn", strawLitres: 9000 }],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Own sheep barn");
  expect(host.textContent).toContain("2,000 L");
  expect(host.textContent).toContain("Hay");
  expect(host.textContent).toContain("50%");
  expect(host.textContent).toContain("does not prove feeding or manure production");
  expect(host.textContent).not.toContain("Foreign barn");
});
