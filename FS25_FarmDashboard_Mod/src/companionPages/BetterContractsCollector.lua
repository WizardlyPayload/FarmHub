-- FS25 FarmDashboard | companionPages/BetterContractsCollector.lua | v1.0.0
-- Better Contracts (Mmtrx): BetterContracts (mod env) holds config (limits, reward/lease multipliers,
-- lazy NPC, discount and hard mode) and counts successful jobs per NPC in farm.stats.npcJobs, with the
-- hard-mode monthly allowance in farm.stats.jobsLeft. Contracts themselves are vanilla missions
-- (g_missionManager.missions; MissionStatus CREATED=1 PREPARING=2 RUNNING=3 FINISHED=4).

local SCAN_MISSIONS = 500
local MAX_OFFERS = 12
local MAX_ACTIVE = 15
local MAX_NPCS = 30
local MAX_FARMS = 16
local STATUS_CREATED, STATUS_PREPARING, STATUS_RUNNING, STATUS_FINISHED = 1, 2, 3, 4
local FINISH_SUCCESS = 2

local CONFIG_NUMBERS = {
    "maxActive", "rewardMultiplier", "rewardMultiplierMow", "leaseMultiplier", "toDeliver",
    "toDeliverBale", "fieldCompletion", "fieldSize", "generationInterval", "discPerJob", "discMaxJobs",
    "hardPenalty", "hardLease", "hardLimit",
}
local CONFIG_FLAGS = {
    "ferment", "forcePlow", "hideMission", "stayNew", "finishField", "lazyNPC", "npcHarvest",
    "npcPlowCultivate", "npcSow", "npcFertilize", "npcWeed", "discountMode", "hardMode", "genSingle",
    "genGrain", "genRoot", "genVegetable", "genGreen", "genTree", "genDead", "genRock",
}

local function npcTitle(ctx, npc)
    return type(npc) == "table" and ctx.clip(npc.title or npc.name, 60) or nil
end

local function readMission(ctx, m)
    local completion = ctx.num(ctx.call(m, "getCompletion")) or ctx.num(m.completion)
    return {
        type = ctx.clip(type(m.type) == "table" and m.type.name or nil, 40),
        title = ctx.clip(ctx.call(m, "getTitle"), 80),
        location = ctx.clip(ctx.call(m, "getLocation"), 60),
        npc = npcTitle(ctx, ctx.call(m, "getNPC")),
        reward = ctx.round2(ctx.call(m, "getReward") or m.reward),
        vehicleCosts = ctx.round2(ctx.call(m, "getVehicleCosts")),
        leased = m.spawnedVehicles == true,
        completion = completion and ctx.round2(completion) or nil,
    }
end

local function farmBucket(byFarm, fid)
    local key = tostring(fid)
    local bucket = byFarm[key]
    if bucket == nil then
        bucket = { active = {}, activeCount = 0, activeReward = 0, finishedCount = 0, finishedReward = 0,
            succeeded = 0, failed = 0 }
        byFarm[key] = bucket
    end
    return bucket
end

local function readMissions(ctx, byFarm)
    local mm = ctx.global("g_missionManager")
    local missions = type(mm) == "table" and (ctx.call(mm, "getMissions") or mm.missions) or nil
    local offers = { count = 0, totalReward = 0, byType = {}, best = {} }
    if type(missions) ~= "table" then
        return offers, false
    end
    local typeCounts = {}
    local scanned = 0
    for _, m in pairs(missions) do
        scanned = scanned + 1
        if scanned > SCAN_MISSIONS then
            break
        end
        if type(m) == "table" then
            local status = ctx.num(m.status)
            local fid = ctx.num(m.farmId)
            if status == STATUS_CREATED then
                local row = readMission(ctx, m)
                offers.count = offers.count + 1
                offers.totalReward = offers.totalReward + (row.reward or 0)
                local t = row.type or "other"
                typeCounts[t] = (typeCounts[t] or 0) + 1
                offers.best[#offers.best + 1] = row
            elseif fid and fid > 0 and (status == STATUS_PREPARING or status == STATUS_RUNNING) then
                local bucket = farmBucket(byFarm, fid)
                local row = readMission(ctx, m)
                bucket.activeCount = bucket.activeCount + 1
                bucket.activeReward = bucket.activeReward + (row.reward or 0)
                if #bucket.active < MAX_ACTIVE then
                    bucket.active[#bucket.active + 1] = row
                end
            elseif fid and fid > 0 and status == STATUS_FINISHED then
                local bucket = farmBucket(byFarm, fid)
                bucket.finishedCount = bucket.finishedCount + 1
                bucket.finishedReward = bucket.finishedReward + (ctx.num(ctx.call(m, "getTotalReward")) or 0)
                if ctx.num(m.finishState) == FINISH_SUCCESS then
                    bucket.succeeded = bucket.succeeded + 1
                else
                    bucket.failed = bucket.failed + 1
                end
            end
        end
    end
    table.sort(offers.best, function(a, b)
        return (a.reward or 0) > (b.reward or 0)
    end)
    while #offers.best > MAX_OFFERS do
        table.remove(offers.best)
    end
    for t, n in pairs(typeCounts) do
        offers.byType[#offers.byType + 1] = { type = ctx.clip(t, 40), count = n }
    end
    table.sort(offers.byType, function(a, b)
        return a.count > b.count
    end)
    offers.totalReward = ctx.round2(offers.totalReward)
    return offers, true
end

local function readNpcJobs(ctx, farm, config)
    local rows = {}
    local stats = type(farm.stats) == "table" and farm.stats or nil
    local jobs = stats and type(stats.npcJobs) == "table" and stats.npcJobs or nil
    if jobs == nil then
        return rows
    end
    local npcs = ctx.global("g_npcManager")
    local perJob = ctx.num(config.discPerJob) or 0
    local maxJobs = ctx.num(config.discMaxJobs) or 0
    local cap = perJob > 0 and math.min(maxJobs, math.floor(0.5 / perJob)) or 0
    for index, count in pairs(jobs) do
        local n = ctx.num(count)
        if n and #rows < MAX_NPCS then
            local npc = type(npcs) == "table" and ctx.call(npcs, "getNPCByIndex", index) or nil
            rows[#rows + 1] = {
                npc = npcTitle(ctx, npc) or ("#" .. tostring(index)),
                jobs = n,
                discountPercent = config.discountMode == true and ctx.round2(math.min(n, cap) * perJob * 100) or nil,
                maxedOut = config.discountMode == true and cap > 0 and n >= cap or nil,
                canLease = config.hardMode == true and n >= (ctx.num(config.hardLease) or 0) or nil,
            }
        end
    end
    table.sort(rows, function(a, b)
        return a.jobs > b.jobs
    end)
    return rows
end

CompanionPages.register({
    key = "betterContracts",
    modNames = { "FS25_BetterContracts", "FS25_307829_Better_Contracts" },
    substrings = { "bettercontracts" },
    collect = function(ctx)
        local bc = ctx.symbol("BetterContracts")
        local config = type(bc) == "table" and type(bc.config) == "table" and bc.config or nil

        local settings = nil
        if config then
            settings = {}
            for _, name in ipairs(CONFIG_NUMBERS) do
                settings[name] = ctx.round2(config[name])
            end
            for _, name in ipairs(CONFIG_FLAGS) do
                settings[name] = config[name] == true
            end
            settings.hardExpire = ctx.clip(config.hardExpire, 20)
            settings.addonsOn = bc.isOn ~= false
        end

        local byFarm = {}
        local offers, missionsRead = readMissions(ctx, byFarm)

        local fm = ctx.global("g_farmManager")
        local farms = type(fm) == "table" and (ctx.call(fm, "getFarms") or fm.farms) or {}
        local seen = 0
        for _, farm in pairs(type(farms) == "table" and farms or {}) do
            local fid = type(farm) == "table" and ctx.num(farm.farmId) or nil
            if fid and fid > 0 and seen < MAX_FARMS then
                seen = seen + 1
                local bucket = farmBucket(byFarm, fid)
                if config then
                    bucket.npcJobs = readNpcJobs(ctx, farm, config)
                    local stats = type(farm.stats) == "table" and farm.stats or {}
                    if config.hardMode == true and (ctx.num(config.hardLimit) or -1) > -1 then
                        bucket.jobsLeft = ctx.num(stats.jobsLeft)
                    end
                    local maxActive = ctx.num(config.maxActive)
                    bucket.slotsFree = maxActive and math.max(maxActive - bucket.activeCount, 0) or nil
                end
                bucket.activeReward = ctx.round2(bucket.activeReward)
                bucket.finishedReward = ctx.round2(bucket.finishedReward)
            end
        end

        if not config and not missionsRead then
            return nil
        end
        local readState = "ok"
        if not config then
            readState = "partial"
        elseif not missionsRead then
            readState = "partial"
        end
        return {
            readState = readState,
            settings = settings,
            offers = offers,
            byFarm = byFarm,
        }
    end,
})
