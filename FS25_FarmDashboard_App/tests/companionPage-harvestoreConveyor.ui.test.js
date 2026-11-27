/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "harvestoreConveyor";
const ui = loadCompanionPage(KEY, { title: "Harvestore Conveyor", group: "storage" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows this farm's in-transit material separately from silo stock", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "0.5.0.3" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { conveyorCount: 2, loadedConveyorCount: 1, inTransitLitres: 120 } },
      rows: [
        { farmId: 1, placeableId: "owned", silo: "Owned Harvestore", fillType: "SILAGE",
          inTransitLitres: 120, batchCount: 1, nextDeliverySeconds: 8, running: true },
        { farmId: 1, placeableId: "empty", silo: "Empty Harvestore",
          inTransitLitres: 0, batchCount: 0, running: false },
        { farmId: 2, placeableId: "foreign", silo: "Foreign Harvestore", fillType: "WHEAT",
          inTransitLitres: 999, batchCount: 2, nextDeliverySeconds: 5, running: true },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Owned Harvestore");
  expect(host.textContent).toContain("120 L");
  expect(host.textContent).toContain("8.0 s");
  expect(host.textContent).toContain("has left silo storage");
  expect(host.textContent).not.toContain("Foreign Harvestore");
  expect(host.textContent).not.toContain("Empty Harvestore");
  expect(host.textContent).not.toContain("Owned conveyors");
});

test("shows an empty queue without listing an idle building", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "0.5.0.3" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { conveyorCount: 1, loadedConveyorCount: 0, inTransitLitres: 0 } },
      rows: [{ farmId: 1, placeableId: "empty", silo: "Empty Harvestore",
        inTransitLitres: 0, batchCount: 0, running: false }],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("No material is queued");
  expect(host.textContent).not.toContain("Empty Harvestore");
  expect(host.textContent).not.toContain("Owned conveyors");
});
