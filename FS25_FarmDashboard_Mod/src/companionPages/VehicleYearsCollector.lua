-- FS25 FarmDashboard | companionPages/VehicleYearsCollector.lua | v1.0.0
-- Vehicle Years (Thalley 1.0.0.6). On mission load the mod looks up every shop item in its bundled
-- data/<store xml>.xml table (or the vehicle mod's own storeData.year) and stores the result on
--   storeItem.specs.year          (number or nil; "TBD" entries are left nil)
-- It also adds "< 1950" … "2020s" shop packs. Mod-env table: VehicleYears { modActivated }.
-- Read only: loadYear is never called (it loads XML and adds pack items); only specs.year is read.

local SCAN_VEHICLES = 400
local MAX_ROWS = 50
local SCAN_STORE = 6000

local DECADES = {
    { id = "pre1950", max = 1950 },
    { id = "1950s", max = 1960 },
    { id = "1960s", max = 1970 },
    { id = "1970s", max = 1980 },
    { id = "1980s", max = 1990 },
    { id = "1990s", max = 2000 },
    { id = "2000s", max = 2010 },
    { id = "2010s", max = 2020 },
    { id = "2020s", max = 2030 },
}

local function decadeOf(year)
    for _, d in ipairs(DECADES) do
        if year < d.max then
            return d.id
        end
    end
    return "2030s"
end

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

local function storeItemFor(ctx, store, vehicle)
    local item = vehicle.storeItem
    if type(item) == "table" and type(item.specs) == "table" then
        return item
    end
    local file = vehicle.configFileName
    if type(file) ~= "string" then
        return nil
    end
    item = ctx.call(store, "getItemByXMLFilename", file)
    return type(item) == "table" and item or nil
end

local function yearOf(ctx, item)
    local specs = type(item) == "table" and item.specs or nil
    if type(specs) ~= "table" then
        return nil
    end
    local year = ctx.num(specs.year)
    if year == nil or year < 1800 or year > 2200 then
        return nil
    end
    return math.floor(year)
end

--- Shop-wide coverage: how many shop vehicles the mod gave a year. Bounded; plain field reads only.
local function storeCoverage(ctx, store)
    local items = ctx.call(store, "getItems")
    if type(items) ~= "table" then
        return nil
    end
    local total, withYear, scanned = 0, 0, 0
    for _, item in pairs(items) do
        scanned = scanned + 1
        if scanned > SCAN_STORE then
            break
        end
        if type(item) == "table" and item.showInStore ~= false then
            local lower = type(item.xmlFilenameLower) == "string" and item.xmlFilenameLower or ""
            if string.find(lower, "/vehicles/", 1, true) or string.find(lower, "/handtools/", 1, true) then
                total = total + 1
                if yearOf(ctx, item) ~= nil then
                    withYear = withYear + 1
                end
            end
        end
    end
    return { shopItems = total, withYear = withYear, truncated = scanned > SCAN_STORE }
end

CompanionPages.register({
    key = "vehicleYears",
    modNames = { "FS25_Vehicle_Years", "FS25_VehicleYears" },
    substrings = { "vehicle_years", "vehicleyears" },
    collect = function(ctx)
        local mod = ctx.symbol("VehicleYears")
        local store = ctx.global("g_storeManager")
        local out = { activated = type(mod) == "table" and mod.modActivated == true or nil }
        if type(store) ~= "table" then
            out.readState = "detection-only"
            out.reason = "no-store"
            return out
        end
        out.store = storeCoverage(ctx, store)
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
        local farm = { vehicleCount = 0, knownCount = 0, unknownCount = 0, byDecade = {}, vehicles = {} }
        local rows, decadeCounts, yearSum = {}, {}, 0
        for i, vehicle in ipairs(vehicles) do
            if vehicle.rootVehicle == nil or vehicle.rootVehicle == vehicle then
                local item = storeItemFor(ctx, store, vehicle)
                local year = yearOf(ctx, item)
                farm.vehicleCount = farm.vehicleCount + 1
                local row = {
                    id = vehicleId(ctx, vehicle, i),
                    name = vehicleLabel(ctx, vehicle),
                    year = year,
                    category = type(item) == "table" and ctx.clip(item.categoryName, 40) or nil,
                    brand = type(item) == "table" and ctx.clip(item.brandNameRaw, 40) or nil,
                }
                if year ~= nil then
                    farm.knownCount = farm.knownCount + 1
                    yearSum = yearSum + year
                    row.decade = decadeOf(year)
                    decadeCounts[row.decade] = (decadeCounts[row.decade] or 0) + 1
                    farm.oldestYear = farm.oldestYear == nil and year or math.min(farm.oldestYear, year)
                    farm.newestYear = farm.newestYear == nil and year or math.max(farm.newestYear, year)
                else
                    farm.unknownCount = farm.unknownCount + 1
                end
                rows[#rows + 1] = row
            end
        end
        table.sort(rows, function(a, b)
            local ya, yb = a.year or 99999, b.year or 99999
            if ya ~= yb then
                return ya < yb
            end
            return tostring(a.id) < tostring(b.id)
        end)
        for i = 1, math.min(#rows, MAX_ROWS) do
            farm.vehicles[i] = rows[i]
        end
        for _, d in ipairs(DECADES) do
            if decadeCounts[d.id] then
                farm.byDecade[#farm.byDecade + 1] = { decade = d.id, count = decadeCounts[d.id] }
            end
        end
        if decadeCounts["2030s"] then
            farm.byDecade[#farm.byDecade + 1] = { decade = "2030s", count = decadeCounts["2030s"] }
        end
        if farm.knownCount > 0 then
            farm.averageYear = math.floor(yearSum / farm.knownCount + 0.5)
        end
        out.readState = type(mod) == "table" and "ok" or "partial"
        out.coverage = (truncated or #rows > MAX_ROWS) and "truncated" or "complete"
        out.byFarm = { [tostring(ctx.farmId)] = farm }
        return out
    end,
})
