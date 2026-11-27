/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "shopRefund";
const ui = loadCompanionPage(KEY, { title: "Shop Refund", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows tracked candidates without promising the dealer payout", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "partial", coverage: "partial",
      byFarm: { "1": { candidateCount: 1, withheldCount: 1 } },
      rows: [
        { farmId: 1, vehicleId: "t1", vehicle: "Current tractor",
          recordedPriceBasis: 80000, operatingMinutesUsed: 10, operatingMinutesLeft: 20 },
        { farmId: 2, vehicleId: "f1", vehicle: "Other farm truck",
          recordedPriceBasis: 250000, operatingMinutesUsed: 0, operatingMinutesLeft: 30 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Current tractor");
  expect(host.textContent).toContain("20");
  expect(host.textContent).toContain("not a guaranteed payout");
  expect(host.textContent).not.toContain("Other farm truck");
});
