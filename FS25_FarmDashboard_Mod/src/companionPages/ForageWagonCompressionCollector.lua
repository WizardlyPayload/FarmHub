-- Forage Wagon Compression 1.0.0.0: live settings on forage wagons owned by this farm.
-- Compressed and current capacity may differ when existing cargo is retained.

local MAX_ROWS = 60

CompanionPages.register({
    key = "forageWagonCompression",
    modNames = { "FS25_ForageWagonCompression", "FS25_375007_Forage_Wagon_Compression", "KM_82574_Forage_Wagon_Compression" },
    substrings = { "foragewagoncompression", "forage_wagon_compression" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-vehicle-state-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, count, active = {}, 0, 0
        local truncated = ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            local state = type(vehicle) == "table" and vehicle.spec_fwc or nil
            local fillUnitIndex = type(state) == "table" and ctx.num(state.fillUnitIndex) or nil
            local base = type(state) == "table" and ctx.num(state.baseCapacity) or nil
            local compressed = type(state) == "table" and ctx.num(state.compressedCapacity) or nil
            if fillUnitIndex and fillUnitIndex > 0 and fillUnitIndex == math.floor(fillUnitIndex)
                and base and base > 0 and compressed and compressed >= base then
                count = count + 1
                local turnedOn = ctx.call(vehicle, "getIsTurnedOn")
                if turnedOn == true then active = active + 1 end
                if #rows < MAX_ROWS then
                    local row = {
                        farmId = farmId,
                        vehicleId = ctx.clip(vehicle.uniqueId or vehicle.id, 64),
                        vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName"), 70),
                        baseCapacityLitres = base,
                        compressedCapacityLitres = compressed,
                    }
                    if type(turnedOn) == "boolean" then row.compressionOn = turnedOn end
                    local current = ctx.num(ctx.call(vehicle, "getFillUnitCapacity", fillUnitIndex))
                    if current and current > 0 then row.currentCapacityLitres = current end
                    local fill = ctx.num(ctx.call(vehicle, "getFillUnitFillLevel", fillUnitIndex))
                    if fill and fill >= 0 then row.currentFillLitres = fill end
                    rows[#rows + 1] = row
                else
                    truncated = true
                end
            end
        end
        table.sort(rows, function(a, b) return tostring(a.vehicle or "") < tostring(b.vehicle or "") end)
        return {
            readState = count > 0 and "ok" or "settings-only",
            reason = count == 0 and "no-applicable-owned-wagon" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { wagonCount = count, compressionOnCount = active } },
            rows = rows,
        }
    end,
})
