-- Owned-field relief priorities from a completed, bounded Soil Compaction scan.
-- A snapshot is dated; it is not an instantaneous whole-grid reading.
CompanionPages.register({
    key = "soilCompaction",
    modNames = { "KM_81205_Soil_Compaction", "FS25_SoilCompaction" },
    substrings = { "soil_compaction", "soilcompaction" },
    collect = function(ctx)
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId <= 0 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-grid-only" }
        end
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local scanner = rawget(_G, "SoilCompactionScanner")
        if type(scanner) ~= "table" or type(scanner.read) ~= "function" then
            return { readState = "failed", reason = "scanner-unavailable" }
        end
        local snapshot, reason = scanner:read(farmId)
        if type(snapshot) ~= "table" then
            return {
                readState = (reason == "scanning" or reason == "not-scanned") and "pending" or "failed",
                reason = reason or "scan-unavailable",
            }
        end
        local rows = {}
        for _, row in ipairs(snapshot.rows) do
            rows[#rows + 1] = {
                farmId = farmId, parcelId = row.parcelId,
                fieldName = ctx.clip(row.fieldName, 70),
                cellCount = row.cellCount,
                averagePenalty = row.averagePenalty,
                maxPenalty = row.maxPenalty,
                hotspotX = row.hotspotX, hotspotZ = row.hotspotZ,
            }
        end
        return {
            readState = "ok",
            coverage = snapshot.truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                affectedParcels = snapshot.affectedParcels,
                affectedCells = snapshot.affectedCells,
                gridCellSizeMeters = snapshot.cellSize,
                snapshotAgeMs = snapshot.ageMs,
            } },
            rows = rows,
        }
    end,
})
