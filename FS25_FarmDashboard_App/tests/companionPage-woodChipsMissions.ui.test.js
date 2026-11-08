/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "woodChipsMissions";
const ui = loadCompanionPage(KEY, { title: "Wood Chips Missions", group: "finance" });

afterEach(() => { document.body.innerHTML = ""; });

test("renders accepted farm's delivery target and excludes another farm", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.1.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { runningCount: 1 } },
      rows: [
        { farmId: 1, missionId: "mine", station: "Sawmill", expectedLitres: 20000,
          deliveredLitres: 7500, remainingLitres: 12500, progressPercent: 37.5 },
        { farmId: 2, missionId: "other", station: "Other farm station", expectedLitres: 30000,
          deliveredLitres: 25000, remainingLitres: 5000, progressPercent: 83.3 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Sawmill");
  expect(host.textContent).toContain("7,500 / 20,000 L");
  expect(host.textContent).toContain("not a payout");
  expect(host.textContent).not.toContain("Other farm station");
});
