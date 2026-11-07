/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "ritterFreshLoss";
const ui = loadCompanionPage(KEY, { title: "Ritter Fresh", group: "storage" });

function payload(page) {
  return {
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.1.0.0-dev.1" }] },
    companionPages: { pages: { [KEY]: { key: KEY, detected: true, ...page } } },
  };
}

afterEach(() => { document.body.innerHTML = ""; });

test("labels estimated expiry value and excludes another farm from the visible table", () => {
  const host = ui.renderPage(payload({
    readState: "ok", coverage: "complete",
    byFarm: { "1": { loggedLossCountScanned: 1, lostLitresScanned: 125 } },
    rows: [
      { farmId: 1, year: 2, period: 6, dayInPeriod: 3, hour: 14,
        fillTypeName: "TOMATO", amountLitres: 125, estimatedValue: 36, location: "Farm silo" },
      { farmId: 2, year: 2, period: 6, dayInPeriod: 3, hour: 14,
        fillTypeName: "WHEAT", amountLitres: 800, estimatedValue: 100, location: "Other farm" },
    ],
  }), { farmId: 1 });
  expect(host.querySelector('[data-stat="count"]').textContent).toContain("1");
  expect(host.querySelector('[data-stat="litres"]').textContent).toContain("125 L");
  expect(host.textContent).toContain("Estimated value at expiry");
  expect(host.textContent).toContain("not a sale, debit or realized expense");
  expect(host.textContent).toContain("TOMATO");
  expect(host.textContent).not.toContain("WHEAT");
  expect(host.textContent).not.toContain("Other farm");
});

test("truncated history never appears as a complete zero-loss claim", () => {
  const host = ui.renderPage(payload({
    readState: "ok", coverage: "truncated",
    byFarm: { "1": { loggedLossCountScanned: 0, lostLitresScanned: 0 } },
    rows: [],
  }), { farmId: 1 });
  expect(host.textContent).toContain("scanned window only");
  expect(host.textContent).toContain("No losses for this farm in the scanned part of the log");
});
