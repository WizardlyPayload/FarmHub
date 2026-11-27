/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "unloadGarage";
const ui = loadCompanionPage(KEY, { title: "Unload Garage", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows owned stored vehicles and storage-time snapshots only", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.3.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { garageCount: 1, storedVehicleCount: 1 } },
      garages: [{ farmId: 1, garageId: "a", garage: "Own garage", storedVehicles: 1, slots: 20 }],
      rows: [{ farmId: 1, garageId: "a", entryId: 1, garage: "Own garage",
        vehicle: "Stored tractor",
        operatingHoursAtStorage: 42.5, storedAtGameHour: 901.25 },
      { farmId: 2, garageId: "b", entryId: 1, garage: "Foreign garage", vehicle: "Other tractor" }],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Own garage");
  expect(host.textContent).toContain("Stored tractor");
  expect(host.textContent).toContain("42.5");
  expect(host.textContent).toContain("snapshots from when each vehicle was put away");
  expect(host.textContent).not.toContain("Foreign garage");
  expect(host.textContent).not.toContain("Other tractor");
});
