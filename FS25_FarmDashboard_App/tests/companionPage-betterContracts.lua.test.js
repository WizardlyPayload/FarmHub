"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "BetterContractsCollector.lua";

function setup(extra = "") {
    return `
        _G.g_modIsLoaded = { FS25_BetterContracts = true }
        local Mission = {}
        Mission.__index = Mission
        function Mission:getTitle() return self.title end
        function Mission:getLocation() return self.loc end
        function Mission:getReward() return self.reward end
        function Mission:getCompletion() return self.completion or 0 end
        function Mission:getVehicleCosts() return self.vc or 0 end
        function Mission:getNPC() return { title = self.npc } end
        function Mission:getTotalReward() return self.total or 0 end
        local function m(t) return setmetatable(t, Mission) end
        local missions = {
            m({ status = 1, type = { name = "harvestMission" }, title = "Harvest", loc = "Field 3", reward = 12000, npc = "Anna" }),
            m({ status = 1, type = { name = "harvestMission" }, title = "Harvest", loc = "Field 9", reward = 30000, npc = "Bob" }),
            m({ status = 1, type = { name = "plowMission" }, title = "Plow", loc = "Field 4", reward = 4000, npc = "Anna" }),
            m({ status = 3, farmId = 1, type = { name = "sowMission" }, title = "Sow", loc = "Field 7", reward = 8000, completion = 0.42, vc = 1200, spawnedVehicles = true, npc = "Bob" }),
            m({ status = 4, farmId = 1, finishState = 2, type = { name = "mowMission" }, total = 5000 }),
            m({ status = 4, farmId = 1, finishState = 3, type = { name = "mowMission" }, total = -300 }),
        }
        _G.g_missionManager = { missions = missions, getMissions = function(self) return self.missions end }
        _G.g_npcManager = { getNPCByIndex = function(_, i) return ({ [1] = { title = "Anna" }, [2] = { title = "Bob" } })[i] end }
        _G.g_farmManager = { getFarms = function() return {
            { farmId = 1, stats = { npcJobs = { [1] = 7, [2] = 1 }, jobsLeft = 2 } },
            { farmId = 2, stats = {} },
        } end }
        _G.g_currentMission = {}
        _G.FS25_BetterContracts = { BetterContracts = { isOn = true, config = {
            maxActive = 3, rewardMultiplier = 1.5, rewardMultiplierMow = 1, leaseMultiplier = 0.8, toDeliver = 0.94,
            toDeliverBale = 0.9, fieldCompletion = 0.95, fieldSize = 0.5, generationInterval = 1,
            lazyNPC = true, npcHarvest = true, discountMode = true, discPerJob = 0.05, discMaxJobs = 5,
            hardMode = true, hardPenalty = 0.1, hardLease = 2, hardExpire = "month", hardLimit = 4,
            genGrain = true, genRoot = false,
        } } }
        ${extra}
    `;
}

describe("companion page: Better Contracts (Lua)", () => {
    test("not detected -> no page", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("config, offered contracts and per-farm active/finished contracts with NPC standing", () => {
        const page = runCompanionPage(FILE, setup(), { farmId: 1 });
        expect(page.readState).toBe("ok");
        expect(page.settings).toMatchObject({
            maxActive: 3, rewardMultiplier: 1.5, leaseMultiplier: 0.8, lazyNPC: true, npcHarvest: true,
            discountMode: true, hardMode: true, hardLimit: 4, hardExpire: "month", genGrain: true, genRoot: false, addonsOn: true,
        });
        expect(page.offers.count).toBe(3);
        expect(page.offers.totalReward).toBe(46000);
        expect(page.offers.byType).toEqual([{ type: "harvestMission", count: 2 }, { type: "plowMission", count: 1 }]);
        expect(page.offers.best[0]).toMatchObject({ type: "harvestMission", location: "Field 9", reward: 30000, npc: "Bob" });

        const farm = page.byFarm["1"];
        expect(farm).toMatchObject({ activeCount: 1, activeReward: 8000, finishedCount: 2, finishedReward: 4700, succeeded: 1, failed: 1, jobsLeft: 2, slotsFree: 2 });
        expect(farm.active[0]).toMatchObject({ type: "sowMission", location: "Field 7", completion: 0.42, vehicleCosts: 1200, leased: true, npc: "Bob" });
        // discount cap = min(5, floor(0.5 / 0.05)) = 5 jobs -> 25 %
        expect(farm.npcJobs[0]).toEqual({ npc: "Anna", jobs: 7, discountPercent: 25, maxedOut: true, canLease: true });
        expect(farm.npcJobs[1]).toEqual({ npc: "Bob", jobs: 1, discountPercent: 5 });
        expect(page.byFarm["2"]).toMatchObject({ activeCount: 0, slotsFree: 3 });
        expect(Object.keys(page.byFarm["2"].npcJobs || {})).toHaveLength(0);
    });

    test("without the mod config the vanilla contracts are still shown as partial", () => {
        const page = runCompanionPage(FILE, setup("FS25_BetterContracts.BetterContracts = nil"), { farmId: 1 });
        expect(page.readState).toBe("partial");
        expect(page.settings).toBeUndefined();
        expect(page.offers.count).toBe(3);
    });
});
