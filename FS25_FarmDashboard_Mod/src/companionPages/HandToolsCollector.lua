-- Hand Tools v1.0.0.0: current mod-specific state on this farm's tool vehicles.
-- The mod's bale-picker save hook unmounts a bale; never call any save hook here.
local MAX_ROWS = 100
local MAX_ACTIONS = 12

local function positiveInteger(value)
    local n = tonumber(value)
    if n and n == n and n > 0 and n == math.floor(n) then return n end
    return nil
end

CompanionPages.register({
    key = "handTools",
    modNames = { "FS25_369801_Hand_Tools", "FS25_HandTools" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = positiveInteger(ctx.farmId)
        if not farmId then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-tool-state-only" }
        end
        local names = {
            base = "spec_" .. ctx.modName .. ".handToolBase",
            stick = "spec_" .. ctx.modName .. ".handToolStickable",
            actions = "spec_" .. ctx.modName .. ".handToolInputActions",
            picker = "spec_" .. ctx.modName .. ".handToolBalePicker",
        }
        for className, specName in pairs({ HandToolBase = names.base,
            HandToolStickable = names.stick, HandToolInputActions = names.actions,
            HandToolBalePicker = names.picker }) do
            local class = ctx.symbol(className)
            if type(class) ~= "table" or class.SPEC_TABLE_NAME ~= specName then
                return { readState = "settings-only", reason = "unverified-specializations" }
            end
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, ids = {}, {}
        local count, stuckCount, activeModeCount, boostedCount = 0, 0, 0, 0
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            local owner = type(vehicle) == "table"
                and positiveInteger(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId)
                or nil
            if owner == farmId and type(rawget(vehicle, names.base)) == "table" then
                local id = ctx.call(vehicle, "getUniqueId") or vehicle.uniqueId
                local stick = rawget(vehicle, names.stick)
                local actions = rawget(vehicle, names.actions)
                local picker = rawget(vehicle, names.picker)
                local modes, modeIds = {}, {}
                local rowInvalid = type(id) ~= "string" or id == "" or #id > 80
                local sticked, boosted
                if stick ~= nil then
                    if type(stick) == "table" then sticked = stick.isSticked end
                    if type(sticked) ~= "boolean" then rowInvalid = true end
                end
                if actions ~= nil then
                    if type(actions) ~= "table" or type(actions.inputActions) ~= "table" then
                        rowInvalid = true
                    else
                        local scanned = 0
                        for _, action in pairs(actions.inputActions) do
                            scanned = scanned + 1
                            if scanned > MAX_ACTIONS then
                                truncated = true
                                break
                            end
                            if type(action) ~= "table" then
                                rowInvalid = true
                            elseif action.allowSaving == true then
                                local actionId = action.id
                                if action.isToggleAction ~= true or type(action.isActive) ~= "boolean"
                                    or type(actionId) ~= "string" or actionId == ""
                                    or #actionId > 40 or modeIds[actionId] then
                                    rowInvalid = true
                                else
                                    modeIds[actionId] = true
                                    if action.isActive then modes[#modes + 1] = actionId end
                                end
                            end
                        end
                    end
                end
                if picker ~= nil then
                    if type(picker) == "table" then
                        boosted = ctx.call(vehicle, "getIsOverloaded")
                    end
                    if type(boosted) ~= "boolean" then rowInvalid = true end
                end
                if stick == nil and actions == nil and picker == nil then
                    -- HandToolBase without the reviewed mod-owned states adds no value.
                elseif rowInvalid then
                    invalid = true
                else
                    ids[id] = (ids[id] or 0) + 1
                    if ids[id] > 1 then invalid = true end
                    count = count + 1
                    if sticked then stuckCount = stuckCount + 1 end
                    if boosted then boostedCount = boostedCount + 1 end
                    activeModeCount = activeModeCount + #modes
                    table.sort(modes)
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            vehicleId = id,
                            tool = ctx.clip(ctx.call(vehicle, "getFullName")
                                or ctx.call(vehicle, "getName") or id, 80),
                            stuck = sticked,
                            activeModes = modes,
                            pickerBoosted = boosted,
                        }
                    else
                        truncated = true
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
        local complete = not invalid and not truncated
        return {
            readState = not complete and "partial" or count == 0
                and "settings-only" or "ok",
            reason = invalid and "invalid-or-ambiguous-owned-tool"
                or truncated and "scan-truncated"
                or count == 0 and "no-applicable-owned-tool" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = complete and { [tostring(farmId)] = {
                handToolCount = count,
                stuckCount = stuckCount,
                activeModeCount = activeModeCount,
                boostedPickerCount = boostedCount,
            } } or nil,
            rows = rows,
        }
    end,
})
