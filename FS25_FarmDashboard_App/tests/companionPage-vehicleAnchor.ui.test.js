/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "vehicleAnchor";
const ui = loadCompanionPage(KEY, { title: "Vehicle Anchor", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("separates saved choice from live joint and excludes foreign rows", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { supportedCount: 2, anchoredCount: 2, appliedCount: 1 } },
      rows: [
        { farmId: 1, vehicleId: "a", vehicle: "Applied tractor", applied: true },
        { farmId: 1, vehicleId: "b", vehicle: "Pending tractor", applied: false },
        { farmId: 2, vehicleId: "c", vehicle: "Foreign tractor", applied: true },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Applied tractor");
  expect(host.textContent).toContain("Pending tractor");
  expect(host.textContent).toContain("Joint applied now");
  expect(host.textContent).toContain("neither state proves field work");
  expect(host.textContent).not.toContain("Foreign tractor");
});
