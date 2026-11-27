/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "mixerWagonFeedSwitcher";
const ui = loadCompanionPage(KEY, { title: "Mixer Wagon Feed Switcher", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows only owned recipe groups and distinguishes settings from produced feed", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { customRecipeCount: 1 } },
      rows: [
        { farmId: 1, vehicleId: "owned", vehicle: "Own mixer", recipe: "PigFood",
          outputFillType: "PIGFOOD", groups: [{ name: "baseGrain", litres: 1200 }] },
        { farmId: 2, vehicleId: "foreign", vehicle: "Foreign mixer", recipe: "Other" },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Own mixer");
  expect(host.textContent).toContain("PigFood");
  expect(host.textContent).toContain("baseGrain 1,200 L");
  expect(host.textContent).toContain("does not prove feed was produced");
  expect(host.textContent).not.toContain("Foreign mixer");
});
