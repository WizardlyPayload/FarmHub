/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "kiselevkaAuction";
const ui = loadCompanionPage(KEY, { title: "Kiselevka farmland auction", group: "finance" });

afterEach(() => { document.body.innerHTML = ""; });

test("labels the live export snapshot and selected farm status", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.1.3" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { farmlandId: 42, currentPrice: 125000,
        remainingGameHours: 2, leading: true } },
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Farmland");
  expect(host.textContent).toContain("125,000");
  expect(host.textContent).toContain("currently leads");
  expect(host.textContent).toContain("last export");
});
