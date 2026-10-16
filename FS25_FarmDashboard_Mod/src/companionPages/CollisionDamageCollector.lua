-- FS25 FarmDashboard | companionPages/CollisionDamageCollector.lua | v1.0.0
-- Collision Damage (Dude23 1.2.0.0, "Unfallschaden"). Server-side sensor: a sudden speed drop into
-- another object adds wear damage (min 1 %, max 4.5 % per hit, 7 % for heavy machines >= 10 t or combines),
-- scaled by the ESC-menu "damage multiplier" (0-300 %, saved in modSettings/FS25_CollisionDamage).
-- Mod-env table FSCollisionDamage: settings constants, damageMultiplierState, DAMAGE_MULTIPLIER and
--   vehicleStates[vehicle] (weak keys) { lastDamageTime = g_time of the last damaging hit, -100000 if none }
-- vehicleStates is session-only (not saved), so hit recency covers this game session only.
-- Read only: getDamageMultiplierState (writes a default when unset) and every sensor/raycast call are avoided.

local SCAN_VEHICLES = 400
local MAX_ROWS = 50
local NO_HIT = -100000

local function vehicleLabel(ctx, vehicle)
    local name = ctx.call(vehicle, "getFullName")
    if type(name) ~= "string" or name == "" then
        name = ctx.call(vehicle, "getName")
    end
    if type(name) ~= "string" or name == "" then
        name = type(vehicle.typeName) == "string" and vehicle.typeName or nil
    end
    return ctx.clip(name, 60)
end

local function vehicleId(ctx, vehicle, index)
    local id = vehicle.uniqueId or vehicle.id or index
    return ctx.clip(tostring(id), 64)
end

local function ownedVehicles(ctx)
    local farmId = ctx.farmId
    local shared = type(ctx.ownedVehicles) == "function" and ctx.try(ctx.ownedVehicles) or nil
    local source = type(shared) == "table" and shared or nil
    if source == nil then
        local mission = ctx.mission
        local system = type(mission) == "table" and mission.vehicleSystem or nil
        source = type(system) == "table" and type(system.vehicles) == "table" and system.vehicles or nil
    end
    if source == nil then
        return nil, false
    end
    local out, scanned, truncated = {}, 0, false
    local function consider(vehicle)
        scanned = scanned + 1
        if scanned > SCAN_VEHICLES then
            truncated = true
            return false
        end
        if type(vehicle) == "table" then
            local owner = ctx.num(vehicle.ownerFarmId) or ctx.num(ctx.call(vehicle, "getOwnerFarmId"))
            if owner == farmId then
                out[#out + 1] = vehicle
            end
        end
        return true
    end
    if #source > 0 then
        for i = 1, #source do
            if not consider(source[i]) then
                break
            end
        end
    else
        for _, vehicle in pairs(source) do
            if not consider(vehicle) then
                break
            end
        end
    end
    return out, truncated
end

local function pct(ctx, ratio)
    local n = ctx.num(ratio)
    return n ~= nil and ctx.round2(n * 100) or nil
end

local function readSettings(ctx, mod)
    local multiplier = ctx.num(mod.DAMAGE_MULTIPLIER)
    return {
        multiplierPct = multiplier ~= nil and ctx.round2(math.max(0, multiplier) * 100) or nil,
        multiplierState = ctx.num(mod.damageMultiplierState),
        minDamagePct = pct(ctx, mod.MIN_DAMAGE),
        maxDamagePct = pct(ctx, mod.MAX_DAMAGE),
        heavyMaxDamagePct = pct(ctx, mod.HEAVY_MACHINE_MAX_DAMAGE),
        damagePerKmhDropPct = pct(ctx, mod.DAMAGE_PER_KMH_DROP),
        minSpeedKmh = ctx.num(mod.MIN_SPEED_KMH),
        minSpeedDropKmh = ctx.num(mod.MIN_SPEED_DROP_KMH),
        heavyMassT = ctx.num(mod.HEAVY_MACHINE_MIN_MASS_T),
        counterpartDamage = mod.COUNTERPART_DAMAGE_ENABLED == true,
        version = ctx.clip(type(mod.VERSION) == "string" and mod.VERSION or nil, 20),
    }
end

CompanionPages.register({
    key = "collisionDamage",
    modNames = { "FS25_CollisionDamage", "FS25_361963_Collision_Damage" },
    substrings = { "collisiondamage", "collision_damage" },
    collect = function(ctx)
        local mod = ctx.symbol("FSCollisionDamage")
        if type(mod) ~= "table" then
            return nil
        end
        local out = { settings = readSettings(ctx, mod) }
        if ctx.farmId == nil or ctx.farmId <= 0 then
            out.readState = "settings-only"
            out.reason = "no-farm"
            return out
        end
        local vehicles, truncated = ownedVehicles(ctx)
        if vehicles == nil then
            out.readState = "settings-only"
            out.reason = "no-vehicle-list"
            return out
        end
        local states = type(mod.vehicleStates) == "table" and mod.vehicleStates or nil
        local now = ctx.now()
        local farm = { machineCount = 0, heavyCount = 0, hitCount = 0, machines = {} }
        local rows, damageSum, damageN = {}, 0, 0
        for i, vehicle in ipairs(vehicles) do
            if vehicle.spec_motorized ~= nil and vehicle.spec_wearable ~= nil then
                farm.machineCount = farm.machineCount + 1
                local damage = ctx.num(ctx.call(vehicle, "getDamageAmount"))
                local heavy, mass = ctx.call(mod, "isHeavyMachine", vehicle)
                local row = {
                    id = vehicleId(ctx, vehicle, i),
                    name = vehicleLabel(ctx, vehicle),
                    damagePct = damage ~= nil and ctx.round2(math.max(0, math.min(1, damage)) * 100) or nil,
                    heavy = heavy == true,
                    massT = ctx.round2(mass),
                    hitThisSession = false,
                }
                local state = states and ctx.try(function() return states[vehicle] end) or nil
                local last = type(state) == "table" and ctx.num(state.lastDamageTime) or nil
                if last ~= nil and last > NO_HIT then
                    row.hitThisSession = true
                    farm.hitCount = farm.hitCount + 1
                    if now ~= nil and now >= last then
                        row.lastHitMinutesAgo = ctx.round2((now - last) / 60000)
                        if farm.lastHitMinutesAgo == nil or row.lastHitMinutesAgo < farm.lastHitMinutesAgo then
                            farm.lastHitMinutesAgo = row.lastHitMinutesAgo
                        end
                    end
                end
                if row.heavy then
                    farm.heavyCount = farm.heavyCount + 1
                end
                if row.damagePct ~= nil then
                    damageSum = damageSum + row.damagePct
                    damageN = damageN + 1
                end
                rows[#rows + 1] = row
            end
        end
        table.sort(rows, function(a, b)
            if a.hitThisSession ~= b.hitThisSession then
                return a.hitThisSession
            end
            local ma, mb = a.lastHitMinutesAgo or math.huge, b.lastHitMinutesAgo or math.huge
            if ma ~= mb then
                return ma < mb
            end
            local da, db = a.damagePct or -1, b.damagePct or -1
            if da ~= db then
                return da > db
            end
            return tostring(a.id) < tostring(b.id)
        end)
        for i = 1, math.min(#rows, MAX_ROWS) do
            farm.machines[i] = rows[i]
        end
        if damageN > 0 then
            farm.averageDamagePct = ctx.round2(damageSum / damageN)
        end
        out.sessionTracking = states ~= nil
        out.readState = states ~= nil and "ok" or "partial"
        out.coverage = (truncated or #rows > MAX_ROWS) and "truncated" or "complete"
        out.byFarm = { [tostring(ctx.farmId)] = farm }
        return out
    end,
})
