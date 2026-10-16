-- FS25 FarmDashboard | companionPages/CourseplayCollector.lua | v1.0.0
-- Courseplay (8.1.x). Global g_Courseplay (Courseplay object) with globalSettings (CpGlobalSettings):
-- named AIParameterSetting objects (getValue / getString). Per vehicle, Courseplay specializations add:
--   getIsCpActive, getIsCpFieldWorkActive, getIsCpDriveToFieldWorkActive, getIsCpCourseRecorderActive,
--   getCourses (Course objects: getName, getNumberOfWaypoints, getWorkWidth, getMultiTools),
--   getCpStartText (selected job label) and spec_cpHud.status (CpStatus: plain progress fields).
-- Only read-only getters and plain status fields are used; no job, course or setting is started or changed.
-- Detection is by exact folder name: a "courseplay" substring would also match FS25_CourseplayGps.

local SCAN_VEHICLES = 400
local MAX_ROWS = 40
local MAX_COURSES = 4

local GLOBAL_SETTINGS = {
    "wageModifier",
    "autoRepair",
    "fuelThreshold",
    "waitForRefueling",
    "brokenThreshold",
    "stopThreshingDuringRain",
    "fruitDestruction",
    "expertModeActive",
    "distanceUnit",
}

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

local function findSetting(ctx, settings, name)
    local direct = ctx.try(function() return settings[name] end)
    if type(direct) == "table" then
        return direct
    end
    local list = ctx.try(function() return settings.settings end)
    if type(list) == "table" then
        for i = 1, math.min(#list, 200) do
            local s = list[i]
            if type(s) == "table" and s.name == name then
                return s
            end
        end
    end
    return nil
end

local function readGlobalSettings(ctx, cp)
    local settings = type(cp) == "table" and cp.globalSettings or nil
    if type(settings) ~= "table" then
        return nil
    end
    local rows = {}
    for _, name in ipairs(GLOBAL_SETTINGS) do
        local setting = findSetting(ctx, settings, name)
        if setting ~= nil then
            local value = ctx.call(setting, "getValue")
            local text = ctx.call(setting, "getString")
            local row = { name = name }
            if type(value) == "number" then
                row.value = ctx.num(value)
            elseif type(value) == "boolean" then
                row.value = value
            end
            if type(text) == "string" then
                row.text = ctx.clip(text, 40)
            end
            if row.value ~= nil or row.text ~= nil then
                rows[#rows + 1] = row
            end
        end
    end
    return rows
end

local function readCourses(ctx, vehicle)
    local courses = ctx.call(vehicle, "getCourses")
    if type(courses) ~= "table" then
        return nil
    end
    local out = { names = {}, waypoints = 0, count = 0 }
    for i = 1, math.min(#courses, MAX_COURSES) do
        local course = courses[i]
        if type(course) == "table" then
            out.count = out.count + 1
            local name = ctx.call(course, "getName")
            out.names[#out.names + 1] = (type(name) == "string" and name ~= "") and ctx.clip(name, 60) or ""
            out.waypoints = out.waypoints + (ctx.num(ctx.call(course, "getNumberOfWaypoints")) or 0)
            if i == 1 then
                out.workWidth = ctx.round2(ctx.call(course, "getWorkWidth"))
                out.multiTools = ctx.num(ctx.call(course, "getMultiTools"))
            end
        end
    end
    if #courses > MAX_COURSES then
        out.count = #courses
    end
    return out
end

local function readStatus(ctx, vehicle)
    local hud = vehicle.spec_cpHud
    local status = type(hud) == "table" and hud.status or nil
    if type(status) ~= "table" then
        return nil
    end
    local text = status.remainingTimeText
    return {
        isActive = status.isActive == true,
        waypoint = ctx.num(status.currentWaypointIx),
        waypoints = ctx.num(status.numberOfWaypoints),
        remainingTime = type(text) == "string" and text ~= "" and ctx.clip(text, 24) or nil,
        balesLeft = ctx.num(status.numBalesLeftOver),
        compactionPct = ctx.round2(status.compactionPercentage),
        fillLeftPct = ctx.round2(status.fillLevelPercentageLeftOver),
    }
end

CompanionPages.register({
    key = "courseplay",
    modNames = { "FS25_Courseplay" },
    collect = function(ctx)
        local cp = ctx.symbol("g_Courseplay") or ctx.global("g_Courseplay")
        local out = { globalSettings = readGlobalSettings(ctx, cp) }
        if ctx.farmId == nil or ctx.farmId <= 0 then
            out.readState = out.globalSettings ~= nil and "settings-only" or "detection-only"
            out.reason = "no-farm"
            return out
        end
        local vehicles, truncated = ownedVehicles(ctx)
        if vehicles == nil then
            out.readState = out.globalSettings ~= nil and "settings-only" or "detection-only"
            out.reason = "no-vehicle-list"
            return out
        end
        local farm = { cpVehicleCount = 0, activeCount = 0, fieldWorkCount = 0, withCourseCount = 0, recordingCount = 0, helperCount = 0, vehicles = {} }
        local rows = {}
        for i, vehicle in ipairs(vehicles) do
            local capable = vehicle.spec_cpAIWorker ~= nil or type(vehicle.getIsCpActive) == "function"
            if capable then
                farm.cpVehicleCount = farm.cpVehicleCount + 1
                local active = ctx.call(vehicle, "getIsCpActive") == true
                local aiActive = ctx.call(vehicle, "getIsAIActive") == true
                local courses = readCourses(ctx, vehicle)
                local startText = ctx.call(vehicle, "getCpStartText")
                local row = {
                    id = vehicleId(ctx, vehicle, i),
                    name = vehicleLabel(ctx, vehicle),
                    cpActive = active,
                    otherHelper = aiActive and not active,
                    fieldWork = ctx.call(vehicle, "getIsCpFieldWorkActive") == true,
                    driveToField = ctx.call(vehicle, "getIsCpDriveToFieldWorkActive") == true,
                    recording = ctx.call(vehicle, "getIsCpCourseRecorderActive") == true,
                    selectedJob = type(startText) == "string" and startText ~= "---" and ctx.clip(startText, 60) or nil,
                    courses = courses,
                    status = active and readStatus(ctx, vehicle) or nil,
                }
                if active then
                    farm.activeCount = farm.activeCount + 1
                end
                if row.fieldWork then
                    farm.fieldWorkCount = farm.fieldWorkCount + 1
                end
                if row.otherHelper then
                    farm.helperCount = farm.helperCount + 1
                end
                if courses ~= nil and courses.count > 0 then
                    farm.withCourseCount = farm.withCourseCount + 1
                end
                if row.recording then
                    farm.recordingCount = farm.recordingCount + 1
                end
                rows[#rows + 1] = row
            end
        end
        table.sort(rows, function(a, b)
            if a.cpActive ~= b.cpActive then
                return a.cpActive
            end
            local ca = a.courses ~= nil and a.courses.count > 0
            local cb = b.courses ~= nil and b.courses.count > 0
            if ca ~= cb then
                return ca
            end
            return tostring(a.name or a.id) < tostring(b.name or b.id)
        end)
        for i = 1, math.min(#rows, MAX_ROWS) do
            farm.vehicles[i] = rows[i]
        end
        out.readState = type(cp) == "table" and "ok" or "partial"
        out.coverage = (truncated or #rows > MAX_ROWS) and "truncated" or "complete"
        out.byFarm = { [tostring(ctx.farmId)] = farm }
        return out
    end,
})
