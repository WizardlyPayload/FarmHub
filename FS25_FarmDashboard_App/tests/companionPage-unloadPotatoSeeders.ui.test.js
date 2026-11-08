/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "unloadPotatoSeeders";
const ui = loadCompanionPage(KEY, { title: "Unload Potato Seeders", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows owned live unload selection without implying a completed unload", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.2" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { seederCount: 1, potatoCount: 0,
        seedsCount: 1, fertilizerCount: 0 } },
      rows: [
        { farmId: 1, vehicleId: "owned", vehicle: "Owned potato seeder",
          selectedUnload: "seeds", supportsFertilizer: true },
        { farmId: 2, vehicleId: "foreign", vehicle: "Other farm seeder",
          selectedUnload: "potato", supportsFertilizer: false },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Owned potato seeder");
  expect(host.textContent).toContain("Seeds");
  expect(host.textContent).toContain("resets on reload");
  expect(host.textContent).not.toContain("Other farm seeder");
});
