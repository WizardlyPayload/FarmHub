-- FS25 FarmDashboard | InvoicesDataCollector.lua | v1.0.1
-- Optional FS25_Invoices export — settings + per-farm summary + capped invoice list.
-- Host needs FarmDashboard (this zip) AND FS25_Invoices loaded; export only on authority.

InvoicesDataCollector = {}

local MAX_ITEMS = 100
local MOD_NAME = "FS25_Invoices"

local STATE_NAMES = {
    [1] = "new",
    [2] = "sent",
    [3] = "paid",
    [4] = "cancelled",
}

--- Soft detect third-party mod (g_modIsLoaded / modManager / known globals).
--- Prefer enabled=true with empty byFarm once the mod is present — do not wait for
--- invoicesManager to appear after the first mission tick.
local function invModLoaded()
    if _G.g_modIsLoaded and _G.g_modIsLoaded[MOD_NAME] then
        return true
    end
    if _G.g_modManager and _G.g_modManager.getActiveModByName then
        local ok, mod = pcall(function()
            return _G.g_modManager:getActiveModByName(MOD_NAME)
        end)
        if ok and mod ~= nil then
            return true
        end
    end
    -- FS25_Invoices Main.lua sets global Invoices = {} at source time (before mission hooks).
    local inv = rawget(_G, "Invoices")
    if type(inv) == "table" then
        return true
    end
    if rawget(_G, "InvoiceService") ~= nil or rawget(_G, "InvoicesManager") ~= nil then
        return true
    end
    local m = _G.g_currentMission
    if m and (m.invoicesManager ~= nil or m.invoiceSettings ~= nil) then
        return true
    end
    return false
end

local function invManagerReady()
    local m = _G.g_currentMission
    return m ~= nil and m.invoicesManager ~= nil
end

local function invCollectFarmIds()
    local farmIds = {}
    if _G.g_farmManager and _G.g_farmManager.farms then
        for _, farm in pairs(_G.g_farmManager.farms) do
            local fid = farm and tonumber(farm.farmId)
            if fid and fid > 0 then
                local hasPlayers = false
                if farm.players then
                    for _ in pairs(farm.players) do
                        hasPlayers = true
                        break
                    end
                end
                local name = farm.name and tostring(farm.name):match("^%s*(.-)%s*$") or ""
                if hasPlayers or name ~= "" then
                    farmIds[#farmIds + 1] = fid
                end
            end
        end
    end
    if #farmIds < 1 then
        local mission = _G.g_currentMission
        if mission and mission.getFarmId then
            local ok, fid = pcall(function() return mission:getFarmId() end)
            if ok and fid and fid > 0 then
                farmIds[#farmIds + 1] = fid
            end
        end
    end
    return farmIds
end

local function invSerializeSettings()
    local settings = _G.g_currentMission and _G.g_currentMission.invoiceSettings
    if type(settings) ~= "table" then
        return {
            invoiceVatSimulated = true,
            invoiceReminders = true,
            invoicePenalties = true,
        }
    end
    return {
        invoiceVatSimulated = settings.invoiceVatSimulated == true,
        invoiceReminders = settings.invoiceReminders == true,
        invoicePenalties = settings.invoicePenalties == true,
    }
end

local function invEmptyPayload()
    local ok, settings = pcall(invSerializeSettings)
    return {
        enabled = true,
        settings = (ok and settings) or invSerializeSettings(),
        byFarm = {},
    }
end

local function invLinePreview(invoice)
    local items = invoice and invoice.lineItems
    if type(items) ~= "table" or #items < 1 then
        return nil, 0
    end
    local first = items[1]
    local title = nil
    if first then
        if first.name and tostring(first.name) ~= "" then
            title = tostring(first.name)
        elseif first.workTypeId and _G.InvoiceService and InvoiceService.WORK_TYPES then
            for _, wt in ipairs(InvoiceService.WORK_TYPES) do
                if wt.id == first.workTypeId then
                    title = wt.nameKey
                    break
                end
            end
        end
    end
    return title, #items
end

local function invSerializeItem(invoice, farmId)
    local state = tonumber(invoice.state) or 1
    local preview, lineCount = invLinePreview(invoice)
    local direction = "other"
    if tonumber(invoice.recipientFarmId) == farmId then
        direction = "incoming"
    elseif tonumber(invoice.senderFarmId) == farmId then
        direction = "outgoing"
    end

    local createdAt = nil
    if type(invoice.createdAt) == "table" then
        createdAt = {
            day = tonumber(invoice.createdAt.day) or 0,
            hour = tonumber(invoice.createdAt.hour) or 0,
            minute = tonumber(invoice.createdAt.minute) or 0,
            period = tonumber(invoice.createdAt.period) or 0,
            year = tonumber(invoice.createdAt.year) or 0,
        }
    end

    return {
        id = tonumber(invoice.id),
        senderFarmId = tonumber(invoice.senderFarmId) or 0,
        recipientFarmId = tonumber(invoice.recipientFarmId) or 0,
        direction = direction,
        state = state,
        stateName = STATE_NAMES[state] or "new",
        totalAmount = math.floor(tonumber(invoice.totalAmount) or 0),
        vatAmount = math.floor(tonumber(invoice.vatAmount) or 0),
        totalHT = math.floor(tonumber(invoice.totalHT) or 0),
        penaltyAmount = math.floor(tonumber(invoice.penaltyAmount) or 0),
        createdDay = tonumber(invoice.createdDay) or 0,
        createdAt = createdAt,
        lineCount = lineCount,
        title = preview,
    }
end

local function invIsUnpaid(state)
    return state == 1 or state == 2
end

local function invSerializeFarm(manager, farmId)
    local incoming = {}
    local outgoing = {}
    local okIn, inList = pcall(function() return manager:getIncomingInvoices(farmId) end)
    if okIn and type(inList) == "table" then incoming = inList end
    local okOut, outList = pcall(function() return manager:getOutgoingInvoices(farmId) end)
    if okOut and type(outList) == "table" then outgoing = outList end

    local summary = {
        incomingCount = 0,
        outgoingCount = 0,
        unpaidIncomingCount = 0,
        unpaidOutgoingCount = 0,
        unpaidIncomingTotal = 0,
        unpaidOutgoingTotal = 0,
        paidIncomingTotal = 0,
        paidOutgoingTotal = 0,
        penaltyTotal = 0,
    }

    local items = {}
    local seen = {}

    local function appendInvoice(invoice)
        if not invoice then return end
        local id = tonumber(invoice.id)
        if id and seen[id] then return end
        if id then seen[id] = true end

        local state = tonumber(invoice.state) or 1
        local amount = math.floor(tonumber(invoice.totalAmount) or 0)
        local penalty = math.floor(tonumber(invoice.penaltyAmount) or 0)
        local isIncoming = tonumber(invoice.recipientFarmId) == farmId
        local isOutgoing = tonumber(invoice.senderFarmId) == farmId

        if isIncoming then
            summary.incomingCount = summary.incomingCount + 1
            if invIsUnpaid(state) then
                summary.unpaidIncomingCount = summary.unpaidIncomingCount + 1
                summary.unpaidIncomingTotal = summary.unpaidIncomingTotal + amount
            elseif state == 3 then
                summary.paidIncomingTotal = summary.paidIncomingTotal + amount
            end
            summary.penaltyTotal = summary.penaltyTotal + penalty
        end
        if isOutgoing then
            summary.outgoingCount = summary.outgoingCount + 1
            if invIsUnpaid(state) then
                summary.unpaidOutgoingCount = summary.unpaidOutgoingCount + 1
                summary.unpaidOutgoingTotal = summary.unpaidOutgoingTotal + amount
            elseif state == 3 then
                summary.paidOutgoingTotal = summary.paidOutgoingTotal + amount
            end
            if not isIncoming then
                summary.penaltyTotal = summary.penaltyTotal + penalty
            end
        end

        local ok, row = pcall(function() return invSerializeItem(invoice, farmId) end)
        if ok and row then
            table.insert(items, row)
        end
    end

    for _, invoice in ipairs(incoming) do
        appendInvoice(invoice)
    end
    for _, invoice in ipairs(outgoing) do
        appendInvoice(invoice)
    end

    table.sort(items, function(a, b)
        local da = tonumber(a and a.createdDay) or 0
        local db = tonumber(b and b.createdDay) or 0
        if da ~= db then return da > db end
        return (tonumber(a and a.id) or 0) > (tonumber(b and b.id) or 0)
    end)

    local truncated = #items > MAX_ITEMS
    if truncated then
        local capped = {}
        for i = 1, MAX_ITEMS do
            capped[i] = items[i]
        end
        items = capped
    end

    return {
        farmId = farmId,
        summary = summary,
        items = items,
        truncated = truncated or nil,
    }
end

function InvoicesDataCollector.isModLoaded()
    return invModLoaded()
end

function InvoicesDataCollector:init()
    InvoicesDataCollector._inc = nil
end

function InvoicesDataCollector:collectBegin()
    InvoicesDataCollector._inc = {
        stage = "init",
        farmIds = {},
        farmIdx = 1,
        byFarm = {},
        settings = nil,
    }
end

function InvoicesDataCollector:collectStep(opts)
    if not invModLoaded() then
        InvoicesDataCollector._inc = nil
        return true, { enabled = false }
    end

    -- Mod present but manager not ready yet — still export enabled stub so UI tabs appear.
    if not invManagerReady() then
        InvoicesDataCollector._inc = nil
        return true, invEmptyPayload()
    end

    local st = InvoicesDataCollector._inc
    if not st then return true, invEmptyPayload() end

    local per = math.max(1, tonumber(opts and opts.invoicesFarmsPerFrame) or 1)
    local manager = _G.g_currentMission.invoicesManager

    if st.stage == "init" then
        st.farmIds = invCollectFarmIds()
        local okSet, settings = pcall(invSerializeSettings)
        st.settings = (okSet and settings) or invSerializeSettings()
        st.stage = "farms"
        if #st.farmIds < 1 then
            InvoicesDataCollector._inc = nil
            return true, { enabled = true, settings = st.settings, byFarm = {} }
        end
    end

    if st.stage == "farms" then
        local hi = math.min(st.farmIdx + per - 1, #st.farmIds)
        for i = st.farmIdx, hi do
            local fid = st.farmIds[i]
            local ok, row = pcall(function() return invSerializeFarm(manager, fid) end)
            if ok and row then
                st.byFarm[tostring(fid)] = row
            end
        end
        st.farmIdx = hi + 1
        if st.farmIdx > #st.farmIds then
            InvoicesDataCollector._inc = nil
            return true, { enabled = true, settings = st.settings, byFarm = st.byFarm }
        end
        return false, { enabled = true, settings = st.settings, byFarm = st.byFarm, partial = true }
    end

    InvoicesDataCollector._inc = nil
    return true, { enabled = true, settings = st.settings, byFarm = st.byFarm }
end

function InvoicesDataCollector:collect()
    self:collectBegin()
    local done, result = false, nil
    while not done do
        done, result = self:collectStep({ invoicesFarmsPerFrame = 9999 })
    end
    return result or { enabled = false }
end
