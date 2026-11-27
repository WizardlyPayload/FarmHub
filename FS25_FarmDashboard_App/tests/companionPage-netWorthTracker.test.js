"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "NetWorthTrackerCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_339475_FS25_netWorthTracker = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_339475_FS25_netWorthTracker", version = "1.1.0.3" }
  } end }
  _G.FS25_339475_FS25_netWorthTracker = { g_nwt_historyManager = { histories = {
    { farmId = 1, dayId = 42, periodId = 6, dayInPeriod = 2, year = 2, category = "total", amount = 104500.25 },
    { farmId = 2, dayId = 42, periodId = 6, dayInPeriod = 2, year = 2, category = "total", amount = 999999 },
    { farmId = 1, dayId = 41, periodId = 6, dayInPeriod = 1, year = 2, category = "total", amount = 102000 },
    { farmId = 1, dayId = 40, category = "other", amount = 400 },
  } } }
`;

test("reads only dated net-worth samples belonging to the export farm", () => {
    const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
    expect(page).toMatchObject({ readState: "ok", coverage: "complete",
        byFarm: { "1": { sampleCount: 2 } } });
    expect(page.rows).toEqual([
        expect.objectContaining({ farmId: 1, dayId: 42, year: 2, period: 6,
            dayInPeriod: 2, amount: 104500.25 }),
        expect.objectContaining({ farmId: 1, dayId: 41, amount: 102000 }),
    ]);
    expect(normalizeCompanionPages({ pages: { netWorthTracker: page } }, { modules: loadModules() })
        .pages.netWorthTracker.rows).toHaveLength(2);
});

test("does not read an unrelated global shadow or an unloaded mod", () => {
    const shadow = `
      _G.g_modIsLoaded = { FS25_339475_FS25_netWorthTracker = true }
      _G.g_modManager = { getActiveMods = function() return {
        { modName = "FS25_339475_FS25_netWorthTracker", version = "1.1.0.3" }
      } end }
      _G.g_nwt_historyManager = { histories = { { farmId = 1, dayId = 2, category = "total", amount = 9 } } }
    `;
    expect(runCompanionPage(FILE, shadow, { farmId: 1 })).toMatchObject({
        readState: "settings-only", reason: "no-history-manager",
    });
    expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});

test("withholds history from an unreviewed descriptor version", () => {
    const laterVersion = SETUP.replace('version = "1.1.0.3"', 'version = "1.1.0.4"');
    expect(runCompanionPage(FILE, laterVersion, { farmId: 1 })).toMatchObject({
        readState: "settings-only", reason: "unreviewed-version",
    });
});
