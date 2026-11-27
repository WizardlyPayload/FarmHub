/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "adjustProductionPoints";
const ui = loadCompanionPage(KEY, { title: "Adjust Production Points", group: "storage" });

afterEach(() => { document.body.innerHTML = ""; });

test("renders changed owned values and explains their limits", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "partial", coverage: "complete",
      byFarm: { "1": { ownedPointCount: 1, changedRateCount: 1, adjustedCapacityCount: 1, mismatchCount: 1 } },
      rows: [
        { farmId: 1, placeableId: "own", name: "Own mill", kind: "cycles", item: "Flour", baseline: 528, current: 792 },
        { farmId: 1, placeableId: "own", name: "Own mill", kind: "fillCapacity", item: "Wheat", saved: 100, current: 120 },
        { farmId: 2, placeableId: "other", name: "Foreign mill", kind: "cycles", item: "Corn", baseline: 10, current: 20 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Own mill");
  expect(host.textContent).toContain("Flour");
  expect(host.textContent).toContain("792");
  expect(host.textContent).toContain("Wheat");
  expect(host.textContent).toContain("do not prove output or sales");
  expect(host.textContent).toContain("saved limit differs from the live capacity");
  expect(host.textContent).not.toContain("Foreign mill");
});
