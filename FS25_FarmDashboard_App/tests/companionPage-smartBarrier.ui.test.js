/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "smartBarrier";
const ui = loadCompanionPage(KEY, { title: "Smart Barrier Pack", group: "construction" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows mode, configured hours and live arm state separately for owned barriers", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { barrierCount: 2, automaticCount: 1, openCount: 1, warningCount: 1 } },
      rows: [
        { farmId: 1, barrierId: "a", barrier: "West gate", automatic: true,
          scheduleEnabled: true, scheduleStartHour: 8, scheduleEndHour: 18,
          position: "open", warning: false },
        { farmId: 1, barrierId: "b", barrier: "South gate", automatic: false,
          scheduleEnabled: false, scheduleStartHour: 0, scheduleEndHour: 24,
          position: "partway", warning: true },
        { farmId: 2, barrierId: "c", barrier: "Foreign gate", automatic: true,
          scheduleEnabled: true, scheduleStartHour: 0, scheduleEndHour: 24,
          position: "closed", warning: false },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("West gate");
  expect(host.textContent).toContain("South gate");
  expect(host.textContent).toContain("Automatic");
  expect(host.textContent).toContain("Partway");
  expect(host.textContent).toContain("8–18");
  expect(host.textContent).toContain("a setting, not proof");
  expect(host.textContent).not.toContain("Foreign gate");
});
