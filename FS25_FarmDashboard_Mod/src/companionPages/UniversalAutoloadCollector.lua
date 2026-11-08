-- Universal Autoload v1.1.1.0: current configuration of owned autoload vehicles.
-- The mod's save hook mutates transient state; only read the live specialization.
local MAX_ROWS = 60
local MAX_INDEX = 1000
local SIDES = { left = true, right = true, both = true, rear = true, front = true, none = true }

local function index(value, maximum)
    local n = tonumber(value)
    if n ~= nil and n == n and n >= 1 and n <= maximum
        and n == math.floor(n) then return n end
    return nil
end

CompanionPages.register({
    key = "universalAutoload",
    modNames = { "FS25_UniversalAutoload", "KM_68066_Universal_Autoload",
        "KM_58738_Universal_Autoload" },
    substrings = { "universalautoload", "universal_autoload" },
    collect = function(ctx)
        if ctx.version ~= "1.1.1.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = index(ctx.farmId, 8)
        if farmId == nil then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-vehicle-state-only" }
        end
        local source = ctx.symbol("UniversalAutoload")
        local materials = type(source) == "table" and source.MATERIALS or nil
        local containers = type(source) == "table" and source.CONTAINERS or nil
        if type(materials) ~= "table" or type(containers) ~= "table"
            or #materials < 1 or #materials > MAX_INDEX
            or #containers < 1 or #containers > MAX_INDEX then
            return { readState = "settings-only", reason = "autoload-register-not-ready" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, ids = {}, {}
        local count, filtered, collection = 0, 0, 0
        local invalid = false
        local truncated = ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            local spec = type(vehicle) == "table" and vehicle.spec_universalAutoload or nil
            if type(spec) == "table" and spec.isAutoloadAvailable == true
                and spec.autoloadDisabled ~= true and spec.initialised == true then
                local id = vehicle.uniqueId
                local materialIndex = index(spec.currentMaterialIndex, #materials)
                local containerIndex = index(spec.currentContainerIndex, #containers)
                local material = materialIndex and materials[materialIndex] or nil
                local container = containerIndex and containers[containerIndex] or nil
                local materialInfo = materialIndex and type(source.MATERIALS_FILLTYPE) == "table"
                    and source.MATERIALS_FILLTYPE[materialIndex] or nil
                local materialTitle = type(materialInfo) == "table"
                    and type(materialInfo.title) == "string" and materialInfo.title or nil
                local loadside, tipside = spec.currentLoadside, spec.currentTipside
                if type(id) ~= "string" or id == "" or #id > 80
                    or type(material) ~= "string" or material == "" or #material > 80
                    or type(container) ~= "string" or container == "" or #container > 80
                    or SIDES[loadside] ~= true or SIDES[tipside] ~= true
                    or type(spec.currentLoadingFilter) ~= "boolean"
                    or type(spec.autoCollectionMode) ~= "boolean"
                    or type(spec.useHorizontalLoading) ~= "boolean" then
                    invalid = true
                else
                    ids[id] = (ids[id] or 0) + 1
                    if ids[id] > 1 then invalid = true end
                    count = count + 1
                    if spec.currentLoadingFilter then filtered = filtered + 1 end
                    if spec.autoCollectionMode then collection = collection + 1 end
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            vehicleId = id,
                            vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                or ctx.call(vehicle, "getName") or id, 80),
                            material = ctx.clip(material, 80),
                            materialTitle = ctx.clip(materialTitle, 80),
                            container = ctx.clip(container, 80),
                            loadside = loadside,
                            tipside = tipside,
                            loadingFilter = spec.currentLoadingFilter,
                            autoCollectionMode = spec.autoCollectionMode,
                            horizontalLoading = spec.useHorizontalLoading,
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
            reason = invalid and "invalid-or-ambiguous-owned-autoload"
                or truncated and "scan-truncated"
                or count == 0 and "no-applicable-owned-vehicle" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = complete and { [tostring(farmId)] = {
                vehicleCount = count,
                filteredCount = filtered,
                collectionModeCount = collection,
            } } or nil,
            rows = rows,
        }
    end,
})
