/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "toggleableSilageAdditive";
const ui = loadCompanionPage(KEY, { title: "Toggleable Silage Additive", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows current owned switch and keeps foreign equipment out", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { supportedVehicleCount: 1, disabledVehicleCount: 1 } },
      rows: [
        { farmId: 1, vehicleId: "owned", vehicle: "Owned baler", additiveUsageEnabled: false },
        { farmId: 2, vehicleId: "foreign", vehicle: "Foreign baler", additiveUsageEnabled: true },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Owned baler");
  expect(host.textContent).toContain("Additive usage switched off");
  expect(host.textContent).toContain("Save/reload persistence has not been verified");
  expect(host.textContent).not.toContain("Foreign baler");
});
