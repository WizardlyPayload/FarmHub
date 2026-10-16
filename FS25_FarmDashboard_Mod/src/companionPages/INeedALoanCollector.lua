-- FS25 FarmDashboard | companionPages/INeedALoanCollector.lua | v1.0.0
-- I Need A Loan: INeedALoanShopLogger (mod env) offers the vanilla bank loan when a purchase is short of
-- money. Loan amounts round up to LOAN_STEP; a buffer is added when the balance would fall below the
-- low-balance threshold. It keeps no loan history: live figures are the vanilla farm loan fields.

local MAX_FARMS = 16
local LOAN_MAX_FIELDS = { "loanMax", "maxLoan" }

local function farmList(ctx)
    local fm = ctx.global("g_farmManager")
    local out = {}
    if type(fm) ~= "table" then
        return out
    end
    local farms = ctx.call(fm, "getFarms")
    if type(farms) ~= "table" then
        farms = type(fm.farms) == "table" and fm.farms or {}
    end
    for _, farm in pairs(farms) do
        local fid = type(farm) == "table" and ctx.num(farm.farmId) or nil
        if fid and fid > 0 and #out < MAX_FARMS then
            out[#out + 1] = farm
        end
    end
    return out
end

--- Vanilla loan ceiling: read the field only; INeedALoan's getLoanMax also calls farm:updateMaxLoan.
local function loanMaxOf(ctx, farm)
    for _, field in ipairs(LOAN_MAX_FIELDS) do
        local v = ctx.num(farm[field])
        if v then
            return v
        end
    end
    return ctx.num(ctx.call(farm, "getLoanMax"))
end

local function readFarm(ctx, inl, farm)
    local fid = ctx.num(farm.farmId)
    local balance = ctx.num(ctx.call(ctx.mission, "getMoney", fid)) or ctx.num(farm.money)
    local loan = ctx.num(ctx.call(farm, "getLoan")) or ctx.num(farm.loan)
    local loanMax = loanMaxOf(ctx, farm)
    local threshold = ctx.num(inl.LOW_BALANCE_THRESHOLD)
    local step = ctx.num(inl.LOAN_STEP)
    local headroom = (loan and loanMax) and math.max(loanMax - loan, 0) or nil
    return {
        balance = ctx.round2(balance),
        loan = ctx.round2(loan),
        dailyInterest = ctx.round2(ctx.call(farm, "calculateDailyLoanInterest")),
        loanMax = ctx.round2(loanMax),
        headroom = ctx.round2(headroom),
        headroomSteps = (headroom and step and step > 0) and math.floor(headroom / step) or nil,
        lowBalance = (balance and threshold) and balance < threshold or nil,
    }
end

CompanionPages.register({
    key = "iNeedALoan",
    modNames = { "FS25_INeedALoan", "FS25_365743_I_Need_A_Loan" },
    substrings = { "ineedaloan" },
    collect = function(ctx)
        local inl = ctx.symbol("INeedALoanShopLogger")
        if type(inl) ~= "table" then
            return nil
        end
        local popups = {}
        local stored = type(inl.loanPopupSettings) == "table" and inl.loanPopupSettings or {}
        local defs = type(inl.POPUP_SETTING_DEFINITIONS) == "table" and inl.POPUP_SETTING_DEFINITIONS or {}
        for _, def in ipairs(defs) do
            if type(def) == "table" and type(def.key) == "string" and #popups < 20 then
                popups[#popups + 1] = {
                    key = ctx.clip(def.key, 40),
                    title = ctx.clip(def.titleFallback, 80),
                    enabled = stored[def.key] ~= false,
                }
            end
        end
        local pending = ctx.count(inl.pendingLoanRequests)
        local hooks = {
            shop = inl.hooksInstalled == true,
            construction = inl.constructionHooksInstalled == true,
            farmland = inl.farmlandHooksInstalled == true,
            refill = inl.refillDialogHooksInstalled == true,
            animals = inl.animalScreenHooksInstalled == true,
            workshop = inl.workshopScreenHooksInstalled == true,
            palletShop = inl.palletShopDialogHooksInstalled == true,
            existingPlaceable = inl.existingPlaceableHooksInstalled == true,
        }

        local byFarm = {}
        for _, farm in ipairs(farmList(ctx)) do
            local ok, row = pcall(readFarm, ctx, inl, farm)
            if ok and type(row) == "table" then
                byFarm[tostring(farm.farmId)] = row
            end
        end

        local farmClass = ctx.global("Farm")
        return {
            readState = "ok",
            bankInterestRate = type(farmClass) == "table" and ctx.num(farmClass.LOAN_INTEREST_RATE) or nil,
            settings = {
                lowBalanceBuffer = inl.enableLowBalanceBuffer ~= false,
                loanStep = ctx.num(inl.LOAN_STEP),
                bufferAmount = ctx.num(inl.EXTRA_BUFFER_AMOUNT),
                lowBalanceThreshold = ctx.num(inl.LOW_BALANCE_THRESHOLD),
            },
            popups = popups,
            hooks = hooks,
            pendingRequests = pending,
            byFarm = byFarm,
        }
    end,
})
