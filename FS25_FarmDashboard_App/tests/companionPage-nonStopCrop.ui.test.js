/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "nonStopCrop";
const ui = loadCompanionPage(KEY, { title: "Non-Stop Crop", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("renders owned route selection without treating it as transferred crop", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { sourceCount: 2, enabledCount: 1, ownedTargetCount: 1 } },
      rows: [
        { farmId: 1, vehicleId: "combine", vehicle: "MF Combine", enabled: true,
          destinationType: "silo", destinationStatus: "owned", destination: "Farm silo" },
        { farmId: 1, vehicleId: "wagon", vehicle: "Wagon", enabled: false,
          destinationType: "vehicle", destinationStatus: "unavailable" },
        { farmId: 2, vehicleId: "foreign", vehicle: "Other vehicle", enabled: true },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("MF Combine");
  expect(host.textContent).toContain("Silo · Farm silo");
  expect(host.textContent).toContain("Saved target unavailable to this farm");
  expect(host.textContent).toContain("does not prove");
  expect(host.textContent).not.toContain("Other vehicle");
});
