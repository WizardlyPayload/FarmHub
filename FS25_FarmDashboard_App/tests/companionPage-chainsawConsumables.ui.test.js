/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "chainsawConsumables";
const ui = loadCompanionPage(KEY, { title: "Chainsaw Consumables", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows owned condition and does not imply work or service history", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { sawCount: 1 } },
      rows: [
        { farmId: 1, toolId: "own", tool: "Own saw", fuelLitres: 0.3,
          chainOilLitres: 0.15, sharpnessPercent: 80, chainLifePercent: 60,
          enginePercent: 95 },
        { farmId: 2, toolId: "foreign", tool: "Foreign saw", fuelLitres: 0.5 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Own saw");
  expect(host.textContent).toContain("0.30 L");
  expect(host.textContent).toContain("80%");
  expect(host.textContent).toContain("do not prove fuel consumed");
  expect(host.textContent).not.toContain("Foreign saw");
});
