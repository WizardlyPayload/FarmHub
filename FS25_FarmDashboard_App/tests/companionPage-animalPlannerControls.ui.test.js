/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "animalPlanner";
const ui = loadCompanionPage(KEY, { title: "Animal Planner", group: "livestock" });

afterEach(() => { document.body.innerHTML = ""; });

test("renders owned pen choices and explains they are not completed movements", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { ownedPenCount: 1, adjustmentCount: 1, routeCount: 1 } },
      rows: [
        { farmId: 1, penId: "owned", name: "Own dairy", kind: "animalOffset", amount: 10 },
        { farmId: 1, penId: "owned", name: "Own dairy", kind: "route", item: "Milk", mode: 1, featureEnabled: true },
        { farmId: 2, penId: "foreign", name: "Foreign barn", kind: "animalOffset", amount: 100 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Own dairy");
  expect(host.textContent).toContain("Animal capacity addition");
  expect(host.textContent).toContain("+10 animals");
  expect(host.textContent).toContain("Milk output route");
  expect(host.textContent).toContain("goods moved or sales occurred");
  expect(host.textContent).not.toContain("Foreign barn");
});
