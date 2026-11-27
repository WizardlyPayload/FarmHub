/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "fieldContractors";
const ui = loadCompanionPage(KEY, { title: "Field Contractors", group: "finance" });

afterEach(() => { document.body.innerHTML = ""; });

test("labels agreed cost and progress without leaking another farm's job", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.5.3.1" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { currentClaimCount: 1 } },
      rows: [
        { farmId: 1, claimId: 4, fieldId: 36, fieldLabel: "Field 36",
          workType: "harvest", workLabel: "Harvest", agreedPrice: 1800,
          areaHa: 3.5, processedAreaHa: 1.25, phase: "working" },
        { farmId: 2, claimId: 5, fieldId: 37, workLabel: "Foreign private job",
          agreedPrice: 999999, areaHa: 9, processedAreaHa: 8 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Field 36");
  expect(host.textContent).toContain("Agreed prices are quoted costs");
  expect(host.textContent).toContain("Processed (ha)");
  expect(host.textContent).not.toContain("Foreign private job");
});
