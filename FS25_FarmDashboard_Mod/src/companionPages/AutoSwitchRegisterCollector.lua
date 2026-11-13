-- AutoSwitch 1.0.3.0 keeps a bounded farm-tagged weighbridge and sale register.
-- Weighings come from AutoDrive Addon; neither table is extra farm cash or delivered stock.

local MAX_SOURCE_ROWS = 5000
local MAX_SHOWN_PER_KIND = 60

local function finite(value, maximum)
    local n = tonumber(value)
    if n == nil or n ~= n or n == math.huge or n == -math.huge
        or n < 0 or n > maximum then return nil end
    return n
end

local function integer(value, maximum)
    local n = finite(value, maximum)
    if n == nil or n ~= math.floor(n) then return nil end
    return n
end

local function dateFields(entry)
    local year = integer(entry.year, 10000)
    local period = integer(entry.period, 12)
    local day = integer(entry.dayInPeriod, 100)
    local minutes = integer(entry.minutes, 1440)
    if year == nil or period == nil or period < 1 or day == nil or minutes == nil then
        return nil
    end
    return { year = year, period = period, dayInPeriod = day, minutes = minutes }
end

CompanionPages.register({
    key = "autoSwitchRegister",
    modNames = { "KM_82844_AutoSwitch", "FS25_AutoSwitch" },
    substrings = { "autoswitch" },
    collect = function(ctx)
        if ctx.version ~= "1.0.3.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = integer(ctx.farmId, 1024)
        if farmId == nil or farmId < 1 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-register-only" }
        end
        if ctx.mission.isMissionStarted == false then
            return { readState = "settings-only", reason = "world-not-started" }
        end
        local register = ctx.symbol("AS_Register") or ctx.global("AS_Register")
        if type(register) ~= "table" or type(register.weighings) ~= "table"
            or type(register.sales) ~= "table" then
            return { readState = "settings-only", reason = "register-unavailable" }
        end
        if #register.weighings > MAX_SOURCE_ROWS or #register.sales > MAX_SOURCE_ROWS then
            return { readState = "partial", coverage = "truncated", reason = "source-limit" }
        end

        local weighingRows, saleRows = {}, {}
        local weighingCount, saleCount = 0, 0
        local invalid, truncated = false, false
        local function add(entry, kind)
            if type(entry) ~= "table" then invalid = true; return end
            local owner = integer(entry.farmId, 1024)
            if owner == nil then invalid = true; return end
            if owner ~= farmId then return end
            local date = dateFields(entry)
            if date == nil then invalid = true; return end
            local row = { kind = kind, farmId = farmId, year = date.year,
                period = date.period, dayInPeriod = date.dayInPeriod,
                minutes = date.minutes }
            if kind == "weighing" then
                local load = finite(entry.load, 100000000)
                local total = finite(entry.total, 100000000)
                if load == nil or total == nil or type(entry.vehicle) ~= "string"
                    or entry.vehicle == "" then invalid = true; return end
                row.vehicle = ctx.clip(entry.vehicle, 80)
                row.site = ctx.clip(entry.site, 80)
                row.driver = ctx.clip(entry.driver, 80)
                row.fillType = ctx.clip(entry.fillType, 60)
                row.loadKg, row.totalKg = load, total
                weighingCount = weighingCount + 1
            else
                local litres = finite(entry.liters, 1000000000)
                local kg = finite(entry.kg, 1000000000)
                local money = tonumber(entry.money)
                local pending = entry.pending == nil and nil
                    or finite(entry.pending, 1000000000000)
                if litres == nil or kg == nil or money == nil or money ~= money
                    or money == math.huge or money == -math.huge
                    or math.abs(money) > 1000000000000
                    or (entry.pending ~= nil and pending == nil)
                    or (entry.paid ~= nil and entry.paid ~= 1)
                    or type(entry.fillType) ~= "string" or entry.fillType == "" then
                    invalid = true; return
                end
                row.fillType = ctx.clip(entry.fillType, 60)
                row.site = ctx.clip(entry.station, 80)
                row.litres, row.kg = litres, kg
                row.money, row.pending = money, pending
                row.paid = entry.paid == 1
                saleCount = saleCount + 1
            end
            local selected = kind == "weighing" and weighingRows or saleRows
            if #selected >= MAX_SHOWN_PER_KIND then
                table.remove(selected, 1)
                truncated = true
            end
            selected[#selected + 1] = row
        end
        for _, entry in ipairs(register.weighings) do add(entry, "weighing") end
        for _, entry in ipairs(register.sales) do add(entry, "sale") end
        if invalid then
            return { readState = "partial", coverage = "partial", reason = "invalid-register-entry" }
        end
        if weighingCount == 0 and saleCount == 0 then
            return { readState = "settings-only", coverage = "complete", reason = "no-farm-records" }
        end
        local rows = {}
        for _, row in ipairs(weighingRows) do rows[#rows + 1] = row end
        for _, row in ipairs(saleRows) do rows[#rows + 1] = row end
        return { readState = truncated and "partial" or "ok",
            coverage = truncated and "truncated" or "complete",
            reason = truncated and "row-limit" or nil,
            byFarm = not truncated and { [tostring(farmId)] = {
                weighingCount = weighingCount, saleCount = saleCount,
            } } or nil, rows = rows }
    end,
})
