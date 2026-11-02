-- Diesel Fuel System 1.0.0.0: read the mod's live condition on this farm's
-- current diesel vehicles. Do not call SCVehicle.getSpec or scGetFilterState:
-- both create/default missing state and would turn a read into a mutation.

local MAX_ROWS = 60

local function fractionPct(ctx, value)
    local n = ctx.num(value)
    if n == nil or n < 0 or n > 1 then return nil end
    return ctx.round2(n * 100)
end

local function nonnegative(ctx, value)
    local n = ctx.num(value)
    if n == nil or n < 0 then return nil end
    return ctx.round2(n)
end

CompanionPages.register({
    key = "dieselFuelSystem",
    modNames = { "FS25_GNRealism_FuelSystem", "FS25_DieselFuelSystem", "KM_82984_Diesel_Fuel_System" },
    substrings = { "gnrealism_fuelsystem", "dieselfuelsystem", "diesel_fuel_system" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-vehicle-state-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, count, withWater, withAir = {}, 0, 0, 0
        local truncated = ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            local state = type(vehicle) == "table" and
                (vehicle["spec_" .. ctx.modName .. ".scFuel"] or vehicle.spec_scFuel) or nil
            if type(state) == "table" and state.activo == true and type(state.filtro) == "table" then
                count = count + 1
                local water = nonnegative(ctx, state.trampa)
                if water ~= nil and water > 0 then withWater = withWater + 1 end
                if state.aire == true then withAir = withAir + 1 end
                local lot = type(state.lotes) == "table" and state.lotes[state.fillUnitDiesel] or nil
                if #rows < MAX_ROWS then
                    rows[#rows + 1] = {
                        farmId = farmId,
                        vehicleId = ctx.clip(vehicle.uniqueId or vehicle.id, 64),
                        vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName"), 70),
                        filterHours = nonnegative(ctx, state.filtro.horas),
                        filterBlockagePct = fractionPct(ctx, state.filtro.obstruccion),
                        trapWaterLitres = water,
                        fuelAgeDays = type(lot) == "table" and nonnegative(ctx, lot.ageDays) or nil,
                        oxidationPct = type(lot) == "table" and fractionPct(ctx, lot.oxidation) or nil,
                        airInLine = state.aire == true,
                        filterMissing = state.sinFiltro == true,
                    }
                else
                    truncated = true
                end
            end
        end
        table.sort(rows, function(a, b) return tostring(a.vehicle or "") < tostring(b.vehicle or "") end)
        return {
            readState = count > 0 and "ok" or "settings-only",
            reason = count == 0 and "no-applicable-owned-vehicle" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                vehicleCount = count, waterTrapCount = withWater, airInLineCount = withAir,
            } },
            rows = rows,
        }
    end,
})
