/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "realTireWear";
const ui = loadCompanionPage(KEY, { title: "Real Tire Wear", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("keeps mounted wear and farm spare stock in separate tables", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.8.0.0" }] },
    companionPages: { pages: { [KEY]: { key: KEY, detected: true, readState: "ok", coverage: "complete",
      stockState: "ready", byFarm: { "1": { mountedCount: 1, spareCount: 1 } },
      mounted: [{ farmId: 1, vehicleId: "v1", vehicle: "My tractor", wheelIndex: 2,
        wearPct: 24, km: 100, roadKm: 60, fieldKm: 35, repairs: 1, damaged: true, airLossPct: 20 }],
      spare: [{ farmId: 1, passportId: "RTW-00000003", size: "600/300/example/1",
        wearPct: 30, km: 350, repairs: 2 }],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Mounted tires on owned vehicles");
  expect(host.textContent).toContain("My tractor");
  expect(host.textContent).toContain("Air loss");
  expect(host.textContent).toContain("Farm spare-tire stock");
  expect(host.textContent).toContain("RTW-00000003");
  expect(host.textContent).toContain("Readable spare tire passports");
});

test("says spare stock is unavailable until the server inventory is ready", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true }] },
    companionPages: { pages: { [KEY]: { key: KEY, detected: true, readState: "partial", coverage: "partial",
      stockState: "unavailable", byFarm: { "1": { mountedCount: 0 } }, mounted: [], spare: [] } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Server spare inventory has not loaded");
  expect(host.textContent).not.toContain("No spare tire is recorded for this farm.");
});
