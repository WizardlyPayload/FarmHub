/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "objectStorageExtension";
const ui = loadCompanionPage(KEY, { title: "Object Storage Extension", group: "storage" });

afterEach(() => { document.body.innerHTML = ""; });

test("renders owned capacity and trigger state, excluding foreign storage", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.2.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { ownedStorageCount: 1, inputDisabledCount: 1 } },
      rows: [
        { farmId: 1, placeableId: "owned", name: "Hay barn", configuredObjectCapacity: 350,
          acceptedObjectType: "bales", inputTriggerDisabled: true },
        { farmId: 2, placeableId: "foreign", name: "Other farm", configuredObjectCapacity: 900,
          acceptedObjectType: "pallets", inputTriggerDisabled: false },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Hay barn");
  expect(host.textContent).toContain("350");
  expect(host.textContent).toContain("Bales");
  expect(host.textContent).toContain("Disabled");
  expect(host.textContent).toContain("not free space or stored inventory");
  expect(host.textContent).not.toContain("Other farm");
});
