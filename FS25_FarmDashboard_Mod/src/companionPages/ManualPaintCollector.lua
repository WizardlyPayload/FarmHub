-- Manual Paint v1.0.0.1: saved target colors and finishes on owned vehicles.
-- A target RGB is not the rendered color when a material uses an atlas texture.

local MAX_VEHICLES = 60
local MAX_PARTS_PER_VEHICLE = 512
local MAX_SAMPLES = 3

local function colorHex(value, ctx)
    if type(value) ~= "table" then return nil end
    local channels = {}
    for i = 1, 3 do
        local channel = ctx.num(value[i])
        if channel == nil or channel < 0 or channel > 1 then return nil end
        channels[i] = math.floor(channel * 255 + 0.5)
    end
    return string.format("#%02X%02X%02X", channels[1], channels[2], channels[3])
end

CompanionPages.register({
    key = "manualPaint",
    modNames = { "FS25_369086_FS25_ManualPaint", "FS25_ManualPaint" },
    substrings = { "manualpaint" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-vehicles-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end
        local rows, customized, totalParts = {}, 0, 0
        local partial, truncated = false, ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" and type(vehicle.spec_manualPaint) == "table" then
                local map = ctx.call(vehicle, "mpGetColorMap")
                if type(map) ~= "table" then
                    partial = true
                else
                    local parts, scanned, colors, finishes = 0, 0, {}, {}
                    local seenColors, seenFinishes = {}, {}
                    for key, value in pairs(map) do
                        if scanned >= MAX_PARTS_PER_VEHICLE then
                            truncated = true
                            break
                        end
                        scanned = scanned + 1
                        if type(key) == "string" and type(value) == "table" then
                            parts = parts + 1
                            local hex = colorHex(value, ctx)
                            if hex ~= nil and not seenColors[hex] and #colors < MAX_SAMPLES then
                                seenColors[hex] = true
                                colors[#colors + 1] = hex
                            end
                            local finish = value[4]
                            if type(finish) == "string" and finish ~= ""
                                and not seenFinishes[finish] and #finishes < MAX_SAMPLES then
                                seenFinishes[finish] = true
                                finishes[#finishes + 1] = ctx.clip(finish, 24)
                            end
                        else
                            partial = true
                        end
                    end
                    if parts > 0 then
                        customized = customized + 1
                        totalParts = totalParts + parts
                        if #rows < MAX_VEHICLES then
                            table.sort(colors)
                            table.sort(finishes)
                            rows[#rows + 1] = {
                                farmId = farmId,
                                vehicleId = ctx.clip(vehicle.uniqueId or vehicle.id, 64),
                                vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                    or ctx.call(vehicle, "getName") or "", 70),
                                partCount = parts,
                                colors = colors,
                                finishes = finishes,
                            }
                        else
                            truncated = true
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return (a.vehicle or "") < (b.vehicle or "") end)
        return {
            readState = partial and "partial" or customized > 0 and "ok" or "settings-only",
            reason = customized == 0 and "no-custom-owned-vehicles" or nil,
            coverage = truncated and "truncated" or partial and "partial" or "complete",
            byFarm = { [tostring(farmId)] = { customizedVehicleCount = customized, customizedPartCount = totalParts } },
            rows = rows,
        }
    end,
})
