/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "realDieselStart";
const ui = loadCompanionPage(KEY, { title: "Realistic Diesel Start", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("labels modeled heat and truck pressure without exposing another farm", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.3.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { vehicleCount: 1, airSystemCount: 1 } },
      rows: [
        { farmId: 1, vehicleId: "mine", vehicle: "Farm truck",
          residualHeatPercent: 25, airPressureBar: 6.75 },
        { farmId: 2, vehicleId: "other", vehicle: "Foreign truck",
          residualHeatPercent: 90, airPressureBar: 9 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Farm truck");
  expect(host.textContent).toContain("25.0%");
  expect(host.textContent).toContain("6.75 bar");
  expect(host.textContent).toContain("not measured engine temperature");
  expect(host.textContent).not.toContain("Foreign truck");
});
