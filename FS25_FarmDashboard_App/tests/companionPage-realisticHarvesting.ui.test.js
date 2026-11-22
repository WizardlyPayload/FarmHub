/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "realisticHarvesting";
const ui = loadCompanionPage(KEY, { title: "Realistic Harvesting", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows a farm combine's tuning and excludes another farm", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.6.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { combineCount: 1, calibratedCount: 1, autoCount: 1 } },
      rows: [
        { farmId: 1, vehicleId: "owned", vehicle: "MF 8570", machineType: "grain",
          packageLevel: 4, mode: "AUTO", autoSwitch: true, tuningCrop: "WHEAT",
          calibrated: true, fan: 47, rotor: 48, upperSieve: 44,
          lowerSieve: 53, feeder: 54, targetEngineLoad: 88 },
        { farmId: 2, vehicleId: "foreign", vehicle: "Other combine", machineType: "grain",
          packageLevel: 1, mode: "MANUAL", autoSwitch: false, calibrated: false,
          targetEngineLoad: 88 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("MF 8570");
  expect(host.textContent).toContain("WHEAT");
  // The accepted MF 8570 reading was stored as a percentage but shown in RPM/mm by the mod.
  expect(host.textContent).toContain("Fan 720 RPM");
  expect(host.textContent).toContain("Rotor 630 RPM");
  expect(host.textContent).toContain("Upper sieve 13 mm");
  expect(host.textContent).toContain("Lower sieve 13 mm");
  expect(host.textContent).toContain("Target load 88%");
  expect(host.textContent).toContain("Auto switch on");
  expect(host.textContent).toContain("does not prove an active harvest");
  expect(host.textContent).not.toContain("Other combine");
});
