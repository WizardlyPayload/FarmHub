-- Towing Chain With Hook 1.0.0.0: current links between owned vehicles.
-- The mod saves connection references, not a towing/work history.

local MAX_ROWS = 80

local function ownerOf(ctx, vehicle)
    if type(vehicle) ~= "table" or vehicle.isDeleted == true or vehicle.isDeleting == true then
        return nil
    end
    local owner = ctx.num(vehicle.ownerFarmId)
    if owner == nil then owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId")) end
    if owner == nil or owner ~= math.floor(owner) or owner <= 0 then return nil end
    return owner
end

CompanionPages.register({
    key = "towingChainHook",
    modNames = { "FS25_318102_Towing_Chain_With_Hook" },
    substrings = { "towing_chain_with_hook", "towingchainwithhook" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId ~= math.floor(farmId) or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-vehicle-state-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, chains, links = {}, 0, 0
        local incomplete, truncated = false, ctx.ownedScanTruncated == true
        local function addLink(chain, target, kind)
            if ownerOf(ctx, target) ~= farmId then
                incomplete = true -- Foreign or missing target: do not export its identity.
                return
            end
            local targetId = ctx.call(target, "getUniqueId") or target.uniqueId or target.id
            local chainId = ctx.call(chain, "getUniqueId") or chain.uniqueId or chain.id
            if targetId == nil or chainId == nil then incomplete = true; return end
            links = links + 1
            if #rows >= MAX_ROWS then truncated = true; return end
            rows[#rows + 1] = {
                farmId = farmId,
                chainId = ctx.clip(chainId, 64),
                chain = ctx.clip(ctx.call(chain, "getFullName") or ctx.call(chain, "getName"), 80),
                targetId = ctx.clip(targetId, 64),
                target = ctx.clip(ctx.call(target, "getFullName") or ctx.call(target, "getName"), 80),
                kind = kind,
            }
        end

        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" and type(vehicle.spec_towingChainHook) == "table" then
                chains = chains + 1
                local spec = vehicle.spec_towingChainHook
                if type(spec.isUsed) ~= "boolean" or type(spec.hookMounted) ~= "boolean" then
                    incomplete = true
                else
                    if spec.isUsed then
                        addLink(vehicle, type(spec.joint) == "table" and spec.joint.vehicleId, "tow")
                    end
                    if spec.hookMounted then
                        addLink(vehicle, spec.hookedVehicleId, "hook")
                    end
                end
            end
        end
        if chains == 0 then
            return { readState = "settings-only", reason = "no-owned-chain" }
        end
        table.sort(rows, function(a, b)
            if a.chainId == b.chainId then return a.kind < b.kind end
            return a.chainId < b.chainId
        end)
        local partial = incomplete or truncated
        return {
            readState = partial and "partial" or "ok",
            reason = incomplete and "unresolved-or-foreign-link" or (truncated and "row-limit" or nil),
            coverage = truncated and "truncated" or (incomplete and "partial" or "complete"),
            byFarm = not partial and { [tostring(farmId)] = { chainCount = chains, linkCount = links } } or nil,
            rows = rows,
        }
    end,
})
