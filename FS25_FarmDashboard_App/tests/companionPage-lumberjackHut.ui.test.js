/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "lumberjackHut";
const ui = loadCompanionPage(KEY, { title: "Lumberjack Hut", group: "storage" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows owned hut credit without calling it delivered wood", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.1" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { hutCount: 1, pendingLitres: 625.75, autoSuspendedCount: 0 } },
      rows: [{ farmId: 1, siteId: "101", site: "North Hut", farmlandId: 36,
        pendingLitres: 625.75, cycleProgressPercent: 50, autoSuspended: false }],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("North Hut");
  expect(host.textContent).toContain("625.75");
  expect(host.textContent).toContain("50.00%");
  expect(host.textContent).toContain("not stored, delivered or sold wood");
});

test("does not show a misleading aggregate when owned state is incomplete", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "partial", coverage: "partial",
      byFarm: { "1": {} }, rows: [],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("totals are withheld");
  expect(host.textContent).not.toContain("Owned huts1");
});
