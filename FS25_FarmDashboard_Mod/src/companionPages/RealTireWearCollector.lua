-- Real Tire Wear v1.8.0.0: mounted wheel passports and separate farm spare stock.
-- Read live server objects only. A passport records condition, not a completed repair.

local MAX_WHEELS_PER_VEHICLE = 24
local MAX_WHEEL_SCAN, MAX_WHEEL_ROWS = 400, 80
local MAX_STOCK_SCAN, MAX_STOCK_ROWS = 128, 40

local function wearPercent(ctx, record)
    if type(record) ~= "table" then return nil end
    local inner, center, outer = ctx.num(record.inner), ctx.num(record.center), ctx.num(record.outer)
    if inner == nil or center == nil or outer == nil
        or inner < 0 or inner > 1 or center < 0 or center > 1 or outer < 0 or outer > 1 then
        return nil
    end
    return ctx.round2((inner + center + outer) * 100 / 3)
end

CompanionPages.register({
    key = "realTireWear",
    modNames = { "KM_82753_Real_Tire_Wear", "FS25_RealTireWear" },
    substrings = { "real_tire_wear", "realtirewear" },
    collect = function(ctx)
        local farmId, mission = ctx.farmId, ctx.mission
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-state-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local mounted, spare = {}, {}
        local wheelCount, scanned, invalid = 0, 0, false
        local truncated = ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            local currentOwner = ctx.num(ctx.call(vehicle, "getOwnerFarmId"))
                or ctx.num(vehicle.ownerFarmId)
            local spec = currentOwner == farmId and type(vehicle) == "table" and vehicle.spec_tireWear or nil
            if type(spec) == "table" and spec.enabled == true and type(spec.wheels) == "table" then
                local name = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName"), 70)
                local vehicleId = ctx.clip(vehicle.uniqueId or vehicle.id, 64)
                for index, tire in ipairs(spec.wheels) do
                    if index > MAX_WHEELS_PER_VEHICLE or scanned >= MAX_WHEEL_SCAN then
                        truncated = true
                        break
                    end
                    scanned = scanned + 1
                    local passport = type(tire) == "table" and tire.rtwPassport or nil
                    if type(passport) == "table" then
                        local wear = wearPercent(ctx, passport)
                        local km, roadKm, fieldKm = ctx.num(passport.km), ctx.num(passport.roadKm), ctx.num(passport.fieldKm)
                        local repairs = ctx.num(passport.repairs)
                        local airLoss = ctx.num(tire.airLoss)
                        if airLoss ~= nil and (airLoss < 0 or airLoss > 1) then airLoss = nil end
                        if wear == nil or km == nil or km < 0 or roadKm == nil or roadKm < 0
                            or fieldKm == nil or fieldKm < 0 or repairs == nil or repairs < 0 then
                            invalid = true
                        else
                            wheelCount = wheelCount + 1
                            if #mounted >= MAX_WHEEL_ROWS then
                                truncated = true
                            else
                                mounted[#mounted + 1] = {
                                    farmId = farmId,
                                    vehicleId = vehicleId,
                                    vehicle = name,
                                    wheelIndex = index,
                                    passportId = ctx.clip(passport.id, 40),
                                    wearPct = wear,
                                    km = ctx.round2(km),
                                    roadKm = ctx.round2(roadKm),
                                    fieldKm = ctx.round2(fieldKm),
                                    repairs = math.floor(repairs),
                                    damaged = tire.damaged == true,
                                    airLossPct = airLoss and ctx.round2(airLoss * 100) or nil,
                                }
                            end
                        end
                    end
                end
            end
        end

        local inventory = ctx.symbol("RTWInventory") or ctx.global("RTWInventory")
        local stockReady = type(inventory) == "table" and inventory.loaded == true
            and inventory.mission == mission and type(inventory.farms) == "table"
        local stockCount = nil
        if stockReady then
            local farm = inventory.farms[farmId]
            local stock = type(farm) == "table" and farm.stock or nil
            if type(stock) == "table" then
                stockCount = 0
                for _, record in ipairs(stock) do
                    if stockCount >= MAX_STOCK_SCAN then truncated = true; break end
                    local wear = wearPercent(ctx, record)
                    local km, repairs = ctx.num(record.km), ctx.num(record.repairs)
                    if wear == nil or km == nil or km < 0 or repairs == nil or repairs < 0 then
                        invalid = true
                    else
                        stockCount = stockCount + 1
                        if #spare >= MAX_STOCK_ROWS then
                            truncated = true
                        else
                            spare[#spare + 1] = {
                                farmId = farmId,
                                passportId = ctx.clip(record.id, 40),
                                size = ctx.clip(record.size, 100),
                                wearPct = wear,
                                km = ctx.round2(km),
                                repairs = math.floor(repairs),
                                damaged = record.damaged == true,
                            }
                        end
                    end
                end
            elseif farm ~= nil then
                invalid = true
            else
                stockCount = 0
            end
        end
        table.sort(mounted, function(a, b)
            local av, bv = tostring(a.vehicle or ""), tostring(b.vehicle or "")
            return av == bv and a.wheelIndex < b.wheelIndex or av < bv
        end)
        local hasRows = wheelCount > 0 or (stockCount or 0) > 0
        local readState = "settings-only"
        if invalid or (hasRows and not stockReady) then
            readState = "partial"
        elseif hasRows then
            readState = "ok"
        end
        local coverage = "complete"
        if truncated then
            coverage = "truncated"
        elseif invalid or not stockReady then
            coverage = "partial"
        end
        return {
            readState = readState,
            reason = not hasRows and "no-readable-tire-records" or nil,
            coverage = coverage,
            stockState = stockReady and "ready" or "unavailable",
            byFarm = { [tostring(farmId)] = { mountedCount = wheelCount, spareCount = stockCount } },
            mounted = mounted,
            spare = spare,
        }
    end,
})
