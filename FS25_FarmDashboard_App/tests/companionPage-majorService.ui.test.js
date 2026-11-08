/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "majorService";
const ui = loadCompanionPage(KEY, { title: "Major Service", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows owned service history and labels an unrecorded service", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { vehicleCount: 2, recordedCount: 1 } },
      rows: [
        { farmId: 1, vehicleId: "serviced", vehicle: "Farm tractor", operatingHours: 10,
          lastServiceHours: 4, sinceServiceHours: 6, serviceRecorded: true },
        { farmId: 1, vehicleId: "never", vehicle: "Farm trailer", operatingHours: 5,
          serviceRecorded: false },
        { farmId: 2, vehicleId: "foreign", vehicle: "Foreign truck", operatingHours: 11,
          lastServiceHours: 2, sinceServiceHours: 9, serviceRecorded: true },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Farm tractor");
  expect(host.textContent).toContain("6.0 h");
  expect(host.textContent).toContain("Not recorded");
  expect(host.textContent).toContain("does not show what was charged or repaired");
  expect(host.textContent).not.toContain("Foreign truck");
});
