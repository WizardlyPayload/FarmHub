-- Crop Insurance v1.0.0.0: current farm-keyed policies and retained outcomes.
-- Read the bound server register only; do not calculate eligibility or payouts.

local MAX_SCAN = 300
local MAX_ROWS = 60
local OUTCOMES = { claim = true, denied = true, expired = true }

CompanionPages.register({
    key = "cropInsurance",
    modNames = { "KM_82103_Crop_Insurance", "FS25_CropInsurance" },
    substrings = { "crop_insurance", "cropinsurance" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-policies-only" }
        end
        local mod = ctx.symbol("CropInsurance")
        if type(mod) ~= "table" or type(mod.policies) ~= "table" or type(mod.history) ~= "table" then
            return { readState = "settings-only", reason = "no-policy-register" }
        end

        local policies, history, policyCount, pendingCount, historyCount = {}, {}, 0, 0, 0
        local scanned, invalid, truncated = 0, false, false
        for fieldKey, policy in pairs(mod.policies) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(policy) == "table" and ctx.num(policy.farmId) == farmId then
                local fieldId = ctx.num(fieldKey)
                local crop = ctx.clip(policy.fruitType, 40)
                local premium = ctx.num(policy.premiumPaid)
                local hectares = ctx.num(policy.hectares)
                local coverage = ctx.num(policy.coverageRatio)
                if fieldId == nil or fieldId <= 0 or crop == nil or crop == ""
                    or premium == nil or premium < 0 or hectares == nil or hectares <= 0
                    or coverage == nil or coverage < 0 or coverage > 1 then
                    invalid = true
                else
                    policyCount = policyCount + 1
                    local claim = policy.pendingClaim
                    if type(claim) == "table" then pendingCount = pendingCount + 1 end
                    if #policies < MAX_ROWS then
                        policies[#policies + 1] = {
                            farmId = farmId, fieldId = fieldId, crop = crop,
                            premiumPaid = ctx.round2(premium), hectares = ctx.round2(hectares),
                            coveragePercent = ctx.round2(coverage * 100),
                            purchaseDay = ctx.num(policy.purchaseDay),
                            purchaseYear = ctx.num(policy.purchaseYear),
                            insuranceYear = ctx.num(policy.insuranceYear),
                            pendingEvent = type(claim) == "table" and ctx.clip(claim.eventName, 40) or nil,
                            pendingSeverityPercent = type(claim) == "table"
                                and ctx.num(claim.severity) ~= nil
                                and ctx.round2(ctx.num(claim.severity) * 100) or nil,
                        }
                    else truncated = true end
                end
            end
        end
        table.sort(policies, function(a, b) return a.fieldId < b.fieldId end)

        scanned = 0
        for _, entry in ipairs(mod.history) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(entry) == "table" and ctx.num(entry.farmId) == farmId then
                local fieldId = ctx.num(entry.fieldId)
                local outcome = entry.outcome
                if fieldId == nil or fieldId <= 0 or not OUTCOMES[outcome] then
                    invalid = true
                else
                    historyCount = historyCount + 1
                    if #history < MAX_ROWS then
                        history[#history + 1] = {
                            farmId = farmId, fieldId = fieldId,
                            crop = ctx.clip(entry.fruitType, 40), outcome = outcome,
                            event = ctx.clip(entry.eventName, 40),
                            premiumPaid = ctx.num(entry.premiumPaid),
                            indemnity = outcome == "claim" and ctx.num(entry.indemnity) or nil,
                            endDay = ctx.num(entry.endDay),
                        }
                    else truncated = true end
                end
            end
        end
        return {
            readState = invalid and "partial" or "ok",
            reason = policyCount + historyCount == 0 and "no-farm-policies" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                policyCount = policyCount, pendingCount = pendingCount, historyCount = historyCount,
            } },
            policies = policies, history = history,
        }
    end,
})
