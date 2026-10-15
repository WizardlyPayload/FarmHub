-- FS25 FarmDashboard | companionPages/RestrictedPeriodsCollector.lua | v1.0.0
-- Restricted Periods (Tidde, 1.0.0.0). The mod is one mod-env class, SlurryBan:
--   SlurryBan.isBanActive("liquid"|"solid") -> "sperrfrist" | "frost" | nil   (reads currentPeriod + temperature)
--   SlurryBan.getCurrentTemperature()        -> weather temperature or nil
--   SlurryBan.getVehicleBanCategory(vehicle) -> "liquid" | "solid" | nil       (active fill type only)
-- It only blocks TurnOnVehicle.setIsTurnedOn; it keeps no state, history or settings.
-- All three calls are read-only. The farm vehicle scan is bounded and never exports vehicle objects.

local SCAN_VEHICLES = 150
local MAX_VEHICLES = 20

local function banReason(ctx, ban, category)
    local ok, value = pcall(ban.isBanActive, category)
    if not ok then
        return false, nil
    end
    if value == nil or value == false then
        return true, nil
    end
    return true, ctx.clip(tostring(value), 20)
end

local function vehicleList(mission)
    local system = type(mission) == "table" and mission.vehicleSystem or nil
    local vehicles = type(system) == "table" and system.vehicles or nil
    return type(vehicles) == "table" and vehicles or nil
end

local function scanVehicles(ctx, ban, farmId, liquidReason, solidReason)
    local vehicles = vehicleList(ctx.mission)
    if vehicles == nil or type(ban.getVehicleBanCategory) ~= "function" then
        return nil
    end
    local shared = type(ctx.ownedVehicles) == "function" and ctx.try(ctx.ownedVehicles) or nil
    if type(shared) == "table" then
        vehicles = shared
    end
    local out = { liquid = 0, solid = 0, blocked = 0, rows = {}, truncated = false }
    local scanned = 0
    for _, vehicle in pairs(vehicles) do
        scanned = scanned + 1
        if scanned > SCAN_VEHICLES then
            out.truncated = true
            break
        end
        if type(vehicle) == "table" and ctx.num(vehicle.ownerFarmId) == farmId and type(vehicle.getFillUnits) == "function" then
            local category = ctx.try(ban.getVehicleBanCategory, vehicle)
            if category == "liquid" or category == "solid" then
                out[category] = out[category] + 1
                local reason = category == "liquid" and liquidReason or solidReason
                if reason ~= nil then
                    out.blocked = out.blocked + 1
                end
                if #out.rows < MAX_VEHICLES then
                    out.rows[#out.rows + 1] = {
                        farmId = farmId,
                        name = ctx.clip(ctx.call(vehicle, "getName"), 60),
                        category = category,
                        blocked = reason ~= nil,
                        reason = reason,
                    }
                else
                    out.truncated = true
                end
            end
        end
    end
    return out
end

CompanionPages.register({
    key = "restrictedPeriods",
    modNames = { "FS25_RestrictedPeriods", "FS25_352961_Restricted_Periods", "RestrictedPeriods" },
    substrings = { "restrictedperiods", "restricted_periods" },
    collect = function(ctx)
        local ban = ctx.symbol("SlurryBan")
        if type(ban) ~= "table" or type(ban.isBanActive) ~= "function" then
            return nil
        end
        local period = ctx.envMonth()
        if period == nil then
            return { readState = "settings-only", reason = "no-period" }
        end
        local okLiquid, liquid = banReason(ctx, ban, "liquid")
        local okSolid, solid = banReason(ctx, ban, "solid")
        local out = {
            currentPeriod = period,
            temperature = ctx.round2(ctx.try(ban.getCurrentTemperature)),
            liquidBan = liquid,
            solidBan = solid,
            liquidRead = okLiquid,
            solidRead = okSolid,
            anyActive = liquid ~= nil or solid ~= nil,
        }
        local farmId = ctx.farmId
        if farmId ~= nil and farmId > 0 then
            local scan = scanVehicles(ctx, ban, farmId, liquid, solid)
            if scan ~= nil then
                out.byFarm = {
                    [tostring(farmId)] = {
                        liquidVehicles = scan.liquid,
                        solidVehicles = scan.solid,
                        blockedVehicles = scan.blocked,
                    },
                }
                out.vehicles = scan.rows
                out.vehicleCoverage = scan.truncated and "truncated" or "complete"
            end
        end
        out.readState = (okLiquid and okSolid) and "ok" or "partial"
        return out
    end,
})
