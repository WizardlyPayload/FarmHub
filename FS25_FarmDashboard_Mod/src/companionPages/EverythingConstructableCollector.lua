-- Optional, read-only view of Ozz's Everything Constructable projects.
-- The project manager belongs to that mod; never change a project or its save file.

local MAX_PROJECTS = 40
local MAX_SCANNED = 400
local MAX_MATERIALS = 24

local function nonnegative(ctx, value)
    local n = ctx.num(value)
    return n ~= nil and math.max(0, n) or nil
end

CompanionPages.register({
    key = "everythingConstructable",
    modNames = { "FS25_EverythingConstructable" },
    substrings = { "everythingconstructable", "everything_constructable" },
    collect = function(ctx)
        local mission = ctx.mission
        local manager = type(mission) == "table" and mission.ecProjectManager or nil
        if type(manager) ~= "table" or type(manager.projects) ~= "table" then
            return { readState = "partial", reason = "manager-unavailable" }
        end

        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId <= 0 then
            return { readState = "partial", reason = "farm-unavailable" }
        end

        local projects = {}
        local scanned, truncated = 0, false
        local pendingMaterials, paused = 0, 0
        local remainingCost = 0

        for _, project in pairs(manager.projects) do
            scanned = scanned + 1
            if scanned > MAX_SCANNED then
                truncated = true
                break
            end

            if type(project) == "table" and not project.completed and ctx.num(project.farmId) == farmId then
                if #projects >= MAX_PROJECTS then
                    truncated = true
                else
                    local id = ctx.num(project.id)
                    local phaseCount = type(project.phases) == "table" and #project.phases or 0
                    local phase = ctx.num(project.currentPhaseIndex)
                    local progress = ctx.num(ctx.call(project, "getProgress"))
                    if progress == nil and phaseCount > 0 then
                        progress = math.max(0, ((phase or 1) - 1) / phaseCount)
                    end

                    local cost = nonnegative(ctx, ctx.call(project, "getTotalRemainingCost"))
                    if cost ~= nil then
                        remainingCost = remainingCost + cost
                    end

                    local mode = ctx.clip(project.mode, 30)
                    if mode ~= nil and string.lower(mode) == "paused" then
                        paused = paused + 1
                    end

                    local materials = {}
                    if type(project.materials) == "table" then
                        for _, material in ipairs(project.materials) do
                            if #materials >= MAX_MATERIALS then
                                truncated = true
                                break
                            end
                            if type(material) == "table" then
                                local required = nonnegative(ctx, material.amount)
                                local delivered = nonnegative(ctx, material.delivered)
                                local outstanding = required ~= nil and delivered ~= nil
                                    and math.max(0, required - delivered) or nil
                                if outstanding ~= nil and outstanding > 0 then
                                    pendingMaterials = pendingMaterials + 1
                                end
                                materials[#materials + 1] = {
                                    fillType = ctx.clip(material.fillTypeName, 60),
                                    required = ctx.round2(required),
                                    delivered = ctx.round2(delivered),
                                    remaining = ctx.round2(outstanding),
                                }
                            end
                        end
                    end

                    local name = ctx.call(project, "getStoreItemName")
                    local position = type(project.position) == "table" and project.position or nil
                    projects[#projects + 1] = {
                        id = id,
                        farmId = farmId,
                        name = ctx.clip(name, 100),
                        mode = mode,
                        phase = phase,
                        phaseCount = phaseCount,
                        progress = progress ~= nil and math.min(1, math.max(0, progress)) or nil,
                        totalPrice = ctx.round2(nonnegative(ctx, project.totalPrice)),
                        totalPaid = ctx.round2(nonnegative(ctx, project.totalPaid)),
                        remainingCost = ctx.round2(cost),
                        x = position and ctx.round2(ctx.num(position[1])) or nil,
                        z = position and ctx.round2(ctx.num(position[3])) or nil,
                        materials = materials,
                    }
                end
            end
        end

        table.sort(projects, function(a, b)
            return (a.id or 0) < (b.id or 0)
        end)

        return {
            readState = truncated and "partial" or "ok",
            coverage = truncated and "truncated" or "complete",
            byFarm = {
                [tostring(farmId)] = {
                    siteCount = #projects,
                    pausedCount = paused,
                    pendingMaterials = pendingMaterials,
                    remainingCost = ctx.round2(remainingCost),
                },
            },
            projects = projects,
        }
    end,
})
