/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "capacityUpgrade";
const ui = loadCompanionPage(KEY, { title: "Capacity Upgrade", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("distinguishes a physical tank from slower use and hides another farm", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { vehicleCount: 2, capacityUnitCount: 1, slowedUnitCount: 1 } },
      rows: [
        { farmId: 1, vehicleId: "trailer", vehicle: "Farm trailer", fillUnitIndex: 1,
          factor: 1.5, effect: "capacity", stockCapacity: 8000, currentCapacity: 12000 },
        { farmId: 1, vehicleId: "planter", vehicle: "Farm planter", fillUnitIndex: 1,
          factor: 1.25, effect: "usage-slowed" },
        { farmId: 2, vehicleId: "foreign", vehicle: "Foreign trailer", fillUnitIndex: 1,
          factor: 6, effect: "capacity", stockCapacity: 1000, currentCapacity: 6000 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Farm trailer");
  expect(host.textContent).toContain("12,000");
  expect(host.textContent).not.toContain("12,000 L");
  expect(host.textContent).toContain("Larger capacity");
  expect(host.textContent).toContain("Farm planter");
  expect(host.textContent).toContain("Slower use");
  expect(host.textContent).not.toContain("Foreign trailer");
});
