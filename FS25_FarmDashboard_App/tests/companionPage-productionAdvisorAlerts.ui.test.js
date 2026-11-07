/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "productionAdvisorAlerts";
const ui = loadCompanionPage(KEY, { title: "Production Advisor", group: "storage" });

function payload(page) {
  return {
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.1" }] },
    companionPages: { pages: { [KEY]: { key: KEY, detected: true, ...page } } },
  };
}

afterEach(() => { document.body.innerHTML = ""; });

test("shows configured stock-value and owned-field reminders for the selected farm", () => {
  const host = ui.renderPage(payload({
    readState: "partial", coverage: "partial",
    byFarm: { "1": { configuredCount: 2, enabledProductCount: 1, sowingCount: 1 } },
    rows: [
      { farmId: 1, kind: "product", fillTypeIndex: 5, title: "Wheat",
        threshold: 1600, enabled: true, mode: 1 },
      { farmId: 1, kind: "sowing", farmlandId: 12, fruitTypeName: "OAT" },
      { farmId: 2, kind: "product", fillTypeIndex: 6, title: "Foreign barley",
        threshold: 9000, enabled: true, mode: 2 },
    ],
  }), { farmId: 1 });
  expect(host.querySelector('[data-stat="configured"]').textContent).toContain("2");
  expect(host.textContent).toContain("Minimum stock value");
  expect(host.textContent).toContain("Best price month");
  expect(host.textContent).toContain("Wheat");
  expect(host.textContent).toContain("OAT");
  expect(host.textContent).toContain("matching current owner were withheld");
  expect(host.textContent).not.toContain("Foreign barley");
});

test("empty register is shown as limited rather than proven absence", () => {
  const host = ui.renderPage(payload({
    readState: "settings-only", reason: "no-verified-configured-alerts",
    coverage: "complete", byFarm: { "1": { configuredCount: 0 } }, rows: [],
  }), { farmId: 1 });
  expect(host.textContent).toContain("Limited reading");
  expect(host.textContent).toContain("No verified product alert");
  expect(host.textContent).toContain("No verified reminder");
  expect(host.querySelector('[data-stat="configured"]')).toBeNull();
});
