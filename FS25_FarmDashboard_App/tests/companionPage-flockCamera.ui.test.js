/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "flockCamera";
const ui = loadCompanionPage(KEY, { title: "Flock Camera", group: "construction" });

afterEach(() => { document.body.innerHTML = ""; });

test("renders owned camera state and untimed history without foreign-farm rows", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { cameraCount: 1 }, "2": { cameraCount: 1 } },
      rows: [
        { farmId: 1, placeableId: "owned", name: "North yard camera", fallen: false,
          ledMode: 2, alertMode: 1, events: ["Detected MF 8570 (12 km/h)"] },
        { farmId: 2, placeableId: "foreign", name: "Other farm secret", fallen: true,
          ledMode: 0, alertMode: 2, events: ["Other farm event"] },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("North yard camera");
  expect(host.textContent).toContain("Detected MF 8570 (12 km/h)");
  expect(host.textContent).toContain("not a video feed");
  expect(host.textContent).not.toContain("Other farm secret");
  expect(host.textContent).not.toContain("Other farm event");
});
