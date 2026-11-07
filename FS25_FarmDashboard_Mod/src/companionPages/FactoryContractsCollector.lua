-- GN Realism Factory Contracts v1.1.0.0: signed obligations for one export farm.
-- Read the loaded server register only. Offers and client snapshots are excluded.

local MAX_SCAN = 200
local MAX_ROWS = 40

CompanionPages.register({
    key = "factoryContracts",
    modNames = { "FS25_FactoryContracts", "KM_82639_Factory_Contracts" },
    substrings = { "factorycontracts", "factory_contracts" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-register-only" }
        end
        if ctx.version ~= nil and ctx.version ~= "1.1.0.0" then
            return { readState = "settings-only", reason = "version-unreviewed" }
        end
        local manager = type(ctx.mission) == "table" and ctx.mission.FactoryContracts or nil
        if type(manager) ~= "table" or (manager.loadState ~= 2 and manager.loadState ~= 3)
            or type(manager.contracts) ~= "table" then
            return { readState = "unavailable", reason = "server-register-not-loaded" }
        end

        local rows, owned, active, scanned = {}, 0, 0, 0
        local truncated, invalid = false, false
        for _, contract in pairs(manager.contracts) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(contract) == "table" and ctx.num(contract.farmId) == farmId then
                owned = owned + 1
                if contract.status == "activo" then active = active + 1 end
                local total = ctx.num(contract.totalQuantity)
                local delivered = ctx.num(contract.deliveredTotal)
                if total == nil or total < 0 or delivered == nil or delivered < 0
                    or ctx.num(contract.id) == nil then
                    invalid = true
                elseif #rows < MAX_ROWS then
                    local fillName = nil
                    local fillIndex = ctx.num(contract.fillTypeIndex)
                    local fillManager = ctx.symbol("g_fillTypeManager")
                    local fill = fillIndex ~= nil and ctx.call(fillManager, "getFillTypeByIndex", fillIndex) or nil
                    if type(fill) == "table" then fillName = ctx.clip(fill.name, 48) end
                    rows[#rows + 1] = {
                        id = math.floor(ctx.num(contract.id)),
                        factoryId = ctx.clip(tostring(contract.factoryId or ""), 80),
                        fillType = fillName,
                        fillTypeIndex = fillIndex,
                        contractType = ctx.clip(contract.contractType, 32),
                        status = ctx.clip(contract.status, 32),
                        totalLiters = ctx.round2(total),
                        deliveredLiters = ctx.round2(delivered),
                        remainingLiters = ctx.round2(math.max(0, total - delivered)),
                        lockedPrice = ctx.num(contract.lockedPrice),
                        durationDays = ctx.num(contract.durationDays),
                    }
                else
                    truncated = true
                end
            end
        end
        table.sort(rows, function(a, b) return a.id < b.id end)
        return {
            readState = invalid and "partial" or owned > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-contract" or owned == 0 and "no-signed-contracts" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                signedCount = owned, activeCount = active, currentDay = ctx.num(manager.currentDay),
            } },
            contracts = rows,
        }
    end,
})
