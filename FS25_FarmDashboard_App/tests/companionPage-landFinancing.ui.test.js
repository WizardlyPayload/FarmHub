/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "landFinancing";
const ui = loadCompanionPage(KEY, { title: "Land Financing", group: "finance" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows loan obligations with the payment-history caveat", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "30.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { loanCount: 1, outstandingBalance: 180000.25 } },
      rows: [
        { farmId: 1, id: 3, farmlandId: 36, balance: 180000.25,
          scheduledInstallment: 4605.23, remainingMonths: 42,
          termMonths: 48, annualRatePercent: 5, downPayment: 50000 },
        { farmId: 2, id: 4, farmlandId: 21, balance: 100000,
          scheduledInstallment: 4254.04, remainingMonths: 24,
          termMonths: 24, annualRatePercent: 2, downPayment: 0 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Farmland 36");
  expect(host.textContent).toContain("42 / 48");
  expect(host.textContent).toContain("5.00%");
  expect(host.textContent).toContain("payments made");
  expect(host.textContent).not.toContain("Farmland 21");
});
