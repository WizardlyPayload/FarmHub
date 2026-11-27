/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "fairLeasingPlus";
const ui = loadCompanionPage(KEY, { title: "Fair Leasing Plus", group: "finance" });

afterEach(() => { document.body.innerHTML = ""; });

test("renders one farm's reward and labels the saved-money estimate", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok",
      byFarm: {
        "1": { returnsCount: 5, points: 12, rank: "BRONZE", cleanReturns: 3,
          fullTankReturns: 2, estimatedUpfrontSaving: 1234.56, bonusDiscountPercent: 5,
          baseDiscountPercent: 15, dayDiscountPercent: 10, hourDiscountPercent: 13 },
        "2": { returnsCount: 20, points: 160, rank: "DIAMOND", estimatedUpfrontSaving: 99999 },
      },
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Estimated upfront fee saving");
  expect(host.textContent).toContain("BRONZE");
  expect(host.textContent).toContain("Clean returns");
  expect(host.textContent).toContain("15%");
  expect(host.textContent).not.toContain("DIAMOND");
  expect(host.textContent).not.toContain("99,999");
});
