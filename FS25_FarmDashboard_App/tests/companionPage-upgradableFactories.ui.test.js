/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "upgradableFactories";
const ui = loadCompanionPage(KEY);

afterEach(() => { document.body.innerHTML = ""; });

test("shows only this farm's saved levels and labels the multiplier", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { productionCount: 1, upgradedCount: 1 } },
      rows: [
        { farmId: 1, placeableId: "bakery", production: "Bakery", level: 3,
          maxLevel: 10, configuredMultiplier: 1.75 },
        { farmId: 2, placeableId: "other", production: "Foreign", level: 10,
          maxLevel: 10, configuredMultiplier: 3.5 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Bakery");
  expect(host.textContent).toContain("Configured multiplier");
  expect(host.textContent).toContain("1.75");
  expect(host.textContent).not.toContain("Foreign");
  expect(host.textContent).not.toContain("3.5");
});
