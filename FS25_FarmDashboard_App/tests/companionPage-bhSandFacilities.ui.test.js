/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "bhSandFacilities";
const ui = loadCompanionPage(KEY, { title: "BH Sand Facilities", group: "storage" });

afterEach(() => { document.body.innerHTML = ""; });

test("renders silo stock separately from the yard's paid unlimited supply", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { siloCount: 1, yardCount: 1,
        runningCount: 1, sandLiters: 250000 } },
      silos: [
        { farmId: 1, placeableId: "s", name: "West silo", running: true,
          sandLiters: 250000, capacityLiters: 500000,
          usageEnabled: true, usageArmed: true, holdRemainingSeconds: 90,
          configuredUseLitersPerRunningHour: 1200000 },
        { farmId: 2, placeableId: "f", name: "Other farm silo", running: false,
          sandLiters: 999999, capacityLiters: 999999 },
      ],
      yards: [{ farmId: 1, placeableId: "y", name: "South yard", running: false,
        truckFillCutoffRatio: 0.9 }],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("West silo");
  expect(host.textContent).toContain("250,000");
  expect(host.textContent).toContain("South yard");
  expect(host.textContent).toContain("Unlimited paid supply");
  expect(host.textContent).toContain("90%");
  expect(host.textContent).toContain("does not prove consumption");
  expect(host.textContent).not.toContain("Other farm silo");
});
