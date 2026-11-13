/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "marketPriceHelper";
const ui = loadCompanionPage(KEY, { title: "Market Price Helper", group: "finance" });

afterEach(() => { document.body.innerHTML = ""; });

test("labels observed market samples without presenting sales or income", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.1" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", scope: "save-wide", fillTypeCount: 1,
      rows: [{ fillType: "SORGHUM", title: "Sorghum",
        latest: { pricePerLitre: 0.81, day: 4, hour: 9, period: 2 },
        lowPricePerLitre: 0.72, highPricePerLitre: 0.81, sampleCount: 2 }],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Sorghum");
  expect(host.textContent).toContain("Best selling-station price observations held by the mod");
  expect(host.textContent).toContain("not this farm's sales, income or stock");
  expect(host.textContent).toContain("4 · 09:00");
});
