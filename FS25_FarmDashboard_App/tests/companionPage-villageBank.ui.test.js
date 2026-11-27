/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const ui = loadCompanionPage("villageBank", { title: "Village Bank", group: "finance" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows the selected farm's separate account and journal without another farm's money", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: "villageBank", detected: true, version: "1.6.0.0" }] },
    companionPages: { pages: { villageBank: {
      key: "villageBank", detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { subaccountCount: 1, depositCount: 0, financeCount: 0, leaseCount: 0,
        transactionCount: 1 } },
      accounts: [
        { farmId: 1, id: 2, name: "Test reserve", balance: 1000 },
        { farmId: 2, id: 3, name: "Other farm reserve", balance: 90000 },
      ],
      deposits: [], contracts: [],
      transactions: [{ farmId: 1, type: "Transfer", source: "Farm account",
        target: "Test reserve", amount: -1000, day: 1 }],
    } } },
  }, { farmId: 1 });

  expect(host.textContent).toContain("Extra account balances");
  expect(host.textContent).toContain("Test reserve");
  expect(host.textContent).toContain("1,000");
  expect(host.textContent).toContain("Farm account / Test reserve");
  expect(host.textContent).not.toContain("Other farm reserve");
  expect(host.textContent).not.toContain("90,000");
});
