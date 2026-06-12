-- FS25 FarmDashboard | BaleInventoryCollector.lua | v1.2.0
-- Physical bale inventory: loose world bales (on-field vs yard) + shed via StockDataCollector merge.

BaleInventoryCollector = {}

BaleInventoryCollector._last = nil
BaleInventoryCollector._inc = nil

local function _mission()
    return rawget(_G, "g_currentMission")
end

local function _currentFarmId()
    local m = _mission()
    if m and m.getFarmId then
        local ok, fid = pcall(function() return m:getFarmId() end)
        if ok and fid and fid > 0 then return fid end
    end
    return 1
end

function BaleInventoryCollector.getLastBaleInventory()
    return BaleInventoryCollector._last
end

function BaleInventoryCollector:init()
    BaleInventoryCollector._inc = nil
    BaleInventoryCollector._last = nil
end

function BaleInventoryCollector:collectBegin()
    if rawget(_G, "FillTypeUtils") and FillTypeUtils.rebuildCatalog then
        FillTypeUtils.rebuildCatalog()
    end
    local farmIds = InventoryScan.collectPlayerFarmIds()
    BaleInventoryCollector._inc = {
        farmIds = farmIds,
        baleState = InventoryScan.newBaleState(farmIds),
        worldDone = false,
    }
end

function BaleInventoryCollector:collectStep(opts)
    local st = BaleInventoryCollector._inc
    if not st then return true, { farmId = 0, byFarm = {}, onField = {}, offField = {} } end

    if not st.worldDone then
        InventoryScan.scanLooseWorldBales(st.baleState, st.farmIds)
        st.worldDone = true
    end

    local result = InventoryScan.finalizeBales(st.baleState, _currentFarmId())
    BaleInventoryCollector._last = result
    BaleInventoryCollector._inc = nil
    return true, result
end

function BaleInventoryCollector:collect()
    self:collectBegin()
    local done, result = false, nil
    while not done do
        done, result = self:collectStep({})
    end
    return result or BaleInventoryCollector._last or { farmId = 0, byFarm = {} }
end
