/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "autoSwitchTireLife";
const ui = loadCompanionPage(KEY, { title: "AutoSwitch tire life", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("labels live and saved wheel readings without presenting them as repairs", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.3.0" }] },
    companionPages: { pages: { [KEY]: { key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { shownWheelReadings: 2 } },
      rows: [
        { farmId: 1, vehicleId: "tractor", vehicle: "My tractor", wheelConfiguration: 1,
          wheelIndex: 1, wearPct: 25, cut: false, reading: "live" },
        { farmId: 1, vehicleId: "tractor", vehicle: "My tractor", wheelConfiguration: 2,
          wheelIndex: 1, wearPct: 30, cut: true, reading: "saved" },
        { farmId: 2, vehicleId: "other", vehicle: "Other farm", wheelConfiguration: 1,
          wheelIndex: 1, wearPct: 99, cut: true, reading: "live" },
      ] } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("My tractor");
  expect(host.textContent).toContain("Live wheel");
  expect(host.textContent).toContain("Saved wheel set");
  expect(host.textContent).toContain("25.0%");
  expect(host.textContent).not.toContain("Other farm");
});

test("does not show a current wear value when the module is inactive", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.3.0" }] },
    companionPages: { pages: { [KEY]: { key: KEY, detected: true,
      readState: "settings-only", reason: "tire-module-inactive" } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("not active in this game");
  expect(host.textContent).not.toContain("Shown wheel readings");
});
