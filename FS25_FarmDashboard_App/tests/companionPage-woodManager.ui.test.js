/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "woodManager";
const ui = loadCompanionPage(KEY, { title: "Wood Manager", group: "storage" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows split-wood rule changes without claiming farm sales", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", scope: "save-wide", overrideCount: 1,
      rows: [{ splitType: "SPLITWOOD", title: "Split Wood", pricePerLitre: 1.25,
        defaultPricePerLitre: 1, woodChipsPerLitre: 0.4, defaultWoodChipsPerLitre: 0.3 }],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Split Wood");
  expect(host.textContent).toContain("save");
  expect(host.textContent).toContain("0.400");
  expect(host.textContent).toContain("0.300");
  expect(host.textContent).toContain("not this farm's wood sales");
});
