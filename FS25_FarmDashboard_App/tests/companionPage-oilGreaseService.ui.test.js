/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "oilGreaseService";
const ui = loadCompanionPage(KEY, { title: "Oil And Grease Service", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows which owned vehicle needs workshop attention", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.1.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { monitoredVehicles: 1, serviceNeeded: 1 } },
      rows: [{ farmId: 1, vehicleId: "oil-1", vehicle: "John Deere 6R", serviceNeeded: true,
        oil: { enabled: true, levelLitres: 25, capacityLitres: 100, percent: 25 },
        grease: { enabled: true, levelLitres: 80, capacityLitres: 80, percent: 100 } }],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("John Deere 6R");
  expect(host.textContent).toContain("25.0 / 100.0 L");
  expect(host.textContent).toContain("Below full; check workshop");
  expect(host.textContent).toContain("not a completed repair or recorded expense");
});
