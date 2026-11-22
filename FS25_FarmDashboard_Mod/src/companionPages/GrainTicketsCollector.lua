-- Down Crops & Grain Economy v1.8.0.2 holds completed, farm-keyed delivery
-- tickets for the current crop year. Read its live server list only.

local MAX_SCAN = 200
local MAX_ROWS = 96

CompanionPages.register({
    key = "grainTickets",
    modNames = { "FS25_DownCropsAndTickets" },
    substrings = { "downcropsandtickets" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local mod = ctx.symbol("HighWindCropDamage")
        if type(mod) ~= "table" or mod.isServer ~= true or type(mod.cropTickets) ~= "table" then
            return { readState = "settings-only", reason = "no-server-tickets" }
        end

        local rows, count, gross, deductions, net = {}, 0, 0, 0, 0
        local invalid, scanIncomplete, rowsTruncated = false, false, false
        for index, ticket in ipairs(mod.cropTickets) do
            if index > MAX_SCAN then
                scanIncomplete = true
                break
            end
            if type(ticket) == "table" and ctx.num(ticket.farmId) == farmId then
                local liters = ctx.num(ticket.liters)
                local ticketGross = ctx.num(ticket.gross)
                local ticketDeduction = ctx.num(ticket.deductionAmount)
                local ticketNet = ctx.num(ticket.net)
                if liters and liters > 0 and ticketGross and ticketGross >= 0
                    and ticketDeduction and ticketDeduction >= 0
                    and ticketNet and ticketNet >= 0 then
                    count = count + 1
                    gross = gross + ticketGross
                    deductions = deductions + ticketDeduction
                    net = net + ticketNet
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            id = ctx.num(ticket.id),
                            year = ctx.num(ticket.year),
                            period = ctx.num(ticket.period),
                            day = ctx.num(ticket.day),
                            crop = ctx.clip(ticket.cropTitle, 64),
                            station = ctx.clip(ticket.stationName, 80),
                            liters = liters,
                            gross = ticketGross,
                            deductionAmount = ticketDeduction,
                            net = ticketNet,
                            grade = ctx.clip(ticket.grade, 64),
                            moisturePercent = ctx.num(ticket.moisturePercent),
                            moistureStatus = ctx.clip(ticket.moistureStatus, 24),
                            weightNetKg = ctx.num(ticket.weightNetKg),
                        }
                    else
                        rowsTruncated = true
                    end
                else
                    invalid = true
                end
            end
        end
        table.sort(rows, function(a, b)
            return (a.id or 0) > (b.id or 0)
        end)
        local complete = not invalid and not scanIncomplete
        return {
            readState = complete and "ok" or "partial",
            coverage = (scanIncomplete or rowsTruncated) and "truncated"
                or invalid and "partial" or "complete",
            cropYear = ctx.num(mod.cropTicketYear),
            byFarm = complete and { [tostring(farmId)] = {
                ticketCount = count, gross = ctx.round2(gross),
                deductions = ctx.round2(deductions), net = ctx.round2(net),
            } } or nil,
            rows = rows,
        }
    end,
})
