/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "helperSilageCompacting";
const ui = loadCompanionPage(KEY, { title: "Helper Silage Compacting", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows owned assigned helpers without a foreign tractor", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { assignedVehicleCount: 1, runningVehicleCount: 1, waitingVehicleCount: 0 } },
      rows: [
        { farmId: 1, vehicleId: "owned", vehicle: "Owned tractor", workerState: "Running" },
        { farmId: 2, vehicleId: "foreign", vehicle: "Foreign tractor", workerState: "Waiting" },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Owned tractor");
  expect(host.textContent).toContain("Helpers running");
  expect(host.textContent).not.toContain("Foreign tractor");
});
