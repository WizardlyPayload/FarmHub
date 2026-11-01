"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "RealisticCropRotationCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_370461_Realistic_Crop_Rotation = true }
  _G.FS25_370461_Realistic_Crop_Rotation = { RealisticCropRotation = { manager = {
    repository = {
      history = { [36] = { { crop = "WHEAT" }, { crop = "SOYBEAN" } },
                  [42] = { { crop = "POTATO" } } },
      plans = { [36] = { "CORN", "", "WHEAT", "" }, [42] = { "SUGARBEET" } },
      coverPlans = { [36] = { "MUSTARD", "", "", "" } },
      lastKnownActiveCrop = { [36] = "BARLEY", [42] = "POTATO" },
    },
  } } }
  _G.g_farmlandManager = {
    getFarmlandOwner = function(_, id) return id == 36 and 1 or 2 end,
  }
`;

test("exports plans and history only for land currently owned by the export farm", () => {
    const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
    expect(page).toMatchObject({ readState: "ok", coverage: "complete",
        byFarm: { "1": { farmlandCount: 1, plannedCount: 1, historyCount: 1 } } });
    expect(page.rows).toEqual([expect.objectContaining({
        farmId: 1, farmlandId: 36, activeCrop: "BARLEY",
        history: ["WHEAT", "SOYBEAN", "", ""],
        plan: ["CORN", "", "WHEAT", ""],
        coverPlan: ["MUSTARD", "", "", ""],
    })]);
    expect(JSON.stringify(page)).not.toContain("SUGARBEET");
    expect(normalizeCompanionPages({ pages: { realisticCropRotation: page } },
        { modules: loadModules() }).pages.realisticCropRotation.rows).toHaveLength(1);
});

test("withholds unowned records and refuses to assume ownership without the engine API", () => {
    const sold = SETUP.replace("id == 36 and 1 or 2", "2");
    const soldPage = runCompanionPage(FILE, sold, { farmId: 1 });
    expect(soldPage).toMatchObject({
        readState: "ok", byFarm: { "1": { farmlandCount: 0 } },
    });
    expect(Object.values(soldPage.rows)).toHaveLength(0);
    const missingOwner = SETUP.replace(/_G\.g_farmlandManager = \{[\s\S]*?\n  \}/, "_G.g_farmlandManager = nil");
    expect(runCompanionPage(FILE, missingOwner, { farmId: 1 })).toMatchObject({
        readState: "settings-only", reason: "no-ownership-api",
    });
    expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});

test("exports a new owned plan before any crop history exists", () => {
    const setup = `
      _G.g_modIsLoaded = { KM_83006_Realistic_Crop_Rotation = true }
      _G.KM_83006_Realistic_Crop_Rotation = { RealisticCropRotation = { manager = {
        repository = { plans = { [36] = { "CANOLA", "", "", "" } } },
      } } }
      _G.g_farmlandManager = { getFarmlandOwner = function(_, id) return id == 36 and 1 or 2 end }
    `;
    const page = runCompanionPage(FILE, setup, { farmId: 1 });
    expect(page).toMatchObject({ readState: "ok", coverage: "complete",
        byFarm: { "1": { farmlandCount: 1, plannedCount: 1, historyCount: 0 } } });
    expect(page.rows[0]).toMatchObject({ farmlandId: 36, plan: ["CANOLA", "", "", ""] });
});
