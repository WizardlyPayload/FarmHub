/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "upgradeYourFactory";
const ui = loadCompanionPage(KEY);

afterEach(() => { document.body.innerHTML = ""; });

test("shows the owned level and labels next price as a preview", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.1.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { upgradableCount: 1, upgradedCount: 1 } },
      productions: [
        { farmId: 1, production: "Bakery", level: 3, maxLevel: 15, nextUpgradePrice: 13000 },
        { farmId: 2, production: "Foreign factory", level: 9, maxLevel: 15, nextUpgradePrice: 999999 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Bakery");
  expect(host.textContent).toContain("Next upgrade preview");
  expect(host.textContent).toContain("13,000");
  expect(host.textContent).not.toContain("Foreign factory");
  expect(host.textContent).not.toContain("999,999");
});
