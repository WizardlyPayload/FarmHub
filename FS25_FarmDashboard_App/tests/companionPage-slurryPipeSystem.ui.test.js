/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "slurryPipeSystem";
const ui = loadCompanionPage(KEY);

afterEach(() => { document.body.innerHTML = ""; });

test("shows only selected-farm slurry condition and labels the mod estimate", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.1.7" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { activeStores: 1 } },
      stores: [
        { farmId: 1, placeable: "Farm lagoon", storeId: 3,
          settlingPercent: 42, dryMatterPoolLitres: 120 },
        { farmId: 2, placeable: "Other farm lagoon", storeId: 9,
          settlingPercent: 90, dryMatterPoolLitres: 999999 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Farm lagoon");
  expect(host.textContent).toContain("42");
  expect(host.textContent).toContain("120");
  expect(host.textContent).toContain("mod estimate");
  expect(host.textContent).not.toContain("Other farm lagoon");
  expect(host.textContent).not.toContain("999999");
});
