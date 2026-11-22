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

test("reads the exact GH vault basename with the same farm isolation", () => {
    const name = "GH_Squallqt__FS25_RealisticCropRotation_FS25_RealisticCropRotation";
    const setup = SETUP.replaceAll("FS25_370461_Realistic_Crop_Rotation", name);
    const page = runCompanionPage(FILE, setup, { farmId: 1 });
    expect(page).toMatchObject({ readState: "ok", coverage: "complete",
        byFarm: { "1": { farmlandCount: 1, plannedCount: 1, historyCount: 1 } } });
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({ farmlandId: 36, plan: ["CORN", "", "WHEAT", ""] });
    expect(JSON.stringify(page)).not.toContain("SUGARBEET");
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

test("separates owned predictive pressure from a visible outbreak and withholds foreign disease data", () => {
    const setup = SETUP + `
      _G.g_modManager = { getActiveMods = function() return {
        { modName = "FS25_370461_Realistic_Crop_Rotation", version = "1.1.0.1" }
      } end }
      _G.g_currentMission = { getFarmId = function() return 1 end,
        getIsServer = function() return true end }
      _G.FS25_370461_Realistic_Crop_Rotation.RealisticCropRotation.disease = {
        state = { [36] = { FUNGUS = { severity = 0.4 } },
                  [42] = { SECRET = { severity = 0.9 } } },
        reservoir = { [36] = { FUNGUS = 0.5 }, [42] = { SECRET = 0.9 } },
        getRiskBand = function(_, id) return id == 36 and 2 or 3 end,
        getWorstGroup = function(_, id) return id == 36 and "FUNGUS" or "SECRET" end,
        getDisplayName = function(_, group) return group == "FUNGUS" and "Leaf disease" or "Other farm disease" end,
      }
    `;
    const page = runCompanionPage(FILE, setup, { farmId: 1 });
    expect(page.disease).toMatchObject({
        readState: "ok", coverage: "tracked-parcels",
        atRiskCount: 1, visibleOutbreakCount: 1,
        rows: [{ farmId: 1, farmlandId: 36, riskBand: 2, visibleOutbreak: "Leaf disease" }],
    });
    expect(JSON.stringify(page)).not.toContain("Other farm disease");
    expect(normalizeCompanionPages({ pages: { realisticCropRotation: page } },
        { modules: loadModules() }).pages.realisticCropRotation.disease.rows).toHaveLength(1);

    const noServer = setup.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
    expect(runCompanionPage(FILE, noServer, { farmId: 1 }).disease).toMatchObject({
        readState: "unavailable", reason: "server-disease-state-only",
    });
    const unknownOwner = setup.replace("id == 36 and 1 or 2", "id == 36 and 1 or nil");
    expect(runCompanionPage(FILE, unknownOwner, { farmId: 1 }).disease).toMatchObject({
        readState: "partial", coverage: "partial",
        rows: [{ farmlandId: 36, riskBand: 2 }],
    });
    expect(runCompanionPage(FILE, unknownOwner, { farmId: 1 }).disease.atRiskCount).toBeUndefined();
});

test("includes ambient pressure on tracked owned crops before disease state exists", () => {
    const setup = SETUP + `
      _G.g_modManager = { getActiveMods = function() return {
        { modName = "FS25_370461_Realistic_Crop_Rotation", version = "1.1.0.1" }
      } end }
      _G.g_currentMission = { getFarmId = function() return 1 end,
        getIsServer = function() return true end }
      _G.FS25_370461_Realistic_Crop_Rotation.RealisticCropRotation.disease = {
        state = {}, reservoir = {}, crop = {},
        getRiskBand = function(_, id) return id == 36 and 1 or 3 end,
        getWorstGroup = function() return nil end,
      }
    `;
    const page = runCompanionPage(FILE, setup, { farmId: 1 });
    expect(page.disease).toMatchObject({
        readState: "ok", coverage: "tracked-parcels",
        atRiskCount: 1, visibleOutbreakCount: 0,
        rows: [{ farmId: 1, farmlandId: 36, riskBand: 1 }],
    });
    expect(JSON.stringify(page.disease)).not.toContain('"farmlandId":42');
});
