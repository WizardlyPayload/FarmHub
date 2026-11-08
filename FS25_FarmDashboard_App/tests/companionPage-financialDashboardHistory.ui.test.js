/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "financialDashboardHistory";
const ui = loadCompanionPage(KEY, { title: "Financial Dashboard History", group: "finance" });

afterEach(() => { document.body.innerHTML = ""; });

test("labels observed balance movements as estimates and filters farm rows", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "2.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { sampleCount: 2, observedDays: 1, changedDays: 1,
        observedChanges: 1, lastSampleDay: 12, lastRecordedBalance: 950 } },
      recentDays: [{ farmId: 1, day: 12, observedInflow: 0,
        observedOutflow: 50, observedChanges: 1, closingBalance: 950 },
      { farmId: 2, day: 10, observedInflow: 900,
        observedOutflow: 0, observedChanges: 1, closingBalance: 1900 }],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("estimates from observed balance changes");
  expect(host.textContent).toContain("Changes while the game was closed are unknown");
  expect(host.textContent).toContain("Observed outflow");
  expect(host.textContent).not.toContain("1,900");
});
