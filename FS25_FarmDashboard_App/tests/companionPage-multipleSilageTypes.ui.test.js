/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "multipleSilageTypes";
const ui = loadCompanionPage(KEY, { title: "Multiple Silage Types", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows owned knife and recorded closed mix without a live-stock claim", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.1" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { configuredVehicleCount: 1, recordedBunkerCount: 1 } },
      vehicles: [
        { farmId: 1, vehicleId: "v", vehicle: "Own wagon", kind: "forageWagon", chopMode: true,
          originalCapacityLitres: 10000, compressionCapacityLitres: 16000 },
        { farmId: 2, vehicleId: "f", vehicle: "Foreign wagon", chopMode: true },
      ],
      bunkers: [{ farmId: 1, bunkerId: "b", bunker: "Own bunker", state: "closed",
        recordedTotalLitres: 1500, mix: [{ type: "grass", recordedLitres: 1200 }] }],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Own wagon");
  expect(host.textContent).toContain("10,000 L");
  expect(host.textContent).toContain("Own bunker");
  expect(host.textContent).toContain("grass: 1,200 L");
  expect(host.textContent).toContain("is not current stock");
  expect(host.textContent).not.toContain("Foreign wagon");
});
