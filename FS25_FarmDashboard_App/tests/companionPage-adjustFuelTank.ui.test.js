/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "adjustFuelTank";
const ui = loadCompanionPage(KEY, { title: "Adjustable Fuel Tank + Elektro", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("keeps selected and observed capacity separate for the selected farm", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "2.1.0.23" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { selectedVehicleCount: 1, matchingFillUnitCount: 1 } },
      rows: [
        { farmId: 1, vehicleId: "own", vehicle: "Farm tractor", kind: "Diesel",
          selectedPercent: 125, originalCapacityLitres: 400,
          expectedCapacityLitres: 500, currentCapacityLitres: 500,
          capacityMatchesSelection: true },
        { farmId: 2, vehicleId: "foreign", vehicle: "Other farm tractor", kind: "Diesel",
          selectedPercent: 500, originalCapacityLitres: 400,
          expectedCapacityLitres: 2000, currentCapacityLitres: 2000 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Farm tractor");
  expect(host.textContent).toContain("125%");
  expect(host.textContent).toContain("400 L");
  expect(host.textContent).toContain("500 L");
  expect(host.textContent).toContain("Capacity matches");
  expect(host.textContent).not.toContain("Other farm tractor");
});
