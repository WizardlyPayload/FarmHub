/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "farmContractorServices";
const ui = loadCompanionPage(KEY, { title: "Farm Contractor Services", group: "finance" });

afterEach(() => { document.body.innerHTML = ""; });

test("renders booking state and price without implying finished work or leaking another farm", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "3.0.1.1" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { currentOrderCount: 1 } },
      rows: [
        { farmId: 1, orderId: 8, farmlandId: 36, fieldName: "Field 36",
          service: "HARVEST", state: "BOOKED", bookedPrice: 2400,
          areaHa: 4.75 },
        { farmId: 2, orderId: 9, farmlandId: 37,
          fieldName: "Private foreign order", state: "RUNNING",
          bookedPrice: 9000, areaHa: 8 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Field 36");
  expect(host.textContent).toContain("BOOKED");
  expect(host.textContent).toContain("not proof of completed work or final cost");
  expect(host.textContent).not.toContain("Private foreign order");
});

test("unreadable work orders do not produce a false empty-farm claim", () => {
  for (const page of [
    { readState: "partial", coverage: "partial", rows: [] },
    { readState: "partial", coverage: "truncated", rows: [] },
    { readState: "partial", reason: "persistence-recovery-error" },
  ]) {
    const host = ui.renderPage({
      companionMods: { mods: [{ id: KEY, detected: true, version: "3.0.1.1" }] },
      companionPages: { pages: { [KEY]: { key: KEY, detected: true, ...page } } },
    }, { farmId: 1 });
    expect(host.textContent).toContain("total is withheld");
    expect(host.textContent).not.toContain("No current contractor work order was recorded");
  }
});
