/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "bullMilkProduction";
const ui = loadCompanionPage(KEY, { title: "Bull Milk Production", group: "livestock" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows the calculated rate without claiming collected milk or sales", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "2.8.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { barnCount: 1, detectedBulls: 3, calculatedLitresPerHour: 19.5 } },
      rows: [{ farmId: 1, placeableId: "own", barn: "Own cow barn",
        detectedBulls: 3, calculatedLitresPerHour: 19.5 },
      { farmId: 2, placeableId: "other", barn: "Foreign barn",
        detectedBulls: 9, calculatedLitresPerHour: 100 }],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Own cow barn");
  expect(host.textContent).toContain("19.5 L/h");
  expect(host.textContent).toContain("The rate is not milk collected, sold or earned");
  expect(host.textContent).not.toContain("Foreign barn");
});

test("explains the uncaptured state without implying rates are inaccessible", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "2.8.0.0" }] },
    companionPages: { pages: { [KEY]: { key: KEY, detected: true,
      readState: "settings-only", reason: "no-captured-owned-cow-barn", rows: [] } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("No owned cow barn has a calculated Bull Milk rate yet.");
  expect(host.textContent).not.toContain("Only this mod's settings are readable");
});
