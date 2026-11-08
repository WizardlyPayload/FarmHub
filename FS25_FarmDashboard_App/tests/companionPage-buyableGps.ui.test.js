/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "buyableGps";
const ui = loadCompanionPage(KEY, { title: "Buyable GPS", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows owned GPS purchase state without foreign vehicles", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { configurableVehicleCount: 1, gpsInstalledCount: 1 } },
      rows: [
        { farmId: 1, vehicleId: "owned", vehicle: "Owned tractor", gpsInstalled: true },
        { farmId: 2, vehicleId: "foreign", vehicle: "Foreign tractor", gpsInstalled: false },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Owned tractor");
  expect(host.textContent).toContain("GPS installed");
  expect(host.textContent).not.toContain("Foreign tractor");
});
