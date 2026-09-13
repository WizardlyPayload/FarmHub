-- FS25 FarmDashboard | RfSoilFertilizerDataCollector.lua | v1.3.0
-- Soil Fertilizer field aggregates (OM 0-10) + FarmTablet treatment plans
-- Soft-detect only; aggregates; authority-only; never write RF mod state.

RfSoilFertilizerDataCollector = {}

local MOD_NAME = "FS25_SoilFertilizer"
local DEFAULT_FIELDS_PER_STEP = 8
local PRESSURE_ACTION_THRESH = 20
local OM_TARGET = 4.0
local MAX_TREATMENT_ROWS = 12

-- SoilConstants.PPM_DISPLAY: internal 0-100 nutrient scale -> soil-test ppm the
-- SF HUD / PDA show. Mirrored here only as a fallback when SoilConstants is not
-- reachable from this mod's Lua environment.
local PPM_DISPLAY_FALLBACK = { N = 3.0, P = 0.6, K = 4.0 }

local function isAuthority()
    local dashboard = rawget(_G, "FarmDashboard")
    if dashboard == nil or type(dashboard.isAuthority) ~= "function" then return false end
    local ok, result = pcall(function() return dashboard:isAuthority() end)
    return ok and result == true
end

local function getGlobalFallback(name)
    local ok, env = pcall(function() return getfenv(0) end)
    if ok and type(env) == "table" then return env[name] end
    return rawget(_G, name)
end

-- Engine globals must be read as `_G.name`, never `rawget(_G, name)`. In the FS25
-- mod sandbox `_G` is this mod's own environment table and engine globals are
-- reached through its __index chain, so rawget silently returns nil.
local function getManager()
    local mission = _G.g_currentMission
    if mission and mission.soilFertilityManager ~= nil then
        return mission.soilFertilityManager
    end
    return getGlobalFallback("g_SoilFertilityManager")
end

local function precisionFarmingLoaded()
    local loaded = _G.g_modIsLoaded
    if type(loaded) == "table" and
       (loaded.FS25_precisionFarming or loaded.FS25_PrecisionFarming) then
        return true
    end
    local namespace = _G.FS25_precisionFarming
    return (type(namespace) == "table" and namespace.g_precisionFarming ~= nil)
        or _G.g_precisionFarming ~= nil
end

local function soilSystemReady(soilSystem)
    if type(soilSystem) ~= "table" then return false end
    if soilSystem.getFieldInfo == nil then return false end
    if soilSystem.isInitialized == false then return false end
    return true
end

--- Prefer manager-attached SoilConstants (FarmTablet pattern); never hard-fail.
local function resolveSoilConstants(manager, soilSystem)
    if manager ~= nil then
        if manager.SoilConstants ~= nil then return manager.SoilConstants end
        if manager.constants ~= nil then return manager.constants end
    end
    if soilSystem ~= nil and soilSystem.SoilConstants ~= nil then
        return soilSystem.SoilConstants
    end
    local sc = getGlobalFallback("SoilConstants")
    if sc ~= nil then return sc end
    return _G.SoilConstants
end

local function collectFieldIds()
    local ids, seen = {}, {}
    local manager = _G.g_fieldManager
    local fields = manager and manager.fields
    if type(fields) ~= "table" then return ids end
    for _, field in pairs(fields) do
        local id = field and field.farmland and tonumber(field.farmland.id)
        if id and id > 0 and not seen[id] then
            seen[id] = true
            ids[#ids + 1] = id
        end
    end
    table.sort(ids)
    return ids
end

local function copyNutrient(value)
    if type(value) ~= "table" then return nil end
    return {
        value = tonumber(value.value),
        status = value.status ~= nil and tostring(value.status) or nil,
    }
end

local function copyCropTargets(ct)
    if type(ct) ~= "table" then return nil end
    local out = {}
    for _, key in ipairs({ "N", "P", "K" }) do
        local entry = ct[key]
        if type(entry) == "table" and tonumber(entry.opt) then
            out[key] = { opt = tonumber(entry.opt) }
        end
    end
    if next(out) == nil then return nil end
    return out
end

--- "PRODUCT 220 kg/ha (1056 kg)" — mirrors SoilTreatmentDialog._rateString / FarmTablet.
local function rateString(SC, profileKey, nutrientKey, deficit, rrMult, fieldArea, useImperial)
    if deficit <= 0 or type(SC) ~= "table" then return nil end
    local profiles = SC.FERTILIZER_PROFILES
    local sprayer = SC.SPRAYER_RATE
    local baseRates = sprayer and sprayer.BASE_RATES
    local profile = profiles and profiles[profileKey]
    local baseRate = baseRates and baseRates[profileKey]
    if not profile or not profile[nutrientKey] or profile[nutrientKey] == 0 then return nil end

    local coeff = profile[nutrientKey]
    local ratePerHa = deficit * 1000 / (coeff * rrMult)
    local total = ratePerHa * fieldArea
    local isDry = baseRate and baseRate.unit == "dry"

    local displayRate, displayTotal, unit, totalUnit
    if useImperial and sprayer then
        if isDry then
            displayRate = math.ceil(ratePerHa * (sprayer.KG_PER_HA_TO_LB_PER_AC or 0.892))
            displayTotal = math.ceil(total * 2.20462)
            unit, totalUnit = "lb/ac", "lb"
        else
            displayRate = math.ceil(ratePerHa * (sprayer.L_PER_HA_TO_GAL_PER_AC or 0.107))
            displayTotal = math.ceil(total * 0.26417)
            unit, totalUnit = "gal/ac", "gal"
        end
    else
        displayRate = math.ceil(ratePerHa)
        displayTotal = math.ceil(total)
        unit, totalUnit = isDry and "kg/ha" or "L/ha", isDry and "kg" or "L"
    end

    return string.format("%s %d %s (%d %s)", profileKey, displayRate, unit, displayTotal, totalUnit)
end

local function nutrientActionText(SC, currentVal, targetVal, rrMult, fieldArea, products, staticFallback, useImperial)
    local deficit = math.max(0, targetVal - currentVal)
    local parts = {}
    for _, prod in ipairs(products) do
        local s = rateString(SC, prod[1], prod[2], deficit, rrMult, fieldArea, useImperial)
        if s then parts[#parts + 1] = s end
    end
    if #parts == 0 then return staticFallback, false end
    return table.concat(parts, "  ·  "), true
end

--- Build treatment rows mirroring FarmTablet SoilNutrientApp._buildTreatments.
local function buildTreatmentPlan(info, SC, settings)
    local rows = {}
    if type(info) ~= "table" then
        return { { key = "none", label = "—", text = "No soil data", priority = "info", hasRates = false } }
    end

    local function add(key, label, text, priority, hasRates)
        if #rows >= MAX_TREATMENT_ROWS then return end
        rows[#rows + 1] = {
            key = key,
            label = label,
            text = text,
            priority = priority,
            hasRates = hasRates == true,
        }
    end

    local thresh = (SC and SC.STATUS_THRESHOLDS) or {}
    local nT = thresh.nitrogen or { poor = 30, fair = 50 }
    local pT = thresh.phosphorus or { poor = 25, fair = 40 }
    local kT = thresh.potassium or { poor = 20, fair = 40 }
    local fieldArea = tonumber(info.fieldArea) or 1.0
    local rrIdx = (settings and settings.replenishmentRate) or 3
    local rrMult = 1.0
    if SC and SC.DIFFICULTY and SC.DIFFICULTY.REPLENISHMENT_MULTIPLIERS then
        rrMult = SC.DIFFICULTY.REPLENISHMENT_MULTIPLIERS[rrIdx] or 1.0
    end
    local useImperial = settings and settings.useImperialUnits == true
    local ct = info.cropTargets
    local targetN = (ct and ct.N and ct.N.opt) or (nT.fair or 50)
    local targetP = (ct and ct.P and ct.P.opt) or (pT.fair or 40)
    local targetK = (ct and ct.K and ct.K.opt) or (kT.fair or 40)

    local ph = math.floor(((tonumber(info.pH) or 7.0) * 10) + 0.5) / 10
    if ph < 6.5 then
        add("ph", "pH", "Apply LIME or LIQUID LIME to raise pH.", "urgent", false)
    elseif ph > 7.5 then
        add("ph", "pH", "Apply GYPSUM to lower pH / improve structure.", "watch", false)
    end

    local om = tonumber(info.organicMatter) or 3.5
    if om < 3.0 then
        add("om", "OM", "Plow in MANURE, COMPOST, or chop straw.", "urgent", false)
    elseif om < 4.0 then
        add("om", "OM", "Monitor. Maintain organic inputs.", "watch", false)
    end

    local nVal = info.nitrogen and tonumber(info.nitrogen.value) or 0
    if nVal < targetN * 0.60 then
        local text, hasRates = nutrientActionText(SC, nVal, targetN, rrMult, fieldArea,
            { { "UREA", "N" }, { "UAN32", "N" } }, "Apply UREA or UAN32", useImperial)
        add("n", "N", text, "urgent", hasRates)
    elseif nVal < targetN then
        local text, hasRates = nutrientActionText(SC, nVal, targetN, rrMult, fieldArea,
            { { "AMS", "N" }, { "AN", "N" } }, "Apply AMS or AN", useImperial)
        add("n", "N", text, "watch", hasRates)
    end

    local pVal = info.phosphorus and tonumber(info.phosphorus.value) or 0
    if pVal < targetP * 0.60 then
        local text, hasRates = nutrientActionText(SC, pVal, targetP, rrMult, fieldArea,
            { { "MAP", "P" }, { "DAP", "P" } }, "Apply MAP or DAP", useImperial)
        add("p", "P", text, "urgent", hasRates)
    elseif pVal < targetP then
        local text, hasRates = nutrientActionText(SC, pVal, targetP, rrMult, fieldArea,
            { { "LIQUID_MAP", "P" }, { "LIQUID_DAP", "P" } }, "Top-up with Liquid MAP / DAP", useImperial)
        add("p", "P", text, "watch", hasRates)
    elseif pVal > targetP * 1.15 then
        add("p", "P", "Above target - skip P product this pass.", "watch", false)
    end

    local kVal = info.potassium and tonumber(info.potassium.value) or 0
    if kVal < targetK * 0.60 then
        local text, hasRates = nutrientActionText(SC, kVal, targetK, rrMult, fieldArea,
            { { "POTASH", "K" }, { "LIQUID_POTASH", "K" } }, "Apply POTASH", useImperial)
        add("k", "K", text, "urgent", hasRates)
    elseif kVal < targetK then
        local text, hasRates = nutrientActionText(SC, kVal, targetK, rrMult, fieldArea,
            { { "POTASH", "K" }, { "LIQUID_POTASH", "K" } }, "Top-up with POTASH", useImperial)
        add("k", "K", text, "watch", hasRates)
    end

    if (tonumber(info.weedPressure) or 0) >= PRESSURE_ACTION_THRESH then
        add("weed", "Weed", "Apply HERBICIDE or use WEEDER/HOE.", "urgent", false)
    end
    if (tonumber(info.pestPressure) or 0) >= PRESSURE_ACTION_THRESH then
        add("pest", "Pest", "Apply INSECTICIDE immediately.", "urgent", false)
    end

    local shownD = info.shownDiseasePressure
    if shownD == nil then
        add("disease", "Disease", "Unscouted — scout before treating.", "info", false)
    elseif tonumber(shownD) and tonumber(shownD) >= PRESSURE_ACTION_THRESH then
        add("disease", "Disease", "Apply FUNGICIDE immediately.", "urgent", false)
    end

    if info.amendBurnRisk == true then
        add("burn", "Burn", "Liming or manuring now would scorch the crop.", "urgent", false)
    end

    if #rows == 0 then
        add("clear", "—", "All clear — no treatment needed.", "ok", false)
    end
    return rows
end

local function ppmFactors(SC)
    local d = (type(SC) == "table" and type(SC.PPM_DISPLAY) == "table") and SC.PPM_DISPLAY or nil
    return {
        N = (d and tonumber(d.N)) or PPM_DISPLAY_FALLBACK.N,
        P = (d and tonumber(d.P)) or PPM_DISPLAY_FALLBACK.P,
        K = (d and tonumber(d.K)) or PPM_DISPLAY_FALLBACK.K,
    }
end

local function toPpm(value, factor)
    local v = tonumber(value)
    if v == nil then return nil end
    return math.floor(v * (tonumber(factor) or 1) + 0.5)
end

local function readGrowthFraction(soilSystem, fieldId)
    if soilSystem == nil or soilSystem._getFieldGrowthFraction == nil then return nil end
    local ok, frac = pcall(function() return soilSystem:_getFieldGrowthFraction(fieldId) end)
    if ok and tonumber(frac) then
        return math.max(0, math.min(1, tonumber(frac)))
    end
    return nil
end

local function readField(soilSystem, fieldId, manager, SC)
    local okInfo, info = pcall(function() return soilSystem:getFieldInfo(fieldId) end)
    if not okInfo or type(info) ~= "table" then return nil end

    local urgency = 0
    if soilSystem.getFieldUrgency ~= nil then
        local okUrgency, value = pcall(function() return soilSystem:getFieldUrgency(fieldId) end)
        if okUrgency and tonumber(value) then urgency = math.max(0, math.min(100, tonumber(value))) end
    end

    local settings = manager and manager.settings
    local thresh = (SC and SC.STATUS_THRESHOLDS) or {}
    local ct = copyCropTargets(info.cropTargets)
    local nFair = (thresh.nitrogen and thresh.nitrogen.fair) or 50
    local pFair = (thresh.phosphorus and thresh.phosphorus.fair) or 40
    local kFair = (thresh.potassium and thresh.potassium.fair) or 40
    local phOpt = (SC and SC.PH_OPTIMAL) or 6.5

    local treatmentPlan = buildTreatmentPlan(info, SC, settings)

    -- Soil-test ppm, resolved here so the dashboard never has to mirror SF constants.
    local ppm = ppmFactors(SC)
    local targetN = (ct and ct.N and ct.N.opt) or nFair
    local targetP = (ct and ct.P and ct.P.opt) or pFair
    local targetK = (ct and ct.K and ct.K.opt) or kFair
    local ppmBlock = {
        n = toPpm(info.nitrogen and info.nitrogen.value, ppm.N),
        p = toPpm(info.phosphorus and info.phosphorus.value, ppm.P),
        k = toPpm(info.potassium and info.potassium.value, ppm.K),
        nTarget = toPpm(targetN, ppm.N),
        pTarget = toPpm(targetP, ppm.P),
        kTarget = toPpm(targetK, ppm.K),
    }

    return {
        ppm = ppmBlock,
        nitrogen = copyNutrient(info.nitrogen),
        phosphorus = copyNutrient(info.phosphorus),
        potassium = copyNutrient(info.potassium),
        pH = tonumber(info.pH),
        organicMatter = tonumber(info.organicMatter), -- RF contract: 0-10 scalar
        weedPressure = tonumber(info.weedPressure) or 0,
        pestPressure = tonumber(info.pestPressure) or 0,
        diseasePressure = tonumber(info.diseasePressure),
        shownDiseasePressure = tonumber(info.shownDiseasePressure),
        activeDisease = info.activeDisease ~= nil and tostring(info.activeDisease) or nil,
        diseaseDiscovered = info.diseaseDiscovered == true,
        lastCrop = info.lastCrop ~= nil and tostring(info.lastCrop) or nil,
        lastCrop2 = info.lastCrop2 ~= nil and tostring(info.lastCrop2) or nil,
        lastCrop3 = info.lastCrop3 ~= nil and tostring(info.lastCrop3) or nil,
        rotationStatus = info.rotationStatus,
        rotationBonusDaysLeft = tonumber(info.rotationBonusDaysLeft) or 0,
        yieldEfficiency = tonumber(info.yieldEfficiency),
        needsFertilization = info.needsFertilization == true,
        urgency = urgency,
        herbicideActive = info.herbicideActive == true,
        insecticideActive = info.insecticideActive == true,
        fungicideActive = info.fungicideActive == true,
        compaction = tonumber(info.compaction) or 0,
        simDisabled = info.simDisabled == true,
        simDisabledReason = info.simDisabledReason ~= nil and tostring(info.simDisabledReason) or nil,
        isMeadow = info.isMeadow == true,
        pfConflict = false,
        fieldArea = tonumber(info.fieldArea),
        cropTargets = ct,
        targetDefaults = {
            nitrogen = nFair,
            phosphorus = pFair,
            potassium = kFair,
            pH = phOpt,
            organicMatter = OM_TARGET,
        },
        growthFraction = readGrowthFraction(soilSystem, fieldId),
        coverageFraction = tonumber(info.coverageFraction),
        sessionCoverageFraction = tonumber(info.sessionCoverageFraction),
        sessionLastProduct = info.sessionLastProduct ~= nil and tostring(info.sessionLastProduct) or nil,
        amendBurnRisk = info.amendBurnRisk == true,
        burnDaysLeft = tonumber(info.burnDaysLeft) or 0,
        daysSinceHarvest = tonumber(info.daysSinceHarvest),
        treatmentPlan = treatmentPlan,
    }
end

local function snapshotPayload(st, partial)
    return {
        enabled = true,
        pfConflict = false,
        byField = st.byField,
        fieldCount = st.fieldCount,
        partial = partial == true or nil,
    }
end

--- Why the SF read is unavailable. Without this the dashboard cannot tell
--- "mod not installed" apart from "installed but the soil system never came up",
--- and both look identical to a player (vanilla bars, no explanation).
local function inactiveReason(modLoaded, pfConflict, manager, soilSystem, settingsEnabled)
    if pfConflict then return "pf-conflict" end
    if not modLoaded then return "mod-absent" end
    if manager == nil then return "manager-missing" end
    if type(soilSystem) ~= "table" then return "system-missing" end
    if soilSystem.getFieldInfo == nil then return "api-missing" end
    if settingsEnabled == false then return "settings-disabled" end
    if soilSystem.isInitialized == false then return "not-initialized" end
    return nil
end

function RfSoilFertilizerDataCollector.isModLoaded()
    if getManager() ~= nil then return true end
    local loaded = _G.g_modIsLoaded
    return type(loaded) == "table" and loaded[MOD_NAME] == true
end

function RfSoilFertilizerDataCollector:init()
    RfSoilFertilizerDataCollector._inc = nil
end

function RfSoilFertilizerDataCollector:collectBegin()
    local manager = getManager()
    local pfConflict = precisionFarmingLoaded()
    if not pfConflict and manager and manager.soilSystem and manager.soilSystem.PFActive then
        pfConflict = true
    end
    local soilSystem = manager and manager.soilSystem
    local modLoaded = self.isModLoaded()
    local ready = modLoaded and soilSystemReady(soilSystem) and not pfConflict
    local settingsEnabled = nil
    if manager ~= nil and type(manager.settings) == "table" then
        settingsEnabled = manager.settings.enabled ~= false
    end
    local enabled = ready and settingsEnabled ~= false
    RfSoilFertilizerDataCollector._inc = {
        enabled = enabled,
        pfConflict = pfConflict,
        reason = (not enabled)
            and inactiveReason(modLoaded, pfConflict, manager, soilSystem, settingsEnabled)
            or nil,
        modLoaded = modLoaded,
        managerPresent = manager ~= nil,
        systemPresent = type(soilSystem) == "table",
        settingsEnabled = settingsEnabled,
        manager = enabled and manager or nil,
        soilSystem = enabled and soilSystem or nil,
        soilConstants = enabled and resolveSoilConstants(manager, soilSystem) or nil,
        fieldIds = enabled and collectFieldIds() or {},
        index = 1,
        byField = {},
        fieldCount = 0,
    }
end

function RfSoilFertilizerDataCollector:collectStep(opts)
    local st = RfSoilFertilizerDataCollector._inc
    if not st or not isAuthority() then
        RfSoilFertilizerDataCollector._inc = nil
        return true, { enabled = false, reason = "not-authority", byField = {}, fieldCount = 0 }
    end
    if not st.enabled then
        local payload = {
            enabled = false,
            pfConflict = st.pfConflict == true,
            reason = st.reason,
            modLoaded = st.modLoaded == true,
            managerPresent = st.managerPresent == true,
            systemPresent = st.systemPresent == true,
            settingsEnabled = st.settingsEnabled,
            byField = {},
            fieldCount = 0,
        }
        RfSoilFertilizerDataCollector._inc = nil
        return true, payload
    end

    local perStep = math.max(1, tonumber(opts and opts.rfLandFieldsPerFrame) or DEFAULT_FIELDS_PER_STEP)
    local stopAt = math.min(#st.fieldIds, st.index + perStep - 1)
    while st.index <= stopAt do
        local fieldId = st.fieldIds[st.index]
        local row = readField(st.soilSystem, fieldId, st.manager, st.soilConstants)
        if row ~= nil then
            st.byField[tostring(fieldId)] = row
            st.fieldCount = st.fieldCount + 1
        end
        st.index = st.index + 1
    end

    if st.index <= #st.fieldIds then
        return false, snapshotPayload(st, true)
    end
    local payload = snapshotPayload(st, false)
    RfSoilFertilizerDataCollector._inc = nil
    return true, payload
end

function RfSoilFertilizerDataCollector:collect()
    self:collectBegin()
    local done, payload = false, nil
    while not done do
        done, payload = self:collectStep({ rfLandFieldsPerFrame = 9999 })
    end
    return payload or { enabled = false }
end
