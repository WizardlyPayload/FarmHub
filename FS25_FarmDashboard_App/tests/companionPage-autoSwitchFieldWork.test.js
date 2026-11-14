"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const FILE = "AutoSwitchFieldWorkCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { KM_82844_AutoSwitch = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_82844_AutoSwitch", version = "1.0.3.0" }
  } end }
  _G.g_currentMission = { getIsServer = function() return true end }
  local fields = {
    { farmland = { id = 11 }, getId = function() return 11 end },
    { farmland = { id = 12 }, getId = function() return 12 end },
  }
  _G.g_fieldManager = { getFields = function() return fields end }
  _G.g_farmlandManager = { getFarmlandOwner = function(_, id)
    return id == 11 and 1 or 2
  end }
  _G.g_fruitTypeManager = { getFruitTypeByIndex = function(_, index)
    return index == 7 and { name = "WHEAT", title = "Wheat" } or nil
  end }
  _G.AS_Fields = { records = {
    [11] = {
      sow = { date = { mday = 42, year = 3, period = 6, dayInPeriod = 2 }, fruit = 7 },
      fert = { date = { mday = 43, year = 3, period = 6, dayInPeriod = 3 }, n = 2, fill = "LIME" },
      herb = { date = { mday = 44, year = 3, period = 6, dayInPeriod = 4 } },
    },
    [12] = { sow = { date = { mday = 42, year = 3, period = 6, dayInPeriod = 2 }, fruit = 7 } },
  } }
`;

test("exports dated field history for currently owned land only", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { recordedFieldCount: 1 } } });
  expect(page.rows).toEqual([expect.objectContaining({ farmId: 1, fieldId: 11,
    crop: "Wheat", fertiliser: "LIME", fertiliserPasses: 2,
    sown: expect.objectContaining({ year: 3, period: 6, dayInPeriod: 2 }),
  })]);
  expect(JSON.stringify(page)).not.toContain('"fieldId":12');
  const other = runCompanionPage(FILE, GAME, { farmId: 2 });
  expect(other).toMatchObject({ readState: "ok",
    byFarm: { "2": { recordedFieldCount: 1 } } });
  expect(other.rows).toEqual([expect.objectContaining({ farmId: 2, fieldId: 12 })]);
  expect(JSON.stringify(other)).not.toContain('"fieldId":11');
});

test("withholds totals for unresolved field history or invalid owned date", () => {
  const unresolved = runCompanionPage(FILE, GAME.replace("[12] =", "[99] ="), { farmId: 1 });
  expect(unresolved).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(unresolved.byFarm).toBeUndefined();
  const invalid = runCompanionPage(FILE, GAME.replace("mday = 42", "mday = 0"), { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(invalid.byFarm).toBeUndefined();
});

test("requires exact reviewed version and server state", () => {
  expect(runCompanionPage(FILE, GAME.replace("1.0.3.0", "9.9.9.9"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, GAME.replace("getIsServer = function() return true", "getIsServer = function() return false"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-field-history-only" });
});
