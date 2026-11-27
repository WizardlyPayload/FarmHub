"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "UsedEquipmentYardsCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_359834_Used_Equipment_Yards = true }
  _G.FS25_359834_Used_Equipment_Yards = {
    UsedEquipmentYards = { yardManager = { yards = {
      [4] = { id = 4, name = "North Yard" },
      [7] = { id = 7, name = "South Yard" },
    } } },
    YardCredit = { data = {
      ["1_4"] = { balance = 1250 },
      ["1_7"] = { balance = 300 },
      ["2_4"] = { balance = 999999 },
      ["1_99"] = { balance = 888888 },
    } },
  }
  _G.g_currentMission = { getIsServer = function() return true end }
`;

test("exports only the active farm's credit at existing yards", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { creditedYards: 2, totalCredit: 1550 } } });
  expect(page.rows).toEqual([
    expect.objectContaining({ farmId: 1, yardId: 4, yard: "North Yard", credit: 1250 }),
    expect.objectContaining({ farmId: 1, yardId: 7, yard: "South Yard", credit: 300 }),
  ]);
  expect(JSON.stringify(page)).not.toMatch(/999999|888888/);
  expect(normalizeCompanionPages({ pages: { usedEquipmentYards: page } }, { modules: loadModules() })
    .pages.usedEquipmentYards.rows).toHaveLength(2);
});

test("withholds on clients and ignores an unrelated global shadow", () => {
  expect(runCompanionPage(FILE, SETUP.replace("return true", "return false"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-credit-only" });
  const shadow = `
    _G.g_modIsLoaded = { FS25_359834_Used_Equipment_Yards = true }
    _G.UsedEquipmentYards = { yardManager = { yards = { [4] = { id = 4 } } } }
    _G.YardCredit = { data = { ["1_4"] = { balance = 99 } } }
    _G.g_currentMission = { getIsServer = function() return true end }
  `;
  expect(runCompanionPage(FILE, shadow, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "no-yard-credit-state" });
});

test("withholds total credit when the yard scan stops before all yards", () => {
  const manyYards = SETUP + `
    local yards = _G.FS25_359834_Used_Equipment_Yards.UsedEquipmentYards.yardManager.yards
    local credit = _G.FS25_359834_Used_Equipment_Yards.YardCredit.data
    for i = 10, 90 do
      yards[i] = { id = i, name = "Yard " .. tostring(i) }
      credit["1_" .. tostring(i)] = { balance = 100 }
    end
  `;
  const page = runCompanionPage(FILE, manyYards, { farmId: 1 });
  expect(page.coverage).toBe("truncated");
  expect(page.byFarm["1"].totalCredit).toBeUndefined();
});
