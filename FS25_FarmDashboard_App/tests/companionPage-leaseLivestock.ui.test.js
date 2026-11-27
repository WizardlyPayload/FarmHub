/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "leaseLivestock";
const ui = loadCompanionPage(KEY, { title: "Lease Livestock", group: "livestock" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows selected farm leased groups and labels prospective charges", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { leasedAnimals: 5, estimatedPeriodCharge: 500 } },
      rows: [
        { farmId: 1, pen: "Cow Barn", animal: "HOLSTEIN", leasedCount: 5,
          ratePerAnimal: 100, estimatedPeriodCharge: 500 },
        { farmId: 2, pen: "Other Farm", animal: "SHEEP", leasedCount: 20,
          ratePerAnimal: 42, estimatedPeriodCharge: 840 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Cow Barn");
  expect(host.textContent).toContain("HOLSTEIN");
  expect(host.textContent).toContain("Estimated charge next period");
  expect(host.textContent).toContain("not a record of money paid");
  expect(host.textContent).not.toContain("Other Farm");
});
