/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "useYourTyres";
const ui = loadCompanionPage(KEY, { title: "Use Your Tyres", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows farm-owned active wheel readings and source limits", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.1.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete", multiplier: 1,
      byFarm: { "1": { vehicleCount: 1, wheelCount: 2, maxWearPct: 10 } },
      rows: [
        { farmId: 1, vehicleId: "owned", vehicle: "Farm tractor", wheelIndex: 1, distanceKm: 24, wearPct: 10 },
        { farmId: 1, vehicleId: "owned", vehicle: "Farm tractor", wheelIndex: 2, distanceKm: 0, wearPct: 0 },
        { farmId: 2, vehicleId: "foreign", vehicle: "Other tractor", wheelIndex: 1, distanceKm: 12, wearPct: 5 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Farm tractor");
  expect(host.textContent).toContain("24.0 km");
  expect(host.textContent).toContain("10.0%");
  expect(host.textContent).toContain("1.0×");
  expect(host.textContent).toContain("does not establish a tyre replacement");
  expect(host.textContent).not.toContain("Other tractor");
});
