/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "implementMaintenance";
const ui = loadCompanionPage(KEY, { title: "Implement Maintenance", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("renders current implement wear and service with ownership caveat", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.1.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { vehicleCount: 1, serviceCount: 1 } },
      rows: [{ farmId: 1, vehicleId: "owned", vehicle: "Pöttinger Cultivator",
        operatingHours: 14.25, hoursSinceGrease: 2.5,
        greaseApplicable: true, greaseThresholdHours: 50, hoursSinceGeneralService: 10,
        groups: [{ key: "contacto", wearPercent: 27.5, quality: "generic" }],
        services: [{ day: 42, period: 5, meterHours: 12,
          group: "contacto", quality: "original", quantity: 1 }] },
      { farmId: 2, vehicleId: "foreign", vehicle: "Other implement",
        groups: [], services: [] }],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Pöttinger Cultivator");
  expect(host.textContent).toContain("27.5%");
  expect(host.textContent).toContain("2.50 / 50.00 h");
  expect(host.textContent).toContain("storage can make greasing due sooner");
  expect(host.textContent).toContain("Day 42");
  expect(host.textContent).toContain("may predate purchase");
  expect(host.textContent).not.toContain("Other implement");
});

test("distinguishes an old export without the interval flag from no grease requirement", () => {
  const base = { companionMods: { mods: [{ id: KEY, detected: true, version: "1.1.0.0" }] },
    companionPages: { pages: { [KEY]: { key: KEY, detected: true, readState: "ok",
      coverage: "complete", byFarm: { "1": { vehicleCount: 1, serviceCount: 0 } },
      rows: [{ farmId: 1, vehicleId: "owned", vehicle: "Cultivator",
        hoursSinceGrease: 2.5, hoursSinceGeneralService: 10, groups: [], services: [] }] } } } };
  const oldExport = ui.renderPage(base, { farmId: 1 });
  expect(oldExport.textContent).toContain("Interval unavailable");
  expect(oldExport.textContent).not.toContain("No grease interval");
  document.body.innerHTML = "";
  base.companionPages.pages[KEY].rows[0].greaseApplicable = false;
  const noGrease = ui.renderPage(base, { farmId: 1 });
  expect(noGrease.textContent).toContain("No grease interval");
});
