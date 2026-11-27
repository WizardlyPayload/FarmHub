/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "supplyTransportContracts";
const ui = loadCompanionPage(KEY, { title: "Supply and Transport Contracts", group: "finance" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows one farm's target and potential reward without another farm's mission", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.3.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { runningCount: 1 } },
      rows: [
        { farmId: 1, missionId: "mine", destination: "Grain mill", fillType: "Wheat",
          expectedLitres: 20000, deliveredLitres: 7500, remainingLitres: 12500,
          listedReward: 4000 },
        { farmId: 2, missionId: "foreign", destination: "Other farm station", fillType: "Barley",
          expectedLitres: 30000, deliveredLitres: 25000, remainingLitres: 5000,
          listedReward: 6000 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Grain mill");
  expect(host.textContent).toContain("Wheat");
  expect(host.textContent).toContain("7,500 / 20,000 L");
  expect(host.textContent).toContain("not money received");
  expect(host.textContent).not.toContain("Other farm station");
});
