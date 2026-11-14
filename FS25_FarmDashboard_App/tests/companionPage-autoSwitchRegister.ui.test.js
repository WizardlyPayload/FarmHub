/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "autoSwitchRegister";
const ui = loadCompanionPage(KEY, { title: "AutoSwitch register", group: "fleet" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows owned weighings without rendering an old sale row as litres", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.3.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { weighingCount: 1, saleCount: 1 } },
      rows: [
        { kind: "weighing", farmId: 1, year: 4, period: 6, dayInPeriod: 2,
          minutes: 600, vehicle: "MF 8570", site: "Mill", loadKg: 8350, totalKg: 14600 },
        { kind: "sale", farmId: 1, year: 4, period: 6, dayInPeriod: 2,
          minutes: 605, fillType: "WHEAT", site: "Mill", litres: 2000, money: 2000 },
        { kind: "weighing", farmId: 2, year: 4, period: 6, dayInPeriod: 2,
          minutes: 610, vehicle: "Other farm", loadKg: 9999, totalKg: 9999 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("MF 8570");
  expect(host.textContent).toContain("8,350.0 kg");
  expect(host.textContent).toContain("Sale quantities are unavailable");
  expect(host.textContent).not.toContain("2,000 L");
  expect(host.textContent).not.toContain("Recorded sales");
  expect(host.textContent).not.toContain("Other farm");
});
