/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "rentYourField";
const ui = loadCompanionPage(KEY, { title: "Rent Your Field", group: "finance" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows only selected farm agreement and identifies estimates", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "partial", coverage: "partial",
      byFarm: { "1": { activeCount: 1, projectedMonthlyRent: 2400 } },
      rows: [
        { farmId: 1, farmlandId: 36, elapsedMonths: 3, remainingMinimumMonths: 9,
          projectedMonthlyRent: 2400, estimatedTerminationPenalty: 10800 },
        { farmId: 2, farmlandId: 37, elapsedMonths: 1, remainingMinimumMonths: 11,
          projectedMonthlyRent: 9000, estimatedTerminationPenalty: 49000 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Projected monthly rent");
  expect(host.textContent).toContain("not payments received or charged");
  expect(host.textContent).toContain("#36");
  expect(host.textContent).not.toContain("#37");
});
