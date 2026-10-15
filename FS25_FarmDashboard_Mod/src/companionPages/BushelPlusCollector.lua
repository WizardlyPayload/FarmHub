-- FS25 FarmDashboard | companionPages/BushelPlusCollector.lua | v1.0.0
-- Bushel Plus (Bcbuhler, Akuenzi, Jos, 1.0.0.0). A shop implement ("Loss measurement system") with the
-- BushelPlus specialization: onLoad sets vehicle.spec_BushelPlus.bushelYieldScale (vehicle.bushelPlus#scale,
-- 0.1 in the shipped XML). onPostAttach to a vehicle with verifyCombine multiplies the combine's
-- spec_combine.threshingScale by (1 + scale); onPreDetach divides it back. Folding only moves the pan.
-- There is no manager or setting: this page is a bounded scan of the farm's own vehicles.

local SCAN_VEHICLES = 300
local MAX_ROWS = 30

local function vehicleName(ctx, vehicle)
    local name = ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName")
    return ctx.clip(name ~= nil and tostring(name) or "?", 60)
end

local function isCombine(vehicle)
    return type(vehicle) == "table" and type(vehicle.spec_combine) == "table" and vehicle.verifyCombine ~= nil
end

local function round3(value)
    return math.floor(value * 1000 + 0.5) / 1000
end

CompanionPages.register({
    key = "bushelPlus",
    modNames = { "FS25_BushelPlus", "FS25_309911_Bushel_Plus" },
    substrings = { "bushelplus", "bushel_plus" },
    collect = function(ctx)
        local system = ctx.mission and ctx.mission.vehicleSystem
        local vehicles = type(system) == "table" and system.vehicles or nil
        local fid = ctx.farmId
        if type(vehicles) ~= "table" then
            return nil
        end
        if fid == nil or fid <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local shared = type(ctx.ownedVehicles) == "function" and ctx.try(ctx.ownedVehicles) or nil
        if type(shared) == "table" then
            vehicles = shared
        end

        local units, combines, equipped = {}, {}, {}
        local scanned, truncated = 0, false
        local combineList = {}
        for _, vehicle in pairs(vehicles) do
            scanned = scanned + 1
            if scanned > SCAN_VEHICLES then
                truncated = true
                break
            end
            if type(vehicle) == "table" and ctx.num(vehicle.ownerFarmId) == fid then
                local spec = type(vehicle.spec_BushelPlus) == "table" and vehicle.spec_BushelPlus or nil
                if spec then
                    local host = ctx.call(vehicle, "getAttacherVehicle")
                    local onCombine = isCombine(host)
                    local scale = ctx.num(spec.bushelYieldScale)
                    if onCombine then
                        equipped[host] = (equipped[host] or 0) + (scale or 0)
                    end
                    if #units < MAX_ROWS then
                        units[#units + 1] = {
                            farmId = fid,
                            name = vehicleName(ctx, vehicle),
                            bonusPercent = scale and math.floor(scale * 1000 + 0.5) / 10 or nil,
                            attached = host ~= nil,
                            onCombine = onCombine,
                            attachedTo = host ~= nil and vehicleName(ctx, host) or nil,
                        }
                    else
                        truncated = true
                    end
                elseif isCombine(vehicle) then
                    combineList[#combineList + 1] = vehicle
                end
            end
        end

        local equippedCount = 0
        for _, combine in ipairs(combineList) do
            local bonus = equipped[combine]
            if bonus ~= nil then
                equippedCount = equippedCount + 1
            end
            if #combines < MAX_ROWS then
                local threshing = ctx.num(combine.spec_combine.threshingScale)
                combines[#combines + 1] = {
                    farmId = fid,
                    name = vehicleName(ctx, combine),
                    equipped = bonus ~= nil,
                    bonusPercent = bonus ~= nil and math.floor(bonus * 1000 + 0.5) / 10 or nil,
                    threshingScale = threshing and round3(threshing) or nil,
                }
            else
                truncated = true
            end
        end
        table.sort(units, function(a, b) return a.name < b.name end)
        table.sort(combines, function(a, b)
            if a.equipped ~= b.equipped then
                return a.equipped
            end
            return a.name < b.name
        end)

        local attached = 0
        for _, unit in ipairs(units) do
            if unit.onCombine then
                attached = attached + 1
            end
        end

        return {
            readState = "ok",
            units = units,
            combines = combines,
            byFarm = {
                [tostring(fid)] = {
                    unitCount = #units,
                    onCombineCount = attached,
                    combineCount = #combineList,
                    equippedCombines = equippedCount,
                },
            },
            coverage = truncated and "sampled" or "complete",
        }
    end,
})
