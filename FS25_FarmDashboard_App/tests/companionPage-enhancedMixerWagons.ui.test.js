/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "enhancedMixerWagons";
const ui = loadCompanionPage(KEY, { title: "Enhanced Mixer Wagons", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("renders owned elapsed timer without presenting foreign state as feed delivered", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.1.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { wagonCount: 1, inProgressCount: 1 } },
      rows: [
        { farmId: 1, vehicleId: "owned", vehicle: "Owned mixer", elapsedSeconds: 60,
          requiredSeconds: 120, progressPercent: 50, currentFillLitres: 8500 },
        { farmId: 2, vehicleId: "foreign", vehicle: "Foreign mixer", elapsedSeconds: 100,
          requiredSeconds: 120, progressPercent: 83, currentFillLitres: 12000 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Owned mixer");
  expect(host.textContent).toContain("60.0 s");
  expect(host.textContent).toContain("50%");
  expect(host.textContent).toContain("not feed produced or delivered");
  expect(host.textContent).not.toContain("Foreign mixer");
});
