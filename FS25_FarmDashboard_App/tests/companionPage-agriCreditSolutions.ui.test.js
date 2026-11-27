/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "agriCreditSolutions";
const ui = loadCompanionPage(KEY, { title: "AgriCredit Solutions", group: "finance" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows selected farm building terms without exposing another farm", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "partial", coverage: "partial",
      byFarm: { "1": { linkedCount: 1, unlinkedCount: 1 } },
      rows: [
        { farmId: 1, id: "a", building: "Milking barn", termMonths: 24,
          paymentsMade: 4, deposit: 10000, scheduledDue: 3600,
          payoffAmount: 71000, latePaymentCount: 1 },
        { farmId: 2, id: "b", building: "Other farm barn", termMonths: 12,
          paymentsMade: 0, deposit: 100, payoffAmount: 10000 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Milking barn");
  expect(host.textContent).toContain("4 / 24");
  expect(host.textContent).toContain("Unlinked farm agreements");
  expect(host.textContent).toContain("withheld from this table");
  expect(host.textContent).not.toContain("Other farm barn");
});

test("a truncated source scan does not display a partial count as the farm total", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "partial", coverage: "truncated",
      rows: [{ farmId: 1, id: "a", building: "Milking barn",
        termMonths: 24, paymentsMade: 4, payoffAmount: 71000 }],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Milking barn");
  expect(host.textContent).toContain("Only some agreements or buildings were scanned");
  expect(host.textContent).not.toContain("Owned buildings financed");
});
