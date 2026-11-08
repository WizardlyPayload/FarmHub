-- Adjustable Fuel Tank + Elektro 2.1.0.23: selected tank percentages and
-- observed capacity on currently owned vehicles. Not fuel used or purchased.

local PERCENTAGES = { 50, 75, 100, 125, 150, 175, 200, 250,
    300, 400, 500, 600, 700, 800, 900, 1000 }
local KINDS = {
    { config = "adjustFuelTank", fillType = "DIESEL", base = "_adjustFuelTankOriginalCapacity", label = "Diesel" },
    { config = "adjustDefTank", fillType = "DEF", base = "_adjustFuelTankOriginalCapacityDef", label = "DEF" },
    { config = "adjustElectricTank", fillType = "ELECTRICCHARGE", base = "_adjustFuelTankOriginalCapacityElectric", label = "Electric" },
}
local MAX_ROWS = 80

CompanionPages.register({
    key = "adjustFuelTank",
    modNames = { "KM_80971_adjust-fuel-tank", "FS25_AdjustFuelTank" },
    substrings = { "adjust-fuel-tank", "adjustfueltank" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-vehicles-only" }
        end
        if ctx.version ~= nil and ctx.version ~= "2.1.0.23" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local vehicles = ctx.ownedVehicles()
        local fillTypes = ctx.global("FillType")
        if type(vehicles) ~= "table" or type(fillTypes) ~= "table" then
            return { readState = "settings-only", reason = "vehicle-fill-types-unavailable" }
        end

        local rows, selectedVehicles, observedUnits = {}, 0, 0
        local incomplete, truncated = false, ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            local configurations = type(vehicle) == "table" and vehicle.configurations or nil
            local fillUnits = type(vehicle) == "table" and type(vehicle.spec_fillUnit) == "table"
                and vehicle.spec_fillUnit.fillUnits or nil
            local vehicleSelected = false
            for _, kind in ipairs(KINDS) do
                local index = type(configurations) == "table" and ctx.num(configurations[kind.config]) or nil
                local percent = index ~= nil and index == math.floor(index) and PERCENTAGES[index] or nil
                if percent ~= nil and percent ~= 100 then
                    vehicleSelected = true
                    local found = false
                    local fillTypeId = fillTypes[kind.fillType]
                    if type(fillUnits) == "table" and fillTypeId ~= nil then
                        for unitIndex, unit in ipairs(fillUnits) do
                            if type(unit) == "table" and type(unit.supportedFillTypes) == "table"
                                and unit.supportedFillTypes[fillTypeId] == true then
                                found = true
                                local base = ctx.num(unit[kind.base])
                                local current = ctx.num(unit.capacity)
                                local expected = base ~= nil and base > 0
                                    and math.floor(base * percent / 100 + 0.5) or nil
                                local matches = expected ~= nil and current ~= nil
                                    and math.abs(current - expected) <= math.max(0.01, expected * 0.001)
                                if not matches then incomplete = true
                                else observedUnits = observedUnits + 1 end
                                if #rows < MAX_ROWS then
                                    rows[#rows + 1] = {
                                        farmId = farmId,
                                        vehicleId = ctx.clip(vehicle.uniqueId or vehicle.id, 64),
                                        vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                            or ctx.call(vehicle, "getName"), 70),
                                        kind = kind.label, fillUnitIndex = unitIndex,
                                        selectedPercent = percent,
                                        originalCapacityLitres = base,
                                        expectedCapacityLitres = expected,
                                        currentCapacityLitres = current,
                                        capacityMatchesSelection = matches,
                                    }
                                else truncated = true end
                            end
                        end
                    end
                    if not found then
                        incomplete = true
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId,
                                vehicleId = ctx.clip(vehicle.uniqueId or vehicle.id, 64),
                                vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                    or ctx.call(vehicle, "getName"), 70),
                                kind = kind.label, selectedPercent = percent,
                            }
                        else truncated = true end
                    end
                end
            end
            if vehicleSelected then selectedVehicles = selectedVehicles + 1 end
        end
        table.sort(rows, function(a, b)
            local an, bn = tostring(a.vehicle or a.vehicleId or ""), tostring(b.vehicle or b.vehicleId or "")
            if an == bn then
                if a.kind == b.kind then return (a.fillUnitIndex or 0) < (b.fillUnitIndex or 0) end
                return a.kind < b.kind
            end
            return an < bn
        end)
        return {
            readState = selectedVehicles == 0 and "settings-only"
                or (incomplete or truncated) and "partial" or "ok",
            reason = selectedVehicles == 0 and "no-nonstock-owned-tank" or nil,
            coverage = truncated and "truncated" or incomplete and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                selectedVehicleCount = selectedVehicles,
                matchingFillUnitCount = observedUnits,
            } },
            rows = rows,
        }
    end,
})
