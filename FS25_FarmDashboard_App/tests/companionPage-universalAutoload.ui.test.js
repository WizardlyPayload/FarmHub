/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "universalAutoload";
const ui = loadCompanionPage(KEY, { title: "Universal Autoload", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("renders owned trailer choices without claiming completed loads", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.1.1.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { vehicleCount: 1, filteredCount: 1, collectionModeCount: 0 } },
      rows: [
        { farmId: 1, vehicleId: "owned", vehicle: "Owned trailer",
          material: "WHEAT", materialTitle: "Wheat", container: "EURO_PALLET",
          loadside: "both", tipside: "rear", loadingFilter: true,
          autoCollectionMode: false, horizontalLoading: false },
        { farmId: 2, vehicleId: "foreign", vehicle: "Other farm trailer",
          material: "ALL", container: "BALE", loadside: "left", tipside: "right" },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Owned trailer");
  expect(host.textContent).toContain("Wheat");
  expect(host.textContent).toContain("Euro pallet");
  expect(host.textContent).toContain("Rear");
  expect(host.textContent).toContain("do not prove a load was completed");
  expect(host.textContent).not.toContain("Other farm trailer");
});
