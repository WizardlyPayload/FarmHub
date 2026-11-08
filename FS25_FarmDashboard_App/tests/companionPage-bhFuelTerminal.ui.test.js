/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "bhFuelTerminal";
const ui = loadCompanionPage(KEY, { title: "BH Bulk Fuel Terminal", group: "storage" });

afterEach(() => { document.body.innerHTML = ""; });

test("renders owned terminal controls and lifetime counters without a sales claim", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.2.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { terminalCount: 1, loadedLiters: 1600,
        receivedLiters: 900, stoppedCount: 0, esdCount: 0 } },
      rows: [
        { farmId: 1, terminalId: "own", terminal: "East terminal", power: true,
          esd: false, openTanks: 5, loadedLiters: 1600, receivedLiters: 900,
          bays: [{mode: 3}, {mode: 0}] },
        { farmId: 2, terminalId: "foreign", terminal: "Other farm", power: false,
          esd: true, openTanks: 0, loadedLiters: 9999, receivedLiters: 9999,
          bays: [{mode: 0}, {mode: 0}] },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("East terminal");
  expect(host.textContent).toContain("Powered");
  expect(host.textContent).toContain("5 / 6");
  expect(host.textContent).toContain("Auto");
  expect(host.textContent).toContain("1,600");
  expect(host.textContent).toContain("do not prove a sale");
  expect(host.textContent).not.toContain("Other farm");
});
