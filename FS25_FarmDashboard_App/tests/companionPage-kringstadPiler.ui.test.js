/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "kringstadPiler";
const ui = loadCompanionPage(KEY, { title: "Sugar Beet Piler tare balance", group: "finance" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows a public piler's farm-specific obligation without claiming a charged fee", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.1.0.0" }] },
    companionPages: { pages: { [KEY]: { key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { pilerCount: 1, outstandingLiters: 275, pendingLiters: 55 } },
      rows: [
        { farmId: 1, placeableId: "shared", name: "Public beet piler",
          outstandingLiters: 275, pendingLiters: 55, feePerLiter: 0.5 },
        { farmId: 2, placeableId: "other", name: "Other farm piler",
          outstandingLiters: 999, pendingLiters: 0, feePerLiter: 0.5 },
      ] } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Public beet piler");
  expect(host.textContent).toContain("275 L");
  expect(host.textContent).toContain("Pending generation has not yet become physical tare");
  expect(host.textContent).not.toContain("Other farm piler");
  expect(host.textContent).not.toContain("999");
});

test("withholds a farm total when the ledger is incomplete", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true }] },
    companionPages: { pages: { [KEY]: { key: KEY, detected: true, readState: "partial",
      coverage: "partial", rows: [] } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("farm totals are withheld");
  expect(host.textContent).not.toContain("Pilers scanned");
});
