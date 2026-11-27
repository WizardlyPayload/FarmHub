"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "BaleBatchTrackerCollector.lua";

test("reads only a snapshot explicitly scoped to the export farm", () => {
    const setup = `
      _G.g_modIsLoaded = { FS25_374533_Bale_Batch_Tracker = true }
      _G.g_modManager = { getActiveMods = function() return {
        { modName = "FS25_374533_Bale_Batch_Tracker", version = "1.0.0.0" }
      } end }
      _G.FS25_374533_Bale_Batch_Tracker = { BaleBatchTracker = { snapshot = {
        farmId = 1, totalCount = 14, fermentingCount = 4, readyCount = 8,
        physicalCount = 10, storedCount = 4,
        groups = {
          { technicalName = "SILAGE", title = "Silage", state = "fermenting", count = 4,
            liters = 18000, batchCount = 2, averageProgress = 0.6,
            progressValues = { 0.2, 0.5, 0.7 } },
          { technicalName = "SILAGE", title = "Silage", state = "ready", count = 8, liters = 36000 },
        },
        storageRows = { { technicalName = "SILAGE", title = "Silage", state = "ready",
          count = 4, liters = 18000, litersKnown = true } },
      } } }
    `;
    const page = runCompanionPage(FILE, setup, { farmId: 1 });
    expect(page.readState).toBe("ok");
    expect(page.byFarm["1"]).toMatchObject({ totalCount: 14, fermentingCount: 4, readyCount: 8 });
    expect(page.groups[0]).toMatchObject({ state: "fermenting", batchCount: 2, averageProgress: 0.6 });
    expect(page.groups[0].progressValues).toBeUndefined();
    expect(normalizeCompanionPages({ pages: { baleBatchTracker: page } }, { modules: loadModules() })
        .pages.baleBatchTracker.groups).toHaveLength(2);
    expect(runCompanionPage(FILE, setup, { farmId: 2 })).toMatchObject({
        readState: "settings-only", reason: "farm-scope-mismatch",
    });
});

test("never reads a shared or farm-unknown bale snapshot", () => {
    const setup = `
      _G.g_modIsLoaded = { FS25_374533_Bale_Batch_Tracker = true }
      _G.g_modManager = { getActiveMods = function() return {
        { modName = "FS25_374533_Bale_Batch_Tracker", version = "1.0.0.0" }
      } end }
      _G.BaleBatchTracker = { snapshot = { farmId = 1, totalCount = 500 } }
      _G.FS25_374533_Bale_Batch_Tracker = { BaleBatchTracker = { snapshot = {
        totalCount = 500, groups = { { state = "ready", count = 500 } }
      } } }
    `;
    expect(runCompanionPage(FILE, setup, { farmId: 1 })).toMatchObject({
        readState: "settings-only", reason: "farm-scope-mismatch",
    });
});

test("withholds an unreviewed snapshot version", () => {
    const setup = `
      _G.g_modIsLoaded = { FS25_374533_Bale_Batch_Tracker = true }
      _G.g_modManager = { getActiveMods = function() return {
        { modName = "FS25_374533_Bale_Batch_Tracker", version = "1.1.0.0" }
      } end }
      _G.FS25_374533_Bale_Batch_Tracker = { BaleBatchTracker = { snapshot = {
        farmId = 1, totalCount = 14, groups = { { state = "ready", count = 14 } }
      } } }
    `;
    const page = runCompanionPage(FILE, setup, { farmId: 1 });
    expect(page).toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
    expect(page.byFarm).toBeUndefined();
});
