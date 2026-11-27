/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "automaticBaleStorage";
const ui = loadCompanionPage(KEY, { title: "Automatic Bale Storage", group: "storage" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows only this farm's pending unload requests without implying delivery", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.3" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { ownedStorageCount: 2, queuedStorageCount: 1, pendingUnload: 8 } },
      rows: [{ farmId: 1, placeableId: "own", storage: "Farm bale shed", pendingUnload: 8 },
        { farmId: 2, placeableId: "other", storage: "Foreign shed", pendingUnload: 99 }],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Farm bale shed");
  expect(host.textContent).toContain("Objects still queued");
  expect(host.textContent).toContain("They are not delivered objects or the number stored");
  expect(host.textContent).not.toContain("Foreign shed");
});
