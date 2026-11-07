/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "fieldToDoPlannedCrops";
const ui = loadCompanionPage(KEY, {title:"Field To-Do List",group:"fields"});

afterEach(() => { document.body.innerHTML = ""; });

test("shows current-owner plans without claiming authorship or completed work", () => {
  const host = ui.renderPage({
    companionMods:{mods:[{id:KEY,detected:true,version:"0.1.0.17"}]},
    companionPages:{pages:{[KEY]:{key:KEY,detected:true,readState:"ok",coverage:"complete",
      byFarm:{"1":{plannedCountScanned:1}},
      rows:[{farmId:1,fieldId:36,farmlandId:36,fruitTypeIndex:7,plannedCrop:"Sorghum"},
        {farmId:2,fieldId:37,farmlandId:37,fruitTypeIndex:8,plannedCrop:"Wheat"}]}}},
  }, {farmId:1});
  expect(host.textContent).toContain("Sorghum");
  expect(host.textContent).toContain("Plans may predate a change of owner");
  expect(host.textContent).toContain("task records are withheld");
  expect(host.textContent).not.toContain("Wheat");
});
