-- Automatic Tramline System 1.6.0.0 records sowing work-area square metres
-- per seeder. These counters are not field assignments or tramline lengths.

local MAX_ROWS = 120
local MAX_AREA_M2 = 1000000000
local ALLOWED_MODES = {
    Pause = true, Dauer = true, Manuel = true, GPS = true,
    Courseplay = true, EnhancedVehicle = true,
}

local function finite(value, minimum, maximum)
    local n = tonumber(value)
    if n == nil or n ~= n or n == math.huge or n == -math.huge
        or n < minimum or n > maximum then return nil end
    return n
end

local function integer(value, minimum, maximum)
    local n = finite(value, minimum, maximum)
    if n == nil or n ~= math.floor(n) then return nil end
    return n
end

CompanionPages.register({
    key = "automaticTramlineSystem",
    modNames = { "FS25_AutomaticTramlineSystem", "FS25_355320_Automatic_Tramline_System" },
    collect = function(ctx)
        if ctx.version ~= "1.6.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = integer(ctx.farmId, 1, 1000000)
        if farmId == nil then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-seeder-state-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, seen = {}, {}
        local count, recorded, totalM2, sessionM2 = 0, 0, 0, 0
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = integer(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId, 1, 1000000)
                local spec = vehicle.spec_fahrgassenAutomatik
                if owner == farmId and type(spec) == "table" and type(vehicle.spec_sowingMachine) == "table" then
                    local id = ctx.call(vehicle, "getUniqueId") or vehicle.uniqueId
                    local area = finite(spec.areaTotal, 0, MAX_AREA_M2)
                    local session = finite(spec.areaSession, 0, MAX_AREA_M2)
                    -- The mod briefly stores pass 0 when changing modes.
                    local pass = integer(spec.pass, 0, 30)
                    local sequence = integer(spec.N, 2, 30)
                    local mode = spec.mode
                    if type(id) ~= "string" or id == "" or #id > 80 or seen[id]
                        or area == nil or session == nil or session > area
                        or pass == nil or sequence == nil or pass > sequence
                        or type(mode) ~= "string" or not ALLOWED_MODES[mode] then
                        invalid = true
                    else
                        seen[id] = true
                        count = count + 1
                        if area > 0 then recorded = recorded + 1 end
                        totalM2 = totalM2 + area
                        sessionM2 = sessionM2 + session
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId,
                                vehicleId = id,
                                vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                    or ctx.call(vehicle, "getName"), 80),
                                mode = mode, currentPass = pass, passSequence = sequence,
                                totalHectares = area / 10000,
                                sessionHectares = session / 10000,
                            }
                        else truncated = true end
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return a.vehicleId < b.vehicleId end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or count > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-seeder-state" or count == 0 and not incomplete
                and "no-owned-compatible-seeder" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = not incomplete and { [tostring(farmId)] = {
                seederCount = count, recordedSeederCount = recorded,
                totalHectares = totalM2 / 10000,
                sessionHectares = sessionM2 / 10000,
            } } or nil,
            rows = rows,
        }
    end,
})
