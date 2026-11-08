/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "soilCompostBatches";
const ui = loadCompanionPage(KEY, { title: "Soil & Fertilizer compost batches", group: "storage" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows only this farm's open batches and labels output as expected", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "2.6.0.3" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { batchCount: 2, readyCount: 1, expectedOutputLitres: 570 } },
      rows: [
        { farmId: 1, batchId: 7, daysRemaining: 5, outputLitres: 450, ready: false, organicSafe: true },
        { farmId: 1, batchId: 8, daysRemaining: 0, outputLitres: 120, ready: true, organicSafe: false },
        { farmId: 2, batchId: 9, daysRemaining: 0, outputLitres: 900, ready: true, organicSafe: true },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Expected output");
  expect(host.textContent).toContain("570 L");
  expect(host.textContent).toContain("5 in-game days left");
  expect(host.textContent).toContain("not compost already delivered to storage");
  expect(host.textContent).not.toContain("900 L");
});
