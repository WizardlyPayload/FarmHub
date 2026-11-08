-- Implement Maintenance v1.1.0.0: current component wear and saved service
-- entries on implements this farm owns now. Entries have no creator farm ID.
local GROUPS = { "contacto", "transmision", "hidraulica", "neumaticos" }
local MAX_VEHICLES = 80
local MAX_SERVICES = 20

local function nonnegative(ctx, value, limit)
    local n = ctx.num(value)
    if n ~= nil and n >= 0 and n <= limit then return n end
    return nil
end

local function whole(ctx, value, limit)
    local n = nonnegative(ctx, value, limit)
    if n ~= nil and n == math.floor(n) then return n end
    return nil
end

CompanionPages.register({
    key = "implementMaintenance",
    modNames = { "KM_81822_implement-maintenance", "FS25_MantenimientoImplementos", "FS25_GN_MantenimientoImplementos" },
    substrings = { "implement-maintenance", "mantenimientoimplementos" },
    collect = function(ctx)
        if ctx.version ~= "1.1.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = whole(ctx, ctx.farmId, 8)
        if farmId == nil or farmId == 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-implement-state-only" }
        end
        local wearGroups = ctx.symbol("MIWearGroups")
        if type(wearGroups) ~= "table" or type(wearGroups.applies) ~= "function" then
            return { readState = "settings-only", reason = "no-wear-groups" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, ids = {}, {}
        local count, serviceCount = 0, 0
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = whole(ctx, ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId, 8)
                local spec = vehicle.spec_gnImplementMaintenance
                    or vehicle["spec_" .. ctx.modName .. ".gnImplementMaintenance"]
                if owner == farmId and type(spec) == "table" then
                    local id = ctx.call(vehicle, "getUniqueId") or vehicle.uniqueId
                    if type(id) ~= "string" or id == "" or #id > 80 then
                        invalid = true
                    else
                        ids[id] = (ids[id] or 0) + 1
                        if ids[id] > 1 then invalid = true end
                        local hours = nonnegative(ctx, spec.operatingHours, 1000000)
                        local grease = nonnegative(ctx, spec.hoursSinceGrease, 1000000)
                        local service = nonnegative(ctx, spec.hoursSinceGeneralService, 1000000)
                        local log = spec.serviceLog
                        local groups = {}
                        local bad = hours == nil or grease == nil or service == nil
                            or type(spec.categories) ~= "table" or type(spec.wear) ~= "table"
                            or type(spec.partQuality) ~= "table" or type(log) ~= "table"
                        if not bad then
                            for _, key in ipairs(GROUPS) do
                                local applies = ctx.try(wearGroups.applies, spec.categories, key)
                                if type(applies) ~= "boolean" then bad = true; break end
                                if applies then
                                    local value = nonnegative(ctx, spec.wear[key], 1)
                                    local quality = whole(ctx, spec.partQuality[key], 2)
                                    if value == nil or (quality ~= 1 and quality ~= 2) then
                                        bad = true; break
                                    end
                                    groups[#groups + 1] = {
                                        key = key, wearPercent = ctx.round2(value * 100),
                                        quality = quality == 1 and "generic" or "original",
                                    }
                                end
                            end
                        end
                        local services = {}
                        if not bad then
                            if #log > MAX_SERVICES then bad = true end
                            for _, entry in ipairs(log) do
                                if type(entry) ~= "table" then bad = true; break end
                                local day = whole(ctx, entry.dia, 65535)
                                local period = whole(ctx, entry.mes, 12)
                                local meter = whole(ctx, entry.horas, 65535)
                                local quantity = whole(ctx, entry.cantidad, 15)
                                local key = entry.grupo
                                local known = false
                                for _, groupKey in ipairs(GROUPS) do
                                    if key == groupKey then known = true; break end
                                end
                                if day == nil or period == nil or period < 1
                                    or meter == nil or quantity == nil or quantity < 1
                                    or not known or (entry.calidad ~= 1 and entry.calidad ~= 2) then
                                    bad = true; break
                                end
                                services[#services + 1] = {
                                    day = day, period = period, meterHours = meter,
                                    group = key, quality = entry.calidad == 1 and "generic" or "original",
                                    quantity = quantity,
                                }
                            end
                        end
                        if bad then
                            invalid = true
                        else
                            count = count + 1
                            serviceCount = serviceCount + #services
                            if #rows < MAX_VEHICLES then
                                rows[#rows + 1] = {
                                    farmId = farmId, vehicleId = id,
                                    vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                        or ctx.call(vehicle, "getName"), 80),
                                    operatingHours = ctx.round2(hours),
                                    hoursSinceGrease = ctx.round2(grease),
                                    hoursSinceGeneralService = ctx.round2(service),
                                    groups = groups, services = services,
                                }
                            else truncated = true end
                        end
                    end
                end
            end
        end
        if invalid then
            local unique = {}
            for _, row in ipairs(rows) do
                if ids[row.vehicleId] == 1 then unique[#unique + 1] = row end
            end
            rows = unique
        end
        table.sort(rows, function(a, b) return a.vehicleId < b.vehicleId end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or "ok",
            reason = invalid and "invalid-implement-state" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                vehicleCount = not incomplete and count or nil,
                serviceCount = not incomplete and serviceCount or nil,
            } },
            rows = rows,
        }
    end,
})
