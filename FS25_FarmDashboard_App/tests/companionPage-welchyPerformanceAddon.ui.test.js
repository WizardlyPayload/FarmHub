/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "welchyPerformanceAddon";
const ui = loadCompanionPage(KEY, { title: "Welchy Performance Addon", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows configured owned tune units and withholds other farms", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.4.2" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { supportedVehicleCount: 1, changedVehicleCount: 1, changedSettingCount: 2 } },
      rows: [
        { farmId: 1, vehicleId: "owned", vehicle: "Owned tractor", parameter: "throttleRampMs",
          label: "Keyboard throttle delay", value: 1500, default: 0, unit: "seconds" },
        { farmId: 1, vehicleId: "owned", vehicle: "Owned tractor", parameter: "turboVolume",
          label: "Turbo volume", value: 1.25, default: 1, unit: "percent" },
        { farmId: 2, vehicleId: "foreign", vehicle: "Foreign truck", parameter: "rpmLimit",
          label: "Limiter RPM", value: 4000, default: 0, unit: "redline" },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Owned tractor");
  expect(host.textContent).toContain("1.5 s");
  expect(host.textContent).toContain("125%");
  expect(host.textContent).toContain("configured choices, not measured power");
  expect(host.textContent).not.toContain("Foreign truck");
});
