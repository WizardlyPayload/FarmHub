/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "twoRotorRakeControl";
const ui = loadCompanionPage(KEY, { title: "Universal Two-Rotor Rake Control", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows left/right targets as targets and excludes foreign farm", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.15" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { independentCount: 1, splitTargetCount: 1 } },
      rows: [
        { farmId: 1, vehicleId: "mine", vehicle: "Farm rake", leftTarget: "lifted", rightTarget: "lowered" },
        { farmId: 2, vehicleId: "foreign", vehicle: "Foreign rake", leftTarget: "lifted", rightTarget: "lifted" },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Farm rake");
  expect(host.textContent).toContain("Left target");
  expect(host.textContent).toContain("Right target");
  expect(host.textContent).toContain("not prove the rotor reached it");
  expect(host.textContent).not.toContain("Foreign rake");
});
