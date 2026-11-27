/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "cropRotationPlanner";
const ui = loadCompanionPage(KEY, { title: "Crop Rotation", group: "fields" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows this farm's named steps without another farm's plan or yield claim", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.1.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { planCount: 1, stepCount: 2 }, "2": { planCount: 1, stepCount: 1 } },
      rows: [
        { farmId: 1, planIndex: 7, planName: "North farm", step: 1, crop: "Wheat", catchCrop: "Oilseed Radish" },
        { farmId: 1, planIndex: 7, planName: "North farm", step: 2, crop: "Canola", catchCrop: "None" },
        { farmId: 2, planIndex: 8, planName: "Secret other farm", step: 1, crop: "Barley", catchCrop: "None" },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("North farm");
  expect(host.textContent).toContain("Oilseed Radish");
  expect(host.textContent).toContain("plans, not assignments");
  expect(host.textContent).not.toContain("Secret other farm");
  expect(host.textContent).not.toContain("Barley");
});
