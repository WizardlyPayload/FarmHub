"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "FarmReputationCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_367320_FS25_FarmReputation = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_367320_FS25_FarmReputation", version = "1.1.0.2" }
  } end }
  _G.FS25_367320_FS25_FarmReputation = { ReputationManager = {
    reputationByFarm = { [1] = 325, [2] = 890 },
    contractorStatsByFarm = { [1] = { Alex = 5 }, [2] = { Foreign = 99 } },
    contractorDataByFarm = {
      [1] = { Alex = { reputation = 75, completed = 4, cancelled = 1 } },
      [2] = { Foreign = { reputation = 1000, completed = 99, cancelled = 0 } },
    },
    ranks = {
      { min = 0, title = "Helper", missionLimit = 1 },
      { min = 250, title = "Farmer", missionLimit = 2 },
      { min = 750, title = "Professional", missionLimit = 3 },
    },
  } }
`;

test("reads only the requested farm's persisted reputation and contractor rows", () => {
    const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
    expect(page).toMatchObject({ readState: "ok", coverage: "complete",
        byFarm: { "1": { score: 325, rank: "Farmer", missionLimit: 2, contractorCount: 1 } } });
    expect(page.contractors).toEqual([expect.objectContaining({
        farmId: 1, contractor: "Alex", jobs: 5, reputation: 75, completed: 4, cancelled: 1,
    })]);
    expect(normalizeCompanionPages({ pages: { farmReputation: page } }, { modules: loadModules() })
        .pages.farmReputation.contractors).toHaveLength(1);
});

test("does not read a shared global shadow or substitute farm 1 for a missing farm", () => {
    const shadow = `
      _G.g_modIsLoaded = { FS25_367320_FS25_FarmReputation = true }
      _G.g_modManager = { getActiveMods = function() return {
        { modName = "FS25_367320_FS25_FarmReputation", version = "1.1.0.2" }
      } end }
      _G.ReputationManager = { reputationByFarm = { [1] = 999 } }
    `;
    expect(runCompanionPage(FILE, shadow, { farmId: 1 })).toMatchObject({
        readState: "settings-only", reason: "no-reputation-register",
    });
    expect(runCompanionPage(FILE, SETUP, { farmId: 3 })).toMatchObject({
        readState: "settings-only", reason: "no-farm-record",
    });
    expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});

test("new contractor record shows zero jobs until the mod records a completed job", () => {
    const accepted = SETUP.replace("[1] = { Alex = 5 }", "[1] = {}")
        .replace("reputation = 75, completed = 4, cancelled = 1", "reputation = 0, completed = 0, cancelled = 0");
    const page = runCompanionPage(FILE, accepted, { farmId: 1 });
    expect(page.contractors).toEqual([expect.objectContaining({
        contractor: "Alex", jobs: 0, reputation: 0, completed: 0, cancelled: 0,
    })]);
});

test("reads the exact older vault build's same farm-keyed score and contractor fields", () => {
    const older = SETUP.replaceAll("FS25_367320_FS25_FarmReputation", "KM_80173_Farm_Reputation")
        .replace('version = "1.1.0.2"', 'version = "1.1.0.1"');
    const page = runCompanionPage(FILE, older, { farmId: 1 });
    expect(page).toMatchObject({
        detected: true, modName: "KM_80173_Farm_Reputation", version: "1.1.0.1",
        readState: "ok", byFarm: { "1": { score: 325, rank: "Farmer", contractorCount: 1 } },
    });
    expect(page.contractors).toHaveLength(1);
    expect(page.contractors[0]).toMatchObject({ contractor: "Alex", jobs: 5, completed: 4, cancelled: 1 });
});

test("withholds an unreviewed Farm Reputation version", () => {
    const unknown = SETUP.replace('version = "1.1.0.2"', 'version = "1.1.0.3"');
    const page = runCompanionPage(FILE, unknown, { farmId: 1 });
    expect(page).toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
    expect(page.contractors).toBeUndefined();
    expect(page.byFarm).toBeUndefined();
});
