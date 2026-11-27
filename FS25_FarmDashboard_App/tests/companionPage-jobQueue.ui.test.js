/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "jobQueue";
const ui = loadCompanionPage(KEY, { title: "Job Queue", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows one farm's planned entries without implying completed work", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { vehicleCount: 1, entryCount: 2, armedCount: 1 } },
      rows: [
        { farmId: 1, vehicleId: "owned", vehicle: "MF 8570", position: 1,
          current: true, jobType: "FIELDWORK", fieldId: 36, running: true, waitReason: "REFILL" },
        { farmId: 1, vehicleId: "owned", vehicle: "MF 8570", position: 2,
          current: false, jobType: "GOTO", x: 162, z: -24, running: true },
        { farmId: 2, vehicleId: "foreign", vehicle: "Foreign tractor", position: 1,
          current: false, jobType: "FIELDWORK", fieldId: 91, running: true },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("MF 8570");
  expect(host.textContent).toContain("Field 36");
  expect(host.textContent).toContain("Map position 162, -24");
  expect(host.textContent).toContain("Waiting for refill");
  expect(host.textContent).toContain("do not prove a helper is working");
  expect(host.textContent).not.toContain("Foreign tractor");
});
