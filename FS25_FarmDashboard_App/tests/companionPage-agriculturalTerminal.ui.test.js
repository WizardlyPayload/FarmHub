/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "agriculturalTerminal";
const ui = loadCompanionPage(KEY, { title: "Agricultural Terminal", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("renders vehicle work and tank intake with ownership caveat", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { vehicleCount: 1, recordCount: 2 } },
      rows: [
        { farmId: 1, vehicleId: "owned", vehicle: "Fendt 700", number: 3,
          current: true, paused: false, startingParcel: 12, areaHa: 1.25,
          workHours: 1, openHours: 1.25, fuelLiters: 14.5,
          distanceKm: 2.5, harvestTonnes: 3.2, harvestHa: 0.8 },
        { farmId: 1, vehicleId: "owned", vehicle: "Fendt 700", number: 2,
          current: false, startingParcel: 14, areaHa: 0.65,
          workHours: 0.5, openHours: 0.58, fuelLiters: 7.2,
          distanceKm: 1, harvestTonnes: 1.4, harvestHa: 0.4 },
        { farmId: 2, vehicleId: "foreign", vehicle: "Other tractor", number: 1,
          current: false, areaHa: 9, workHours: 4, openHours: 5,
          fuelLiters: 30, distanceKm: 10, harvestTonnes: 8, harvestHa: 3 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Fendt 700");
  expect(host.textContent).toContain("Started on parcel 12");
  expect(host.textContent).toContain("Area 1.25 ha");
  expect(host.textContent).toContain("Job engine time 1.25 h");
  expect(host.textContent).toContain("Closed");
  expect(host.textContent).toContain("3.20 t");
  expect(host.textContent).toContain("may predate purchase");
  expect(host.textContent).not.toContain("Other tractor");
});
