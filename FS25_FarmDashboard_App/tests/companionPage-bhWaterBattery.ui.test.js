/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "bhWaterBattery";
const ui = loadCompanionPage(KEY, { title: "BH Produced Water Tank Batteries", group: "storage" });

afterEach(() => { document.body.innerHTML = ""; });

test("renders owned battery levels and safety state without treating counters as sales", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "2.0.2.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { batteryCount: 1, tankCount: 4,
        waterLiters: 10000, totalProducedLiters: 12000,
        totalLoadedLiters: 3000, unacknowledgedHighTanks: 1 } },
      banks: [
        { farmId: 1, batteryId: "own", battery: "East water bank", bankESD: false,
          selectedTank: 2, waterLiters: 10000, totalProducedLiters: 12000,
          totalLoadedLiters: 3000, tanks: [
            { number: 2, selected: true, waterLiters: 2000, capacityLiters: 80000,
              inletOpen: true, outletOpen: false, highLatched: true, lowLocked: false,
              drawdownAuthorized: false, acknowledged: false },
          ] },
        { farmId: 2, batteryId: "foreign", battery: "Other farm water bank", bankESD: true,
          selectedTank: 1, waterLiters: 9999, totalProducedLiters: 9999,
          totalLoadedLiters: 9999, tanks: [] },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("East water bank");
  expect(host.textContent).toContain("10,000");
  expect(host.textContent).toContain("High: drawdown needed");
  expect(host.textContent).toContain("Closed");
  expect(host.textContent).toContain("not sales or income");
  expect(host.textContent).not.toContain("Other farm water bank");
});
