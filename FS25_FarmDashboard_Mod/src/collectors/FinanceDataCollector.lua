-- FS25 FarmDashboard | FinanceDataCollector.lua | v2.2.0

FinanceDataCollector = {}

function FinanceDataCollector:init()
    FinanceDataCollector._inc = nil
end

local function _defaultFinanceData()
    return {
        farmId    = 1,
        money     = 0,
        loan      = 0,
        loanMax   = 500000,
        totalAssets = 0,
        netWorth  = 0,
        vehicles  = { count = 0, totalValue = 0 },
        animals   = { count = 0, totalValue = 0 },
        buildings = { count = 0, totalValue = 0 },
        land      = { count = 0, totalValue = 0, hectares = 0 }
    }
end

function FinanceDataCollector:collectBegin()
    FinanceDataCollector._inc = {
        stage = "money",
        financeData = _defaultFinanceData(),
        vehicleList = {},
        vehicleEnumSeen = {},
        vehicleIdx = 1,
    }
end

function FinanceDataCollector:collectStep(opts)
    local st = FinanceDataCollector._inc
    if not st then return true, _defaultFinanceData() end

    local vpf = math.max(1, tonumber(opts and opts.financeVehiclesPerFrame) or 4)
    local fd = st.financeData

    if st.stage == "money" then
        pcall(function()
            if _G.g_farmManager and _G.g_farmManager.farms then
                for _, farm in pairs(_G.g_farmManager.farms) do
                    if farm.farmId == 1 then
                        fd.money   = farm.money  or 0
                        fd.loan    = farm.loan   or 0
                        fd.loanMax = farm.loanMax or 500000
                        break
                    end
                end
            end
        end)
        st.stage = "vehicles_enum"
    end

    if st.stage == "vehicles_enum" then
        local added = 0
        if _G.g_currentMission and _G.g_currentMission.vehicles then
            for _, vehicle in pairs(_G.g_currentMission.vehicles) do
                if added >= vpf then break end
                local dk = tostring(vehicle)
                if not st.vehicleEnumSeen[dk] then
                    st.vehicleEnumSeen[dk] = true
                    st.vehicleList[#st.vehicleList + 1] = vehicle
                    added = added + 1
                end
            end
            if added < vpf then
                st.stage = "vehicles_value"
                st.vehicleIdx = 1
            end
        else
            st.stage = "vehicles_value"
            st.vehicleIdx = 1
        end
        return false, fd
    end

    if st.stage == "vehicles_value" then
        local hi = math.min(st.vehicleIdx + vpf - 1, #st.vehicleList)
        for i = st.vehicleIdx, hi do
            local vehicle = st.vehicleList[i]
            local ok, fId = pcall(function() return vehicle:getOwnerFarmId() end)
            if ok and fId == 1 then
                fd.vehicles.count = fd.vehicles.count + 1
                local ok2, price = pcall(function() return vehicle:getSellPrice() end)
                fd.vehicles.totalValue = fd.vehicles.totalValue + (ok2 and price or (vehicle.price or 0))
            end
        end
        st.vehicleIdx = hi + 1
        if st.vehicleIdx > #st.vehicleList then
            fd.totalAssets = fd.money + fd.vehicles.totalValue
            fd.netWorth    = fd.totalAssets - fd.loan
            FinanceDataCollector._inc = nil
            return true, fd
        end
        return false, fd
    end

    FinanceDataCollector._inc = nil
    return true, fd
end

function FinanceDataCollector:collect()
    self:collectBegin()
    local done, result = false, nil
    while not done do
        done, result = self:collectStep({ financeVehiclesPerFrame = 9999 })
    end
    return result or _defaultFinanceData()
end

function FinanceDataCollector:shutdown()
    FinanceDataCollector._inc = nil
end
