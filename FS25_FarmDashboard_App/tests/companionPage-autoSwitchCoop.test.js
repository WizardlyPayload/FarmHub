"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "AutoSwitchCoopCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { KM_82844_AutoSwitch = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_82844_AutoSwitch", version = "1.0.3.0" }
  } end }
  _G.g_currentMission = { getIsServer = function() return true end }
  _G.AS_CoopPay = { ENABLED = true, scanned = true,
    owed = { [1] = { money = 1425.75, key = 406 }, [2] = { money = 999999, key = 406 } } }
`;

test("exports only the selected farm's pending cooperative payment", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { pendingAmount: 1425.75, saleYear: 4, salePeriod: 6 } } });
  expect(JSON.stringify(page)).not.toContain("999999");
});

test("withholds uninitialized, client, unreviewed and malformed state", () => {
  expect(runCompanionPage(FILE, GAME.replace("scanned = true", "scanned = false"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "coop-register-unavailable" });
  expect(runCompanionPage(FILE, GAME.replace("return true", "return false"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-register-only" });
  expect(runCompanionPage(FILE, GAME.replace("1.0.3.0", "9.9.9.9"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  const malformed = runCompanionPage(FILE, GAME.replace("money = 1425.75", "money = 0/0"), { farmId: 1 });
  expect(malformed).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(malformed.byFarm).toBeUndefined();
});
