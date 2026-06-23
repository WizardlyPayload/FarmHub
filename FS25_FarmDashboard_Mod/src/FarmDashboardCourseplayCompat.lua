-- FS25 FarmDashboard | FarmDashboardCourseplayCompat.lua | v3.3.21
-- Authority-only: spawn-window stubs for half-initialized shop vehicles + Courseplay stream guards.
-- Incremental fleet cache via Vehicle.register (no Vehicle.update / fleet-wide per-frame patching).

FarmDashboardCourseplayCompat = {}
FarmDashboardCourseplayCompat._spawnShieldInstalled = false
FarmDashboardCourseplayCompat._lifecycleGuardsInstalled = false
FarmDashboardCourseplayCompat._fleetHooksInstalled = false
FarmDashboardCourseplayCompat._cpGuardsInstalled = false
FarmDashboardCourseplayCompat._pendingRegisters = {}
FarmDashboardCourseplayCompat._stubbedList = {}
FarmDashboardCourseplayCompat._stubMeta = setmetatable({}, { __mode = "k" })
FarmDashboardCourseplayCompat._fleetSeeded = false
FarmDashboardCourseplayCompat._missionAccessGuardInstalled = false

local function isAuthority()
    return FarmDashboard and FarmDashboard.isAuthority and FarmDashboard:isAuthority()
end

local function getDataCollector()
    return rawget(_G, "FarmDashboardDataCollector")
end

local function vehicleIsAlive(vehicle)
    if vehicle == nil then return false end
    local vdc = rawget(_G, "VehicleDataCollector")
    if vdc and vdc._isVehicleAlive then
        local ok, alive = pcall(function() return vdc:_isVehicleAlive(vehicle) end)
        if ok then return alive == true end
    end
    if type(vehicle.getOwnerFarmId) ~= "function" or type(vehicle.getName) ~= "function" then
        return false
    end
    return true
end

--- True when getOwnerFarmId/getName resolve to real class methods, not only our temporary instance stubs.
local function probeRealMethod(object, methodName)
    if object == nil or type(object[methodName]) ~= "function" then
        return false
    end
    local saved = object[methodName]
    object[methodName] = nil
    local hasReal = type(object[methodName]) == "function"
    if not hasReal then
        object[methodName] = saved
    end
    return hasReal
end

local function vehicleHasRealIdentity(vehicle)
    return probeRealMethod(vehicle, "getOwnerFarmId") and probeRealMethod(vehicle, "getName")
end

local function needsSpawnStubs(vehicle)
    return vehicle ~= nil and not vehicleIsAlive(vehicle)
end

-- Job-parameters stub. Only used by the last-resort noop fallback below.
local function makeJobParamsStub()
    return {
        __farmDashStub = true,
        getName = function() return "" end,
    }
end

-- LAST-RESORT fallback only. A noop job keeps the SERVER from crashing on `spec.cpJob:writeStream`,
-- but because it writes nothing to the network stream it will DESYNC a joining MP client's onReadStream
-- (garbage "Setting value bugged" -> client crash). We therefore only fall back to this if a real
-- Courseplay job cannot be created (see makeCpJob).
local function makeNoopCpJobStub()
    return {
        __farmDashStub = true,
        writeStream = function() end,
        readStream = function() end,
        saveToXMLFile = function() end,
        getCpJobParameters = function() return makeJobParamsStub() end,
    }
end

-- Resolve a Courseplay job-type index by name. The `AIJobType` enum global is NOT visible from
-- FarmDashboard's isolated Lua environment (Courseplay populates ITS own _G), so we must go through
-- the shared g_currentMission.aiJobTypeManager object, whose nameToIndex map is filled by Courseplay's
-- registerJobType. getJobTypeIndexByName upper-cases the name and returns nameToIndex[name].
-- Only successful numeric lookups are cached (job types may not be registered the first time we probe).
local _jobTypeIndexCache = {}
local function resolveJobTypeIndex(jobName)
    if jobName == nil then return nil end
    local cached = _jobTypeIndexCache[jobName]
    if cached ~= nil then return cached end

    local idx
    local mission = _G.g_currentMission
    local mgr = mission and mission.aiJobTypeManager
    if mgr ~= nil then
        if type(mgr.getJobTypeIndexByName) == "function" then
            local ok, res = pcall(function() return mgr:getJobTypeIndexByName(jobName) end)
            if ok and type(res) == "number" then idx = res end
        end
        if idx == nil and type(mgr.nameToIndex) == "table" then
            local n = mgr.nameToIndex[jobName] or mgr.nameToIndex[string.upper(jobName)]
            if type(n) == "number" then idx = n end
        end
    end
    if idx == nil then
        local ait = rawget(_G, "AIJobType")
        if type(ait) == "table" and type(ait[jobName]) == "number" then
            idx = ait[jobName]
        end
    end

    if type(idx) == "number" then
        _jobTypeIndexCache[jobName] = idx
        return idx
    end
    return nil
end

-- Build the job to drop into a half-loaded Courseplay spec. We prefer a REAL Courseplay job
-- (g_currentMission.aiJobTypeManager:createJob) because its writeStream produces exactly the byte
-- layout the client's onReadStream expects (isDirectStart, jobId, namedParameters, currentTaskIndex,
-- cpJobParameters) -> no MP desync. We deliberately do NOT call setVehicle: the stream does not need
-- it and touching a half-loaded vehicle inside Courseplay could crash. Courseplay's own onLoad later
-- overwrites spec.cpJob with its fully-configured job, so this is only a placeholder for the gap.
local _cpJobDiagLogged = {}
local function logCpJobDiagOnce(jobName, msg)
    if _cpJobDiagLogged[jobName] then return end
    _cpJobDiagLogged[jobName] = true
    if _G.Logging and Logging.info then
        Logging.info("[FarmDash] cpJob placeholder %s: %s", tostring(jobName), tostring(msg))
    end
end

-- Creating a Courseplay job builds its parameter dropdowns, which enumerate
-- g_currentMission.storageSystem:getUnloadingStations() and call accessHandler:canPlayerAccess(station)
-- (-> station:getOwnerFarmId()) and station:getName(). During a shop spawn the spawning vehicle's own
-- unloading station is already in that list but not fully loaded, so those calls throw and createJob
-- fails. We temporarily install getOwnerFarmId()/getName() on any station missing them ONLY for the
-- duration of our createJob call, then remove them again so we never permanently shadow a real
-- station's class methods.
local function callWithStationStubs(fn)
    local added = {}
    local mission = _G.g_currentMission
    local ss = mission and mission.storageSystem
    if ss ~= nil and type(ss.getUnloadingStations) == "function" then
        local okS, stations = pcall(function() return ss:getUnloadingStations() end)
        if okS and type(stations) == "table" then
            for _, st in pairs(stations) do
                if type(st) == "table" then
                    if type(st.getOwnerFarmId) ~= "function" then
                        st.getOwnerFarmId = function() return 0 end
                        added[#added + 1] = { st, "getOwnerFarmId" }
                    end
                    if type(st.getName) ~= "function" then
                        st.getName = function() return "" end
                        added[#added + 1] = { st, "getName" }
                    end
                end
            end
        end
    end

    local ok, r1, r2, r3, r4 = pcall(fn)

    for _, entry in ipairs(added) do
        entry[1][entry[2]] = nil
    end

    if not ok then return false, r1 end
    return true, r1, r2, r3, r4
end

local function makeCpJob(jobName)
    local mission = _G.g_currentMission
    local mgr = mission and mission.aiJobTypeManager
    if mgr == nil or type(mgr.createJob) ~= "function" then
        logCpJobDiagOnce(jobName, "NO aiJobTypeManager:createJob -> noop fallback (MP client will desync)")
        return makeNoopCpJobStub()
    end
    local idx = resolveJobTypeIndex(jobName)
    if idx == nil then
        logCpJobDiagOnce(jobName, "job-type index UNRESOLVED -> noop fallback (MP client will desync)")
        return makeNoopCpJobStub()
    end
    local ok, job = callWithStationStubs(function() return mgr:createJob(idx) end)
    if not ok then
        logCpJobDiagOnce(jobName, string.format("createJob(%s) ERROR: %s -> noop fallback", tostring(idx), tostring(job)))
        return makeNoopCpJobStub()
    end
    if type(job) ~= "table" then
        logCpJobDiagOnce(jobName, string.format("createJob(%s) returned %s -> noop fallback", tostring(idx), type(job)))
        return makeNoopCpJobStub()
    end
    local np = type(job.namedParameters) == "table" and #job.namedParameters or -1
    logCpJobDiagOnce(jobName, string.format("REAL job created (idx=%s, namedParameters=%d, hasWriteStream=%s)",
        tostring(idx), np, tostring(type(job.writeStream) == "function")))
    return job
end

-- Every Courseplay AI-worker specialization creates its job(s) in onLoad and then blindly indexes
-- them in onWriteStream / onReadStream / saveToXMLFile (e.g. `spec.cpJob:writeStream(...)`). On a
-- server, shop vehicles load asynchronously, so these stream events can fire before onLoad has run,
-- when the job field is still nil -> "attempt to index nil with 'writeStream'". We must cover ALL of
-- these specs, not just the combine unloader. The spec field is the clean alias set in each spec's
-- onLoad; the job field names are exactly what that spec dereferences.
local CP_WORKER_SPECS = {
    { spec = "spec_cpAICombineUnloader", cpClass = "CpAICombineUnloader", jobName = "COMBINE_UNLOADER_CP", jobs = { "cpJob" } },
    { spec = "spec_cpAISiloLoaderWorker", cpClass = "CpAISiloLoaderWorker", jobName = "SILO_LOADER_CP", jobs = { "cpJob" } },
    { spec = "spec_cpAIBunkerSiloWorker", cpClass = "CpAIBunkerSiloWorker", jobName = "BUNKER_SILO_CP", jobs = { "cpJob" } },
    { spec = "spec_cpAIBaleFinder", cpClass = "CpAIBaleFinder", jobName = "BALE_FINDER_CP", jobs = { "cpJob" } },
    { spec = "spec_cpAIFieldWorker", cpClass = "CpAIFieldWorker", jobName = "FIELDWORK_CP", jobs = { "cpJob", "cpJobStartAtFirstWp", "cpJobStartAtLastWp" } },
}

-- Courseplay onLoad assigns spec_cpAICombineUnloader = self["spec_<mod>.cpAICombineUnloader"].
-- Stream/update handlers can fire before that alias exists; link it early from the internal spec slot.
local function resolveCpSpecAlias(vehicle, aliasKey, cpGlobalName)
    if vehicle == nil or aliasKey == nil then return nil end
    local spec = vehicle[aliasKey]
    if type(spec) == "table" then return spec end

    local cpClass = rawget(_G, cpGlobalName)
    if cpClass == nil or cpClass.SPEC_NAME == nil then return nil end

    local internalKey = "spec_" .. cpClass.SPEC_NAME
    local internal = vehicle[internalKey]
    if type(internal) == "table" then
        vehicle[aliasKey] = internal
        return internal
    end
    return nil
end

local function resolveAllCpSpecAliases(vehicle)
    if vehicle == nil then return end
    for _, entry in ipairs(CP_WORKER_SPECS) do
        resolveCpSpecAlias(vehicle, entry.spec, entry.cpClass)
    end
end

-- True while any Courseplay worker spec on the vehicle still carries one of our noop stub jobs
-- (i.e. Courseplay's own onLoad has not yet replaced it with the real job).
local function vehicleHasStubbedCpJob(vehicle)
    if vehicle == nil then return false end
    for _, entry in ipairs(CP_WORKER_SPECS) do
        local spec = resolveCpSpecAlias(vehicle, entry.spec, entry.cpClass) or vehicle[entry.spec]
        if type(spec) == "table" then
            for _, jobField in ipairs(entry.jobs) do
                local job = spec[jobField]
                if type(job) == "table" and job.__farmDashStub then
                    return true
                end
            end
        end
    end
    return false
end

local function removeStubbedEntry(vehicle)
    for i = #FarmDashboardCourseplayCompat._stubbedList, 1, -1 do
        if FarmDashboardCourseplayCompat._stubbedList[i] == vehicle then
            table.remove(FarmDashboardCourseplayCompat._stubbedList, i)
            break
        end
    end
end

function FarmDashboardCourseplayCompat.clearSpawnStubs(vehicle)
    if vehicle == nil then return end
    local meta = FarmDashboardCourseplayCompat._stubMeta[vehicle]
    if meta == nil then return end

    -- Drop instance identity overrides only when real class methods are available underneath.
    -- Clearing too early (while only our stub existed) caused packetReceived AccessHandler errors.
    if meta.hadGetOwnerFarmId == false then
        vehicle.getOwnerFarmId = nil
        if type(vehicle.getOwnerFarmId) ~= "function" then
            vehicle.getOwnerFarmId = function() return 0 end
        else
            meta.hadGetOwnerFarmId = true
        end
    end
    if meta.hadGetName == false then
        vehicle.getName = nil
        if type(vehicle.getName) ~= "function" then
            vehicle.getName = function() return "" end
        else
            meta.hadGetName = true
        end
    end

    -- Drop our placeholder isa() only when the object's real class isa is available underneath.
    if meta.hadIsa == false then
        vehicle.isa = nil
        if type(vehicle.isa) ~= "function" then
            vehicle.isa = function() return false end
        else
            meta.hadIsa = true
        end
    end

    -- IMPORTANT: never set spec.cpJob = nil here. Courseplay's onWriteStream/onUpdate index
    -- spec.cpJob every frame on the server; nilling our stub re-opens the exact crash window we are
    -- guarding (CpAICombineUnloader.lua:186 "attempt to index nil with 'writeStream'"). The harmless
    -- noop stub is left in place until Courseplay's own onLoad overwrites spec.cpJob with the real job.

    if not vehicleHasStubbedCpJob(vehicle) and vehicleHasRealIdentity(vehicle) and meta.hadIsa ~= false then
        FarmDashboardCourseplayCompat._stubMeta[vehicle] = nil
        removeStubbedEntry(vehicle)
    end
end

function FarmDashboardCourseplayCompat.shieldUnloadingStations()
    local mission = _G.g_currentMission
    local ss = mission and mission.storageSystem
    if ss == nil or type(ss.getUnloadingStations) ~= "function" then return end
    local ok, stations = pcall(function() return ss:getUnloadingStations() end)
    if not ok or type(stations) ~= "table" then return end
    for _, station in pairs(stations) do
        FarmDashboardCourseplayCompat.applyIdentityStubs(station)
    end
end

function FarmDashboardCourseplayCompat.ensureCpJobStub(vehicle)
    if vehicle == nil then return false end

    resolveAllCpSpecAliases(vehicle)

    local stubbedAny = false
    for _, entry in ipairs(CP_WORKER_SPECS) do
        local spec = resolveCpSpecAlias(vehicle, entry.spec, entry.cpClass) or vehicle[entry.spec]
        if type(spec) == "table" then
            for _, jobField in ipairs(entry.jobs) do
                if spec[jobField] == nil then
                    spec[jobField] = makeCpJob(entry.jobName)
                    stubbedAny = true
                end
            end
        end
    end

    if stubbedAny then
        local meta = FarmDashboardCourseplayCompat._stubMeta[vehicle]
        if meta == nil then
            meta = {}
            FarmDashboardCourseplayCompat._stubMeta[vehicle] = meta
            FarmDashboardCourseplayCompat._stubbedList[#FarmDashboardCourseplayCompat._stubbedList + 1] = vehicle
        end
        meta.cpJobStubbed = true
    end

    return stubbedAny
end

-- Add ONLY the identity overrides (getOwnerFarmId / getName) that base-game AccessHandler farm checks
-- and Courseplay's job-parameter dropdowns call on every fleet object. This must be applied to the
-- WHOLE fleet before any Courseplay job is created, otherwise createJob (ours OR Courseplay's own
-- onLoad) throws on a half-loaded vehicle and leaves spec.cpJob nil.
function FarmDashboardCourseplayCompat.applyIdentityStubs(vehicle)
    if vehicle == nil then return false end

    local meta = FarmDashboardCourseplayCompat._stubMeta[vehicle]
    if meta == nil then
        meta = {}
        FarmDashboardCourseplayCompat._stubMeta[vehicle] = meta
    end

    -- Deliberately NOT gated on needsSpawnStubs(): the only thing that matters here is that the object
    -- can answer getOwnerFarmId()/getName() when something walks the fleet. We only ever install a stub
    -- when the real method is genuinely missing, so a fully-loaded vehicle is never shadowed.
    local changed = false
    if type(vehicle.getOwnerFarmId) ~= "function" then
        if meta.hadGetOwnerFarmId == nil then
            meta.hadGetOwnerFarmId = false
        end
        vehicle.getOwnerFarmId = function() return 0 end
        changed = true
    elseif meta.hadGetOwnerFarmId == nil then
        meta.hadGetOwnerFarmId = true
    end

    if type(vehicle.getName) ~= "function" then
        if meta.hadGetName == nil then
            meta.hadGetName = false
        end
        vehicle.getName = function() return "" end
        changed = true
    elseif meta.hadGetName == nil then
        meta.hadGetName = true
    end

    -- isa() guard. Once we install getOwnerFarmId()/getName() above, base-game AccessHandler:canPlayerAccess
    -- returns TRUE for a half-loaded object. Courseplay's CpAIJobCombineUnloader:getUnloadingStations then
    -- evaluates `unloadingStation:isa(UnloadingStation)` (CpAIJobCombineUnloader.lua:93) on that same object.
    -- A not-yet-loaded station/object has no isa method -> "attempt to call missing method 'isa' of table"
    -- spamming every frame the Courseplay menu is open. A placeholder object is by definition not yet a real
    -- class instance, so a conservative isa() that returns false makes Courseplay correctly SKIP it (exactly
    -- what would happen if canPlayerAccess had returned false). We only ever add this when isa is genuinely
    -- missing (real stations/vehicles keep their class isa) and clearSpawnStubs restores it once the real
    -- class method is available underneath, so we never permanently shadow a loaded object's isa.
    if type(vehicle.isa) ~= "function" then
        if meta.hadIsa == nil then
            meta.hadIsa = false
        end
        vehicle.isa = function() return false end
        changed = true
    elseif meta.hadIsa == nil then
        meta.hadIsa = true
    end

    if changed then
        local listed = false
        for _, v in ipairs(FarmDashboardCourseplayCompat._stubbedList) do
            if v == vehicle then listed = true break end
        end
        if not listed then
            FarmDashboardCourseplayCompat._stubbedList[#FarmDashboardCourseplayCompat._stubbedList + 1] = vehicle
        end
    end

    return changed
end

function FarmDashboardCourseplayCompat.applySpawnStubs(vehicle)
    if vehicle == nil then return false end

    resolveAllCpSpecAliases(vehicle)
    local changed = FarmDashboardCourseplayCompat.applyIdentityStubs(vehicle)
    if FarmDashboardCourseplayCompat.ensureCpJobStub(vehicle) then
        changed = true
    end

    local meta = FarmDashboardCourseplayCompat._stubMeta[vehicle]
    return changed
        or (meta ~= nil and (meta.cpJobStubbed == true or meta.hadGetOwnerFarmId == false or meta.hadGetName == false))
end

function FarmDashboardCourseplayCompat.shieldFleetIfNeeded()
    local mission = _G.g_currentMission
    local fleet = mission and mission.vehicleSystem and mission.vehicleSystem.vehicles
    if type(fleet) ~= "table" then return end

    local dc = getDataCollector()
    local cpLoaded = dc and dc.isCourseplayLoaded and dc:isCourseplayLoaded()

    if cpLoaded then
        FarmDashboardCourseplayCompat.shieldUnloadingStations()
        -- Two full-fleet passes, and the ORDER matters.
        --
        -- Pass 1 - identity: give every half-loaded vehicle getOwnerFarmId()/getName(). Creating a
        -- Courseplay job (below, and in Courseplay's own onLoad) enumerates the WHOLE fleet for farm
        -- access checks (AccessHandler) and unloading-station / vehicle dropdowns, calling those
        -- methods on each object. A single half-loaded vehicle missing them makes createJob throw,
        -- which is exactly why spec.cpJob ends up nil mid-spawn and the joining client desyncs.
        for _, vehicle in pairs(fleet) do
            FarmDashboardCourseplayCompat.applyIdentityStubs(vehicle)
        end
        -- Pass 2 - real placeholder job: now that the whole fleet is safe to walk, createJob succeeds
        -- and produces a REAL Courseplay job whose writeStream emits the exact byte layout the client's
        -- onReadStream expects (no desync). The noop fallback is only hit if createJob still fails.
        -- Courseplay's own onLoad later overwrites spec.cpJob with its fully-configured job.
        for _, vehicle in pairs(fleet) do
            FarmDashboardCourseplayCompat.ensureCpJobStub(vehicle)
        end
        return
    end

    -- Without Courseplay, only walk the fleet when there is a known reason to (shop spawn pending
    -- or vehicles we already stubbed), to avoid needless per-frame work.
    local guard = rawget(_G, "FarmDashboardVehicleShopGuard")
    local pending = guard and guard.hasEnginePendingLoads and guard.hasEnginePendingLoads()
    local hasStubbed = #FarmDashboardCourseplayCompat._stubbedList > 0
    if not pending and not hasStubbed then return end

    for _, vehicle in pairs(fleet) do
        FarmDashboardCourseplayCompat.applySpawnStubs(vehicle)
    end
end

function FarmDashboardCourseplayCompat.refreshStubbedVehicles()
    for i = #FarmDashboardCourseplayCompat._stubbedList, 1, -1 do
        local vehicle = FarmDashboardCourseplayCompat._stubbedList[i]
        if vehicle == nil then
            table.remove(FarmDashboardCourseplayCompat._stubbedList, i)
        else
            local cpReady = not vehicleHasStubbedCpJob(vehicle)
            local identityReady = vehicleHasRealIdentity(vehicle)
            if identityReady and cpReady then
                FarmDashboardCourseplayCompat.clearSpawnStubs(vehicle)
            end
        end
    end
end

function FarmDashboardCourseplayCompat.queueVehicleRegister(vehicle)
    if vehicle == nil then return end
    FarmDashboardCourseplayCompat._pendingRegisters[#FarmDashboardCourseplayCompat._pendingRegisters + 1] = vehicle
end

function FarmDashboardCourseplayCompat.processPendingRegisters()
    local dc = getDataCollector()
    if dc == nil or dc.onVehicleRegistered == nil then return end

    local i = 1
    while i <= #FarmDashboardCourseplayCompat._pendingRegisters do
        local vehicle = FarmDashboardCourseplayCompat._pendingRegisters[i]
        if vehicle == nil or vehicleHasRealIdentity(vehicle) then
            if vehicle ~= nil then
                pcall(function() dc:onVehicleRegistered(vehicle) end)
            end
            table.remove(FarmDashboardCourseplayCompat._pendingRegisters, i)
        else
            i = i + 1
        end
    end
end

-- The incremental cache only sees vehicles whose Vehicle.register fires AFTER our spawn shield is
-- installed. Savegame vehicles are already registered by then, so without a one-time seed the
-- export (and ADS panels keyed off it) would only ever contain freshly purchased vehicles.
-- Queuing references is cheap and safe; processPendingRegisters defers any not-yet-alive entries.
function FarmDashboardCourseplayCompat.seedExistingFleetIfNeeded()
    if FarmDashboardCourseplayCompat._fleetSeeded then return end
    if not isAuthority() then return end

    local dc = getDataCollector()
    if dc == nil then return end
    -- Only seed when the incremental cache is the export source (Courseplay server host). When live
    -- scanning is allowed the normal fleet walk already covers existing vehicles.
    if type(dc.usesCourseplayIncrementalFleet) == "function" then
        local ok, inc = pcall(function() return dc:usesCourseplayIncrementalFleet() end)
        if not ok or inc ~= true then return end
    end

    local vdc = rawget(_G, "VehicleDataCollector")
    if vdc == nil or type(vdc.ensureVehicleTable) ~= "function" then return end
    local ok, vehicles = pcall(function() return vdc:ensureVehicleTable() end)
    if not ok or type(vehicles) ~= "table" then return end

    local count = 0
    for _, vehicle in pairs(vehicles) do
        if vehicle ~= nil then
            FarmDashboardCourseplayCompat.queueVehicleRegister(vehicle)
            count = count + 1
        end
    end
    if count > 0 then
        FarmDashboardCourseplayCompat._fleetSeeded = true
        Logging.info("[FarmDash] Courseplay fleet export: seeded %d existing vehicle(s) into incremental cache", count)
    end
end

function FarmDashboardCourseplayCompat.installMissionAccessHandlerGuard()
    if not isAuthority() then return false end
    local mission = _G.g_currentMission
    local ah = mission and mission.accessHandler
    if ah == nil or type(ah.canPlayerAccess) ~= "function" then return false end
    if ah.__farmDashCanPlayerAccessWrapped then
        FarmDashboardCourseplayCompat._missionAccessGuardInstalled = true
        return true
    end

    local superFunc = ah.canPlayerAccess
    ah.canPlayerAccess = function(self, object, ...)
        if type(object) == "table" then
            FarmDashboardCourseplayCompat.applyIdentityStubs(object)
        end
        return superFunc(self, object, ...)
    end
    ah.__farmDashCanPlayerAccessWrapped = true
    FarmDashboardCourseplayCompat._missionAccessGuardInstalled = true
    Logging.info("[FarmDash] Mission accessHandler.canPlayerAccess identity guard installed")
    return true
end

function FarmDashboardCourseplayCompat.tick()
    FarmDashboardCourseplayCompat.tryInstallDeferredGuards()
    FarmDashboardCourseplayCompat.installMissionAccessHandlerGuard()
    FarmDashboardCourseplayCompat.shieldFleetIfNeeded()
    FarmDashboardCourseplayCompat.refreshStubbedVehicles()
    FarmDashboardCourseplayCompat.seedExistingFleetIfNeeded()
    FarmDashboardCourseplayCompat.processPendingRegisters()
end

function FarmDashboardCourseplayCompat.onMissionLoaded()
    FarmDashboardCourseplayCompat._pendingRegisters = {}
    FarmDashboardCourseplayCompat._stubbedList = {}
    FarmDashboardCourseplayCompat._stubMeta = setmetatable({}, { __mode = "k" })
    FarmDashboardCourseplayCompat._fleetSeeded = false
    FarmDashboardCourseplayCompat._missionAccessGuardInstalled = false
    -- aiJobTypeManager is rebuilt per save, so job-type indices must be re-resolved.
    for k in pairs(_jobTypeIndexCache) do _jobTypeIndexCache[k] = nil end
    for k in pairs(_cpJobDiagLogged) do _cpJobDiagLogged[k] = nil end
end

local function callSuper(superFunc, self, ...)
    if type(superFunc) == "function" then
        return superFunc(self, ...)
    end
    return nil
end

local function shieldVehicleAfterLoad(self)
    resolveAllCpSpecAliases(self)
    FarmDashboardCourseplayCompat.applySpawnStubs(self)
    FarmDashboardCourseplayCompat.ensureCpJobStub(self)
    FarmDashboardCourseplayCompat.shieldUnloadingStations()
end

local function shieldVehicleBeforeLifecycle(self, superFunc, ...)
    FarmDashboardCourseplayCompat.applyIdentityStubs(self)
    resolveAllCpSpecAliases(self)
    return callSuper(superFunc, self, ...)
end

function FarmDashboardCourseplayCompat.installVehicleLifecycleGuards()
    if FarmDashboardCourseplayCompat._lifecycleGuardsInstalled then return true end
    if not isAuthority() then return false end
    if Vehicle == nil then return false end

    if type(Vehicle.load) == "function" then
        Vehicle.load = Utils.prependedFunction(Vehicle.load, function(self, superFunc, ...)
            FarmDashboardCourseplayCompat.applyIdentityStubs(self)
            return callSuper(superFunc, self, ...)
        end)
        Vehicle.load = Utils.appendedFunction(Vehicle.load, function(self, superFunc, ...)
            local result = callSuper(superFunc, self, ...)
            shieldVehicleAfterLoad(self)
            return result
        end)
    end

    if type(Vehicle.register) == "function" then
        Vehicle.register = Utils.prependedFunction(Vehicle.register, shieldVehicleBeforeLifecycle)
    end

    FarmDashboardCourseplayCompat._lifecycleGuardsInstalled = true
    Logging.info("[FarmDash] Vehicle lifecycle guards: load/register stubs")
    return true
end

function FarmDashboardCourseplayCompat.tryInstallDeferredGuards()
    if not isAuthority() then return end

    if not FarmDashboardCourseplayCompat._lifecycleGuardsInstalled then
        FarmDashboardCourseplayCompat.installVehicleLifecycleGuards()
    end

    local dc = getDataCollector()
    if dc and dc.isCourseplayLoaded and dc:isCourseplayLoaded()
        and not FarmDashboardCourseplayCompat._cpGuardsInstalled then
        FarmDashboardCourseplayCompat.installCourseplayStreamGuards()
    end
end

function FarmDashboardCourseplayCompat.installSpawnShield()
    if FarmDashboardCourseplayCompat._spawnShieldInstalled then return true end
    if not isAuthority() then return false end

    FarmDashboardCourseplayCompat.installVehicleLifecycleGuards()

    local AccessHandler = rawget(_G, "AccessHandler")
    if type(AccessHandler) == "table" and type(AccessHandler.canPlayerAccess) == "function" then
        AccessHandler.canPlayerAccess = Utils.prependedFunction(AccessHandler.canPlayerAccess, function(self, superFunc, object, ...)
            if type(object) == "table" then
                FarmDashboardCourseplayCompat.applyIdentityStubs(object)
            end
            return callSuper(superFunc, self, object, ...)
        end)
    end
    if type(AccessHandler) == "table" and type(AccessHandler.update) == "function" then
        AccessHandler.update = Utils.prependedFunction(AccessHandler.update, function(self, superFunc, dt)
            local dc = getDataCollector()
            if dc and dc.isCourseplayLoaded and dc:isCourseplayLoaded() then
                FarmDashboardCourseplayCompat.shieldUnloadingStations()
                local mission = _G.g_currentMission
                local fleet = mission and mission.vehicleSystem and mission.vehicleSystem.vehicles
                if type(fleet) == "table" then
                    for _, vehicle in pairs(fleet) do
                        FarmDashboardCourseplayCompat.applySpawnStubs(vehicle)
                    end
                end
            else
                FarmDashboardCourseplayCompat.shieldFleetIfNeeded()
            end
            return callSuper(superFunc, self, dt)
        end)
    end

    if type(Vehicle.register) == "function" then
        Vehicle.register = Utils.appendedFunction(Vehicle.register, function(self, superFunc, ...)
            local result = callSuper(superFunc, self, ...)
            shieldVehicleAfterLoad(self)
            FarmDashboardCourseplayCompat.queueVehicleRegister(self)
            FarmDashboardCourseplayCompat.processPendingRegisters()
            return result
        end)
    end

    if type(Vehicle.delete) == "function" then
        Vehicle.delete = Utils.appendedFunction(Vehicle.delete, function(self, superFunc, ...)
            FarmDashboardCourseplayCompat.clearSpawnStubs(self)
            for i = #FarmDashboardCourseplayCompat._pendingRegisters, 1, -1 do
                if FarmDashboardCourseplayCompat._pendingRegisters[i] == self then
                    table.remove(FarmDashboardCourseplayCompat._pendingRegisters, i)
                end
            end
            local dc = getDataCollector()
            if dc ~= nil and dc.onVehicleDeleted ~= nil then
                pcall(function() dc:onVehicleDeleted(self) end)
            end
            return callSuper(superFunc, self, ...)
        end)
    end

    FarmDashboardCourseplayCompat._spawnShieldInstalled = true
    FarmDashboardCourseplayCompat.installMissionAccessHandlerGuard()
    Logging.info("[FarmDash] Spawn shield: lifecycle + AccessHandler + Vehicle.register stubs (courseplay=%s)",
        tostring(getDataCollector() and getDataCollector().isCourseplayLoaded and getDataCollector():isCourseplayLoaded()))
    return true
end

local function stubUnloadingStationNames(job)
    if job == nil or type(job.getUnloadingStations) ~= "function" then return end
    local ok, stations = pcall(function() return job:getUnloadingStations() end)
    if not ok or type(stations) ~= "table" then return end
    for _, station in ipairs(stations) do
        if station ~= nil and type(station.getName) ~= "function" then
            station.getName = function() return "" end
        end
    end
end

local function wrapGenerateUnloadingStations(classTable)
    if classTable == nil or classTable.generateUnloadingStations == nil then return false end
    if classTable.__farmDashWrappedGenerateUnloadingStations then return true end
    local original = classTable.generateUnloadingStations
    classTable.generateUnloadingStations = function(self, setting, oldIx)
        if self ~= nil and self.job ~= nil then
            stubUnloadingStationNames(self.job)
        end
        local function runOriginal()
            if oldIx ~= nil then
                return original(self, setting, oldIx)
            end
            return original(self, setting)
        end
        local ok, a, b, c = callWithStationStubs(runOriginal)
        if ok then
            if c ~= nil then return a, b, c end
            if b ~= nil then return a, b end
            return a
        end
        if oldIx ~= nil then
            return { -1 }, { "---" }, oldIx
        end
        return { -1 }, { "---" }
    end
    classTable.__farmDashWrappedGenerateUnloadingStations = true
    return true
end

local CP_STREAM_GUARD_SPECS = {
    { class = "CpAICombineUnloader", alias = "spec_cpAICombineUnloader" },
    { class = "CpAISiloLoaderWorker", alias = "spec_cpAISiloLoaderWorker" },
    { class = "CpAIBunkerSiloWorker", alias = "spec_cpAIBunkerSiloWorker" },
    { class = "CpAIBaleFinder", alias = "spec_cpAIBaleFinder" },
    { class = "CpAIFieldWorker", alias = "spec_cpAIFieldWorker" },
}

local function guardCpSpecMethod(cpGlobalName, specAlias, methodName)
    local cpClass = rawget(_G, cpGlobalName)
    if cpClass == nil or type(cpClass[methodName]) ~= "function" then return false end

    cpClass[methodName] = Utils.prependedFunction(cpClass[methodName], function(vehicle, superFunc, ...)
        FarmDashboardCourseplayCompat.applySpawnStubs(vehicle)
        FarmDashboardCourseplayCompat.ensureCpJobStub(vehicle)
        local spec = resolveCpSpecAlias(vehicle, specAlias, cpGlobalName)
        if spec == nil or spec.cpJob == nil then
            return
        end
        if spec.cpJob.__farmDashStub then
            if methodName == "onReadStream" and type(spec.cpJob.readStream) == "function" then
                return spec.cpJob:readStream(...)
            end
            if methodName == "onWriteStream" and type(spec.cpJob.writeStream) == "function" then
                return spec.cpJob:writeStream(...)
            end
            return
        end
        return callSuper(superFunc, vehicle, ...)
    end)
    return true
end

local function guardCpJobParamsMethod(cpGlobalName, specAlias, methodName)
    local cpClass = rawget(_G, cpGlobalName)
    if cpClass == nil or type(cpClass[methodName]) ~= "function" then return false end

    cpClass[methodName] = Utils.prependedFunction(cpClass[methodName], function(vehicle, superFunc, ...)
        FarmDashboardCourseplayCompat.applySpawnStubs(vehicle)
        FarmDashboardCourseplayCompat.ensureCpJobStub(vehicle)
        local spec = resolveCpSpecAlias(vehicle, specAlias, cpGlobalName)
        if spec == nil or spec.cpJob == nil or spec.cpJob.__farmDashStub then
            return {}
        end
        return callSuper(superFunc, vehicle, ...)
    end)
    return true
end

function FarmDashboardCourseplayCompat.installCourseplayStreamGuards()
    if FarmDashboardCourseplayCompat._cpGuardsInstalled then return true end
    if not isAuthority() then return false end

    local installedAny = false
    local streamMethods = { "onWriteStream", "onReadStream", "saveToXMLFile", "onUpdate" }

    for _, entry in ipairs(CP_STREAM_GUARD_SPECS) do
        for _, methodName in ipairs(streamMethods) do
            if guardCpSpecMethod(entry.class, entry.alias, methodName) then
                installedAny = true
            end
        end
    end

    if guardCpJobParamsMethod("CpAICombineUnloader", "spec_cpAICombineUnloader", "getCpCombineUnloaderJobParameters") then
        installedAny = true
    end
    if guardCpJobParamsMethod("CpAISiloLoaderWorker", "spec_cpAISiloLoaderWorker", "getCpSiloLoaderWorkerJobParameters") then
        installedAny = true
    end
    if guardCpJobParamsMethod("CpAIBunkerSiloWorker", "spec_cpAIBunkerSiloWorker", "getCpBunkerSiloWorkerJobParameters") then
        installedAny = true
    end
    if guardCpJobParamsMethod("CpAIBaleFinder", "spec_cpAIBaleFinder", "getCpBaleFinderJobParameters") then
        installedAny = true
    end

    if wrapGenerateUnloadingStations(rawget(_G, "CpSiloLoaderJobParameters")) then installedAny = true end
    if wrapGenerateUnloadingStations(rawget(_G, "CpCombineUnloaderJobParameters")) then installedAny = true end

    if installedAny then
        FarmDashboardCourseplayCompat._cpGuardsInstalled = true
        Logging.info("[FarmDash] Courseplay guards: worker streams + job parameters + unloading station names")
    end
    return installedAny
end

function FarmDashboardCourseplayCompat.installIncrementalFleetHooks()
    if FarmDashboardCourseplayCompat._fleetHooksInstalled then return true end
    local dc = getDataCollector()
    if dc == nil or not dc.isCourseplayLoaded or not dc:isCourseplayLoaded() then return false end
    if not dc.usesCourseplayIncrementalFleet or not dc:usesCourseplayIncrementalFleet() then return false end

    FarmDashboardCourseplayCompat._fleetHooksInstalled = true
    Logging.info("[FarmDash] Courseplay fleet export: incremental cache via Vehicle.register")
    return true
end

function FarmDashboardCourseplayCompat.install()
    if not isAuthority() then return false end

    local ok = FarmDashboardCourseplayCompat.installSpawnShield()
    FarmDashboardCourseplayCompat.tryInstallDeferredGuards()
    local dc = getDataCollector()
    if dc and dc.isCourseplayLoaded and dc:isCourseplayLoaded() then
        ok = FarmDashboardCourseplayCompat.installCourseplayStreamGuards() or ok
        ok = FarmDashboardCourseplayCompat.installIncrementalFleetHooks() or ok
    end
    return ok
end
