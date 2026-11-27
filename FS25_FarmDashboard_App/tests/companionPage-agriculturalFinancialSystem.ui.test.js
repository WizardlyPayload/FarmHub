/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "agriculturalFinancialSystem";
const ui = loadCompanionPage(KEY, { title: "Agricultural Financial System", group: "finance" });

afterEach(() => { document.body.innerHTML = ""; });

function payload(coverage) {
  return {
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.2.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: coverage === "complete" ? "ok" : "partial", coverage,
      byFarm: { "1": {
        bankBalance: 3500, entryCount: 2, overdueCount: 1,
        ...(coverage === "complete" ? { payableBalance: 1030, receivableBalance: 600 } : {}),
      } },
      rows: [
        { farmId: 1, id: "P-1", kind: "payable", status: "overdue", instrument: "promissoryNote",
          description: "Seed order", counterparty: "Supplier", balance: 1030, dueDay: 14, voucherNumber: 7 },
        { farmId: 1, id: "R-1", kind: "receivable", status: "pending", instrument: "currentAccount",
          description: "Grain sale", counterparty: "Mill", balance: 600, voucherNumber: 12 },
        { farmId: 2, id: "P-9", kind: "payable", status: "open", instrument: "cheque",
          description: "Another farm's bill", balance: 90000, dueDay: 17 },
      ],
    } } },
  };
}

test("renders only the selected farm's unsettled decisions and keeps the mod bank separate", () => {
  const host = ui.renderPage(payload("complete"), { farmId: 1 });
  expect(host.textContent).toContain("Separate mod bank balance");
  expect(host.textContent).toContain("3,500");
  expect(host.textContent).toContain("Remaining to pay");
  expect(host.textContent).toContain("1,030");
  expect(host.textContent).toContain("Seed order / Supplier");
  expect(host.textContent).toContain("P-0007");
  expect(host.textContent).toContain("14");
  expect(host.textContent).toContain("Grain sale / Mill");
  expect(host.textContent).toContain("R-0012");
  expect(host.textContent).not.toContain("Another farm's bill");
  expect(host.textContent).not.toContain("90,000");
});

test("withholds obligation totals when the farm register is incomplete", () => {
  const host = ui.renderPage(payload("partial"), { farmId: 1 });
  expect(host.textContent).toContain("Invalid records were withheld; totals are unavailable.");
  expect(host.textContent).toContain("Seed order / Supplier");
  expect(host.textContent).not.toContain("Remaining to pay");
  expect(host.textContent).not.toContain("Remaining to receive");
});
