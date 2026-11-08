/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "lockSteeringAxles";
const ui = loadCompanionPage(KEY, { title: "Lock Steering Axle", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows selected farm's trailer lock, not foreign equipment", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { compatibleTrailerCount: 1, lockedTrailerCount: 1 } },
      rows: [
        { farmId: 1, vehicleId: "owned", vehicle: "Owned trailer", steeringAxleLocked: true },
        { farmId: 2, vehicleId: "foreign", vehicle: "Foreign trailer", steeringAxleLocked: false },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Owned trailer");
  expect(host.textContent).toContain("Steering axles locked");
  expect(host.textContent).not.toContain("Foreign trailer");
});
