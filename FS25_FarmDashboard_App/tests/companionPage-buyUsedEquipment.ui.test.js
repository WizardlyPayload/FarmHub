/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "buyUsedEquipment";
const ui = loadCompanionPage(KEY, { title: "Buy Used Equipment", group: "finance" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows selected farm's pending search without implying an offer", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.1.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { pendingSearchCount: 1 } },
      rows: [
        { farmId: 1, queueIndex: 1, equipment: "Owned tractor", equipmentXml: "owned.xml", searchLevel: "Normal", hoursRemaining: 10 },
        { farmId: 2, queueIndex: 1, equipment: "Foreign tractor", equipmentXml: "foreign.xml", searchLevel: "Extended", hoursRemaining: 5 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Owned tractor");
  expect(host.textContent).toContain("Pending searches");
  expect(host.textContent).toContain("its result is not guaranteed");
  expect(host.textContent).not.toContain("Foreign tractor");
});
