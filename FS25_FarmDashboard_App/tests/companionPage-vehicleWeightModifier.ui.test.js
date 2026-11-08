/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "vehicleWeightModifier";
const ui = loadCompanionPage(KEY, { title: "Vehicle Weight Modifier", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("renders only the selected farm's configured factors with a performance boundary", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.1" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { vehicleCount: 1 }, "2": { vehicleCount: 1 } },
      rows: [
        { farmId: 1, vehicleId: "owned-1", vehicle: "MF 8570", weightFactor: 1.5, brakeFactor: 1.2, engineFactor: 0.9 },
        { farmId: 2, vehicleId: "foreign-1", vehicle: "Foreign tractor", weightFactor: 10, brakeFactor: 3, engineFactor: 3 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("MF 8570");
  expect(host.textContent).toContain("1.5×");
  expect(host.textContent).toContain("not measured mass");
  expect(host.textContent).not.toContain("Foreign tractor");
});
