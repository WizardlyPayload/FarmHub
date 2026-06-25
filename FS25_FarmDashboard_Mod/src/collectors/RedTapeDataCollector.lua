-- FS25 FarmDashboard | RedTapeDataCollector.lua | v1.1.0
-- Optional FS25_RedTape export — policies, schemes, tax, grants, harvest rotation (aggregate + capped lists).

RedTapeDataCollector = {}

local MAX_EVENTS = 20
local MAX_TAX_STATEMENTS = 12
local MAX_POLICIES = 16
local MAX_SCHEMES = 12
local MAX_GRANTS = 8
local MAX_FARMLANDS_ROTATION = 48
local TIER_NAMES = { [1] = "A", [2] = "B", [3] = "C", [4] = "D" }

local function rtEnabled()
    local rt = _G.g_currentMission and _G.g_currentMission.RedTape
    return rt ~= nil
end

local function rtTierLabel(tierNum)
    return TIER_NAMES[tonumber(tierNum)] or "D"
end

local function rtPolicyNameKey(policy)
    if not policy then return nil end
    if policy.getName then
        local ok, name = pcall(function() return policy:getName() end)
        if ok and name then return tostring(name) end
    end
    local idx = tonumber(policy.policyIndex)
    if idx and _G.RTPolicies and _G.RTPolicies[idx] then
        return _G.RTPolicies[idx].name
    end
    return nil
end

local function rtSchemeNameKey(scheme)
    if not scheme then return nil end
    if scheme.getName then
        local ok, name = pcall(function() return scheme:getName() end)
        if ok and name then return tostring(name) end
    end
    local idx = tonumber(scheme.schemeIndex)
    if idx and _G.RTSchemes and _G.RTSchemes[idx] then
        return _G.RTSchemes[idx].name
    end
    return nil
end

local function rtWarningCountForFarm(policySystem, farmId, policyIndex)
    if not policySystem or not policySystem.warnings then return 0 end
    local n = 0
    for _, w in pairs(policySystem.warnings) do
        if w and w.farmId == farmId and w.policyIndex == policyIndex then
            n = n + (tonumber(w.warningCount) or 1)
        end
    end
    return n
end

local function rtSerializePolicies(rt, farmId)
    local ps = rt.PolicySystem
    if not ps or not ps.policies then return {} end
    local out = {}
    for _, policy in ipairs(ps.policies) do
        if policy and #out < MAX_POLICIES then
            local watching = false
            if policy.isBeingWatchedByFarm then
                local ok, w = pcall(function() return policy:isBeingWatchedByFarm(farmId) end)
                watching = ok and w == true
            elseif policy.watchingFarms and policy.watchingFarms[farmId] then
                watching = true
            end
            table.insert(out, {
                policyIndex = tonumber(policy.policyIndex),
                nameKey = rtPolicyNameKey(policy),
                warnings = rtWarningCountForFarm(ps, farmId, policy.policyIndex),
                watched = watching,
                nextEvaluationMonth = tonumber(policy.nextEvaluationMonth),
                evaluationCount = tonumber(policy.evaluationCount) or 0,
            })
        end
    end
    return out
end

local function rtSerializeSchemes(schemeSystem, policySystem, farmId, active)
    if not schemeSystem then return {} end
    if not active then
        return rtSerializeAvailableSchemesForFarm(schemeSystem, policySystem, farmId)
    end
    local list = schemeSystem.getActiveSchemesForFarm and schemeSystem:getActiveSchemesForFarm(farmId)
    if type(list) ~= "table" then return {} end
    local out = {}
    for _, scheme in pairs(list) do
        if scheme and #out < MAX_SCHEMES then
            if tonumber(scheme.farmId) == farmId or tonumber(scheme.farmId) == -1 then
                table.insert(out, {
                    schemeIndex = tonumber(scheme.schemeIndex),
                    nameKey = rtSchemeNameKey(scheme),
                    tier = rtTierLabel(scheme.tier),
                    watched = scheme.watched == true,
                    farmId = tonumber(scheme.farmId),
                })
            end
        end
    end
    return out
end

local function rtSerializeAvailableSchemesForFarm(schemeSystem, policySystem, farmId)
    if not schemeSystem or not policySystem then return {} end
    local progress = nil
    if policySystem.getProgressForFarm then
        local ok, p = pcall(function() return policySystem:getProgressForFarm(farmId) end)
        if ok then progress = p end
    end
    if not progress or not progress.tier then return {} end
    local farmTier = progress.tier
    local tierList = schemeSystem.availableSchemes and schemeSystem.availableSchemes[farmTier]
    if type(tierList) ~= "table" then return {} end
    local activeSchemes = schemeSystem.getActiveSchemesForFarm and schemeSystem:getActiveSchemesForFarm(farmId) or {}
    local out = {}
    for _, scheme in pairs(tierList) do
        if scheme and #out < MAX_SCHEMES then
            if tonumber(scheme.tier) ~= tonumber(farmTier) then
                -- skip wrong tier bucket
            else
                local available = true
                local schemeInfo = _G.RTSchemes and _G.RTSchemes[scheme.schemeIndex]
                if schemeInfo and schemeInfo.duplicationKey then
                    for _, active in pairs(activeSchemes) do
                        local activeInfo = _G.RTSchemes and _G.RTSchemes[active.schemeIndex]
                        if activeInfo and activeInfo.duplicationKey == schemeInfo.duplicationKey then
                            available = false
                            break
                        end
                    end
                end
                if available then
                    table.insert(out, {
                        schemeIndex = tonumber(scheme.schemeIndex),
                        nameKey = rtSchemeNameKey(scheme),
                        tier = rtTierLabel(scheme.tier),
                        watched = scheme.watched == true,
                        farmId = farmId,
                    })
                end
            end
        end
    end
    return out
end

local function rtGetFarmlandGatherer(rt)
    local ig = rt and rt.InfoGatherer
    if not ig or not ig.gatherers then return nil end
    if _G.INFO_KEYS and _G.INFO_KEYS.FARMLANDS then
        return ig.gatherers[_G.INFO_KEYS.FARMLANDS]
    end
    return ig.gatherers.farmlands
end

local function rtFruitDisplayName(fruitName)
    if not fruitName or fruitName == "" then return nil end
    if _G.g_fruitTypeManager and _G.g_fruitTypeManager.nameToFruitType then
        local fruit = _G.g_fruitTypeManager.nameToFruitType[fruitName]
        if fruit then
            return fruit.title or fruit.name or fruitName
        end
    end
    return fruitName
end

local function rtResolveFarmlandFarmId(farmlandId)
    if not _G.g_farmlandManager or not farmlandId then return nil end
    local ok, fl = pcall(function()
        return _G.g_farmlandManager:getFarmlandById(farmlandId)
    end)
    if ok and fl then return tonumber(fl.farmId) end
    return nil
end

local function rtHistoryToCropRow(history)
    if type(history) ~= "table" or #history < 1 then return nil end
    local crops = { "", "", "", "", "" }
    for i = 1, math.min(5, #history) do
        local entry = history[i]
        if entry and entry.name and entry.name ~= "" then
            local slot = 6 - i
            if slot >= 1 and slot <= 5 then
                crops[slot] = rtFruitDisplayName(entry.name) or entry.name
            end
        end
    end
    for _, c in ipairs(crops) do
        if c ~= "" then return crops end
    end
    return nil
end

local function rtSerializeCropRotation(rt, farmId)
    local gatherer = rtGetFarmlandGatherer(rt)
    if not gatherer then return {} end
    local out = {}
    local seen = {}

    local function appendRow(farmlandId, history)
        local fid = tonumber(farmlandId)
        if not fid or seen[fid] or #out >= MAX_FARMLANDS_ROTATION then return end
        local ownerFarm = rtResolveFarmlandFarmId(fid)
        if ownerFarm ~= farmId then return end
        local crops = rtHistoryToCropRow(history)
        if not crops then return end
        seen[fid] = true
        table.insert(out, { farmlandId = fid, crops = crops })
    end

    if gatherer.data then
        for farmlandId, farmlandData in pairs(gatherer.data) do
            if farmlandData and farmlandData.harvestedCropsHistory then
                appendRow(farmlandId, farmlandData.harvestedCropsHistory)
            end
        end
    end

    if _G.g_farmlandManager and _G.g_farmlandManager.farmlands and gatherer.getFarmlandData then
        for _, farmland in pairs(_G.g_farmlandManager.farmlands) do
            if farmland and farmland.showOnFarmlandsScreen and farmland.field ~= nil
                and tonumber(farmland.farmId) == farmId then
                local ok, farmlandData = pcall(function() return gatherer:getFarmlandData(farmland.id) end)
                if ok and farmlandData and farmlandData.harvestedCropsHistory then
                    appendRow(farmland.id, farmlandData.harvestedCropsHistory)
                end
            end
        end
    end

    table.sort(out, function(a, b) return (a.farmlandId or 0) < (b.farmlandId or 0) end)
    return out
end

local function rtSerializeGrants(grantSystem, farmId)
    if not grantSystem or not grantSystem.getGrantsForFarm then return {} end
    local ok, grants = pcall(function() return grantSystem:getGrantsForFarm(farmId) end)
    if not ok or type(grants) ~= "table" then return {} end
    local out = {}
    for _, grant in pairs(grants) do
        if grant and #out < MAX_GRANTS then
            table.insert(out, {
                grantId = grant.grantId and tostring(grant.grantId) or nil,
                status = grant.status and tostring(grant.status) or nil,
                approvedAmount = tonumber(grant.approvedAmount),
                requestedAmount = tonumber(grant.requestedAmount),
                xmlFilename = grant.xmlFilename and tostring(grant.xmlFilename) or nil,
            })
        end
    end
    return out
end

local function rtSerializeTax(taxSystem, farmId)
    if not taxSystem then
        return { statements = {}, currentMonthIncome = 0, currentMonthExpenses = 0 }
    end
    local statements = {}
    if taxSystem.taxStatements then
        for _, stmt in ipairs(taxSystem.taxStatements) do
            if stmt and tonumber(stmt.farmId) == farmId and #statements < MAX_TAX_STATEMENTS then
                table.insert(statements, {
                    month = tonumber(stmt.month),
                    totalTax = tonumber(stmt.totalTax) or 0,
                    totalTaxableIncome = tonumber(stmt.totalTaxableIncome) or 0,
                    totalExpenses = tonumber(stmt.totalExpenses) or 0,
                    paid = stmt.paid == true,
                    taxRate = tonumber(stmt.taxRate),
                })
            end
        end
    end
    table.sort(statements, function(a, b) return (a.month or 0) > (b.month or 0) end)

    local income, expenses = 0, 0
    if taxSystem.lineItems and taxSystem.lineItems[farmId] then
        local cumMonth = _G.RedTape and _G.RedTape.getCumulativeMonth and _G.RedTape.getCumulativeMonth() or nil
        if cumMonth and taxSystem.lineItems[farmId][cumMonth] then
            for _, line in ipairs(taxSystem.lineItems[farmId][cumMonth]) do
                if line then
                    income = income + (tonumber(line.income) or 0)
                    expenses = expenses + (tonumber(line.expense) or 0)
                end
            end
        end
    end

    return {
        statements = statements,
        currentMonthIncome = income,
        currentMonthExpenses = expenses,
    }
end

local function rtSerializeEvents(eventLog, farmId)
    if not eventLog or not eventLog.events then return {} end
    local out = {}
    for i = #eventLog.events, 1, -1 do
        local ev = eventLog.events[i]
        if ev and tonumber(ev.farmId) == farmId and #out < MAX_EVENTS then
            local typeKey = nil
            if _G.RTEventLogItem and _G.RTEventLogItem.EVENT_TYPE_LABELS then
                typeKey = _G.RTEventLogItem.EVENT_TYPE_LABELS[ev.eventType]
            end
            table.insert(out, 1, {
                eventType = tonumber(ev.eventType),
                typeKey = typeKey,
                detail = ev.detail and tostring(ev.detail) or "",
                month = tonumber(ev.month),
                year = tonumber(ev.year),
            })
        end
    end
    return out
end

local function rtSerializeFarm(rt, farmId)
    local ps = rt.PolicySystem
    local points = 0
    local tierNum = 4
    if ps then
        if ps.points and ps.points[farmId] then
            points = tonumber(ps.points[farmId]) or 0
        end
        if ps.getTierForPoints then
            local ok, t = pcall(function() return ps:getTierForPoints(points) end)
            if ok and t then tierNum = t end
        end
    end

    local tax = rtSerializeTax(rt.TaxSystem, farmId)

    local activeSchemes = {}
    local okAct, act = pcall(function()
        return rtSerializeSchemes(rt.SchemeSystem, rt.PolicySystem, farmId, true)
    end)
    if okAct and type(act) == "table" then activeSchemes = act end

    local availableSchemes = {}
    local okAvail, avail = pcall(function()
        return rtSerializeSchemes(rt.SchemeSystem, rt.PolicySystem, farmId, false)
    end)
    if okAvail and type(avail) == "table" then availableSchemes = avail end

    local cropRotation = {}
    local okRot, rot = pcall(function() return rtSerializeCropRotation(rt, farmId) end)
    if okRot and type(rot) == "table" then cropRotation = rot end

    return {
        farmId = farmId,
        tier = rtTierLabel(tierNum),
        tierNum = tierNum,
        points = points,
        policies = rtSerializePolicies(rt, farmId),
        activeSchemes = activeSchemes,
        availableSchemes = availableSchemes,
        cropRotation = cropRotation,
        grants = rtSerializeGrants(rt.GrantSystem, farmId),
        tax = tax,
        events = rtSerializeEvents(rt.EventLog, farmId),
    }
end

function RedTapeDataCollector:init()
    RedTapeDataCollector._inc = nil
end

function RedTapeDataCollector:collectBegin()
    RedTapeDataCollector._inc = {
        stage = "init",
        farmIds = {},
        farmIdx = 1,
        byFarm = {},
    }
end

function RedTapeDataCollector:collectStep(opts)
    if not rtEnabled() then
        RedTapeDataCollector._inc = nil
        return true, { enabled = false }
    end

    local st = RedTapeDataCollector._inc
    if not st then return true, { enabled = false } end

    local per = math.max(1, tonumber(opts and opts.redTapeFarmsPerFrame) or 1)
    local rt = _G.g_currentMission.RedTape

    if st.stage == "init" then
        if _G.g_farmManager and _G.g_farmManager.farms then
            for _, farm in pairs(_G.g_farmManager.farms) do
                local fid = farm and tonumber(farm.farmId)
                if fid and fid > 0 then
                    local hasPlayers = false
                    if farm.players then
                        for _ in pairs(farm.players) do hasPlayers = true break end
                    end
                    local name = farm.name and tostring(farm.name):match("^%s*(.-)%s*$") or ""
                    if hasPlayers or name ~= "" then
                        st.farmIds[#st.farmIds + 1] = fid
                    end
                end
            end
        end
        if #st.farmIds < 1 then
            local mission = _G.g_currentMission
            if mission and mission.getFarmId then
                local ok, fid = pcall(function() return mission:getFarmId() end)
                if ok and fid and fid > 0 then
                    st.farmIds[#st.farmIds + 1] = fid
                end
            end
        end
        st.stage = "farms"
    end

    if st.stage == "farms" then
        local hi = math.min(st.farmIdx + per - 1, #st.farmIds)
        for i = st.farmIdx, hi do
            local fid = st.farmIds[i]
            local ok, row = pcall(function() return rtSerializeFarm(rt, fid) end)
            if ok and row then st.byFarm[tostring(fid)] = row end
        end
        st.farmIdx = hi + 1
        if st.farmIdx > #st.farmIds then
            RedTapeDataCollector._inc = nil
            return true, { enabled = true, byFarm = st.byFarm }
        end
        return false, { enabled = true, byFarm = st.byFarm, partial = true }
    end

    RedTapeDataCollector._inc = nil
    return true, { enabled = true, byFarm = st.byFarm }
end

function RedTapeDataCollector:collect()
    self:collectBegin()
    local done, result = false, nil
    while not done do
        done, result = self:collectStep({ redTapeFarmsPerFrame = 9999 })
    end
    return result or { enabled = false }
end
