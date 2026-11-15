/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "vipOrderManager";
const ui = loadCompanionPage(KEY, { title: "VIP Order Manager", group: "finance" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows current local order progress and potential payout with distinct units", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.2.2.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { currentLevel: 3, itemCount: 2 } },
      rows: [
        { farmId: 1, fillType: "WHEAT", title: "Wheat", quantity: 10000,
          delivered: 2500, remaining: 7500, potentialPayout: 3000,
          isAnimal: false },
        { farmId: 1, fillType: "COW", title: "Dairy cow", quantity: 4,
          delivered: 1, remaining: 3, potentialPayout: 2000,
          isAnimal: true },
        { farmId: 2, fillType: "SECRET", title: "Foreign private order",
          quantity: 100, delivered: 0, remaining: 100, potentialPayout: 999999 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Wheat");
  expect(host.textContent).toContain("10,000 L");
  expect(host.textContent).toContain("4 animals");
  expect(host.textContent).toContain("not earned income");
  expect(host.textContent).not.toContain("Foreign private order");
});

test("does not claim an empty order when the reading is unavailable", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.2.2.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "unavailable", reason: "unreviewed-version",
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Waiting for data");
  expect(host.textContent).not.toContain("No current VIP order was recorded");
  expect(host.textContent).not.toContain("Current VIP order items");
});

test("shows no current order only for a confirmed empty reading", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.2.2.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "empty", reason: "no-current-order", rows: [],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("No current VIP order was recorded");
  expect(host.textContent).not.toContain("Waiting for data");
});
