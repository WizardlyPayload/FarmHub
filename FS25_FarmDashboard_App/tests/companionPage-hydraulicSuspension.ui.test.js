/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "hydraulicSuspension";
const ui = loadCompanionPage(KEY, { title: "Hydraulic Suspension System", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("labels the offset as requested and excludes another farm's vehicle", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "2.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { enabledCount: 1, manualCount: 1, lockedCount: 0 } },
      rows: [
        { farmId: 1, vehicleId: "mine", vehicle: "Farm tractor", kind: "level",
          mode: "manual", requestedOffsetCm: 7 },
        { farmId: 2, vehicleId: "other", vehicle: "Foreign tractor", kind: "air",
          mode: "auto" },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Farm tractor");
  expect(host.textContent).toContain("7.0 cm");
  expect(host.textContent).toContain("not measured ride height");
  expect(host.textContent).not.toContain("Foreign tractor");
});
