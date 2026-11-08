-- Field Contractors 1.5.3.1: live farm-keyed contract claims only.
-- The profile persistence file mixes save slots and the save method mutates
-- course snapshots. Never read that file or call savePersistentContracts here.

local MAX_SCAN = 250
local MAX_ROWS = 40
local MAX_MONEY = 1000000000000
local MAX_AREA_HA = 1000000

local function finite(value, maximum)
    local n = tonumber(value)
    if n ~= nil and n == n and n ~= math.huge and n ~= -math.huge
        and n >= 0 and n <= maximum then return n end
    return nil
end

local function integer(value, maximum)
    local n = finite(value, maximum)
    return n and n == math.floor(n) and n or nil
end

local function name(ctx, value, maximum)
    if type(value) == "string" and value ~= "" then
        return ctx.clip(value, maximum)
    end
    return nil
end

CompanionPages.register({
    key = "fieldContractors",
    modNames = { "KM_82386_Field_Contractors" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.5.3.1" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = integer(ctx.farmId, 8)
        if not farmId or farmId == 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local mission = ctx.mission
        if ctx.call(mission, "getIsServer") ~= true or
            (type(mission) == "table" and mission.isMissionStarted == false) then
            return { readState = "settings-only", reason = "server-world-not-ready" }
        end
        local manager = ctx.symbol("FieldContractors")
        if type(manager) ~= "table" or manager.persistenceLoadedForMission ~= true
            or manager.persistenceRestoreFinished ~= true
            or type(manager.claims) ~= "table" then
            return { readState = "settings-only", reason = "claim-register-not-ready" }
        end

        local candidates, idCounts, fieldCounts = {}, {}, {}
        local scanned, invalid, truncated = 0, false, false
        for key, record in pairs(manager.claims) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(record) == "table" and record.contract == true
                and integer(record.contractFarmId, 8) == farmId then
                local id = integer(record.id, 1000000000)
                local fieldId = integer(record.fieldId, 1000000000)
                if not id or id == 0 or not fieldId or fieldId == 0
                    or integer(key, 1000000000) ~= fieldId then
                    invalid = true
                else
                    idCounts[id] = (idCounts[id] or 0) + 1
                    fieldCounts[fieldId] = (fieldCounts[fieldId] or 0) + 1
                    candidates[#candidates + 1] = {
                        id = id, fieldId = fieldId, record = record,
                    }
                end
            end
        end

        local rows = {}
        for _, item in ipairs(candidates) do
            local record = item.record
            local workType = name(ctx, record.workType, 40)
            local price = finite(record.contractPrice, MAX_MONEY)
            local area = finite(record.contractAreaHa, MAX_AREA_HA)
            local processed = finite(record.contractProcessedAreaHa, MAX_AREA_HA)
            if idCounts[item.id] ~= 1 or fieldCounts[item.fieldId] ~= 1
                or not workType or not price or price == 0 or not area or area == 0
                or not processed or processed > area + 0.01 then
                invalid = true
            else
                if #rows < MAX_ROWS then
                    rows[#rows + 1] = {
                        farmId = farmId,
                        claimId = item.id,
                        fieldId = item.fieldId,
                        fieldLabel = name(ctx, record.dynamicLabel, 80),
                        workType = workType,
                        workLabel = name(ctx, record.label, 80),
                        agreedPrice = price,
                        areaHa = area,
                        processedAreaHa = processed,
                        phase = name(ctx, record.jobPhase or record.persistenceResumePhase, 40),
                    }
                else truncated = true end
            end
        end
        table.sort(rows, function(a, b) return a.claimId < b.claimId end)
        local complete = not invalid and not truncated
        return {
            readState = (invalid or truncated) and "partial"
                or #rows > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-or-ambiguous-farm-claim"
                or truncated and "claim-scan-truncated"
                or #rows == 0 and "no-current-farm-claims" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = complete and { [tostring(farmId)] = { currentClaimCount = #rows } } or nil,
            rows = rows,
        }
    end,
})
