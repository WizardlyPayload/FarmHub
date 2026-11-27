/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "multiplayerAchievements";
const ui = loadCompanionPage(KEY, {title:"Multiplayer Achievements",group:"finance"});

afterEach(() => { document.body.innerHTML = ""; });

test("labels farm eligibility counters separately from bank and personal progress", () => {
  const host = ui.renderPage({
    companionMods:{mods:[{id:KEY,detected:true,version:"1.0.0.0"}]},
    companionPages:{pages:{[KEY]:{key:KEY,detected:true,readState:"ok",coverage:"complete",
      byFarm:{"1":{eligibleBalance:1000,eligiblePeak:1800,eligibleCowsBred:3,
        eligibleSheepBred:2,eligiblePigsBred:1,eligibleChickensBred:4}}}}},
  }, {farmId:1});
  expect(host.textContent).toContain("Eligible balance now");
  expect(host.textContent).toContain("Eligible cows bred");
  expect(host.textContent).toContain("not the farm's bank balance or realized profit");
  expect(host.textContent).toContain("personal achievement file");
});
