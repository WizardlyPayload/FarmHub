-- Swath Router v1.0.0.0: current AI swath-adoption state on owned implements.
-- These load-time capabilities do not measure hired work or completed routes.

local MAX_ROWS = 60

local function validWidth(value)
    local n = tonumber(value)
    return n ~= nil and n == n and n ~= math.huge and n ~= -math.huge
        and n >= 0.5 and n <= 100 and n or nil
end

CompanionPages.register({
    key = "swathRouter",
    modNames = { "FS25_372019_Swath_Router", "KM_82873_Swath_Router", "FS25_Swath_Router" },
    substrings = { "swath_router", "swathrouter" },
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
        local rows, readyCount, stopWhenFullCount = {}, 0, 0
        local truncated, partial = ctx.ownedScanTruncated == true, false
        for _, vehicle in ipairs(vehicles) do
            local data = type(vehicle) == "table" and vehicle.swathRouterData or nil
            if type(data) == "table" then
                local width = validWidth(data.workingWidth)
                local fillTypes = data.fillTypes
                local count = type(fillTypes) == "table" and #fillTypes or 0
                if width == nil or count < 1 or count > 64 or type(data.stopsWhenFull) ~= "boolean" then
                    partial = true
                else
                    readyCount = readyCount + 1
                    if data.stopsWhenFull then stopWhenFullCount = stopWhenFullCount + 1 end
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            vehicleId = ctx.clip(vehicle.uniqueId or vehicle.id, 64),
                            vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                or ctx.call(vehicle, "getName") or "", 70),
                            workingWidthMetres = width,
                            swathFillTypeCount = count,
                            stopsWhenFull = data.stopsWhenFull,
                        }
                    else truncated = true end
                end
            end
        end
        table.sort(rows, function(a, b) return (a.vehicle or "") < (b.vehicle or "") end)
        return {
            readState = partial and "partial" or readyCount > 0 and "ok" or "settings-only",
            reason = readyCount == 0 and "no-adopted-owned-swath-implement" or nil,
            coverage = truncated and "truncated" or partial and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                readyCount = readyCount,
                stopWhenFullCount = stopWhenFullCount,
            } },
            rows = rows,
        }
    end,
})
