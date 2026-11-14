"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "ProductionAdvisorAlertsCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_ProductionAdvisor = true }
  _G.g_modManager = { getActiveMods = function() return { { modName = "FS25_ProductionAdvisor", version = "1.0.0.1" } } end }
  _G.g_currentMission = { getIsServer = function() return true end }
  _G.g_fillTypeManager = {
    getFillTypeByIndex = function(_, index)
      return ({ [5] = { name = "WHEAT", title = "Wheat" },
                 [6] = { name = "BARLEY", title = "Barley" } })[index]
    end,
  }
  _G.g_farmlandManager = { getFarmlandById = function(_, id)
    return ({ [12] = { farmId = 1 }, [13] = { farmId = 2 }, [14] = { farmId = 2 } })[id]
  end }
  _G.FS25_ProductionAdvisor = { g_productionAdvisor = {
    alertSettingsByFarmId = {
      [1] = { [5] = { threshold = 1600, enabled = true, mode = 1 },
              [6] = { threshold = 900, enabled = false, mode = 2 } },
      [2] = { [7] = { threshold = 5000, enabled = true, mode = 1 } },
    },
    farmlandSowingAlertsById = {
      [12] = { farmlandId = 12, farmId = 1, fruitTypeName = "OAT" },
      [13] = { farmlandId = 13, farmId = 2, fruitTypeName = "BARLEY" },
      [14] = { farmlandId = 14, farmId = 1, fruitTypeName = "CANOLA" },
    },
  } }
`;

test("exports selected-farm product settings and only currently owned field reminders", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    byFarm: { "1": { configuredCount: 3, enabledProductCount: 1, sowingCount: 1 } } });
  expect(page.rows).toHaveLength(3);
  expect(page.rows.find((row) => row.fillTypeIndex === 5))
    .toMatchObject({ kind: "product", title: "Wheat", threshold: 1600, enabled: true, mode: 1 });
  expect(page.rows.find((row) => row.fillTypeIndex === 6))
    .toMatchObject({ kind: "product", title: "Barley", threshold: 900, enabled: false, mode: 2 });
  expect(page.rows.find((row) => row.farmlandId === 12))
    .toMatchObject({ kind: "sowing", fruitTypeName: "OAT" });
  expect(JSON.stringify(page)).not.toMatch(/CANOLA|5000/);
  const merged = normalizeCompanionPages({ pages: { productionAdvisorAlerts: page } }, { modules: loadModules() });
  expect(merged.pages.productionAdvisorAlerts.rows).toHaveLength(3);
});

test("does not turn an empty or unready register into a no-alerts fact", () => {
  const empty = `
    _G.g_modIsLoaded = { FS25_ProductionAdvisor = true }
    _G.g_modManager = { getActiveMods = function() return { { modName = "FS25_ProductionAdvisor", version = "1.0.0.1" } } end }
    _G.g_currentMission = { getIsServer = function() return true end }
    _G.FS25_ProductionAdvisor = { g_productionAdvisor = {
      alertSettingsByFarmId = {}, farmlandSowingAlertsById = {},
    } }
  `;
  const page = runCompanionPage(FILE, empty, { farmId: 3 });
  expect(page).toMatchObject({ readState: "settings-only", reason: "no-verified-configured-alerts" });
  const noTable = empty.replace("alertSettingsByFarmId = {}", "alertSettingsByFarmId = false");
  expect(runCompanionPage(FILE, noTable, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "alerts-not-ready" });
});

test("withholds client and absent mod", () => {
  const client = SETUP.replace("getIsServer = function() return true end",
    "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-alerts-only" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
