/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "greenhouseAutomaticWatering";
const ui = loadCompanionPage(KEY, { title: "Greenhouse Automatic Watering", group: "storage" });

afterEach(() => { document.body.innerHTML = ""; });

test("renders owned on/off switches without other farms or delivery claims", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { eligibleCount: 2, enabledCount: 1 } },
      rows: [
        { farmId: 1, placeableId: "on", name: "Owned greenhouse", enabled: true },
        { farmId: 1, placeableId: "off", name: "Owned disabled", enabled: false },
        { farmId: 2, placeableId: "foreign", name: "Foreign greenhouse", enabled: true },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Owned greenhouse");
  expect(host.textContent).toContain("Owned disabled");
  expect(host.textContent).toContain("On");
  expect(host.textContent).toContain("Off");
  expect(host.textContent).toContain("does not prove that water was added");
  expect(host.textContent).not.toContain("Foreign greenhouse");
});
