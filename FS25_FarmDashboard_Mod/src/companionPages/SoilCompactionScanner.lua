-- Read-only, frame-bounded snapshot of the exact Soil Compaction cell grid.
-- A completed scan is a dated observation; prefix totals are never exported.
SoilCompactionScanner = SoilCompactionScanner or {}

local MAX_CELLS_PER_FRAME = 40
local MAX_FRAME_SECONDS = 0.001
local RESCAN_AFTER_MS = 120000
local MAX_SNAPSHOT_AGE_MS = 180000

local function finite(n)
    return type(n) == "number" and n == n and n ~= math.huge and n ~= -math.huge
end

local function nowMs()
    return finite(_G.g_time) and _G.g_time or 0
end

local function currentSource()
    local mission = rawget(_G, "g_currentMission")
    local mod = rawget(_G, "g_soilCompaction")
    local util = rawget(_G, "FSDensityMapUtil")
    local farmlandManager = rawget(_G, "g_farmlandManager")
    if type(mod) ~= "table" or type(mod.cells) ~= "table" or
       type(mod.keyToWorldCenter) ~= "function" or not finite(mod.overlayRevision) or
       not finite(mod.cellSize) or mod.cellSize < 0.5 or mod.cellSize > 40 or
       type(util) ~= "table" or type(util.getIsFieldAtWorldPos) ~= "function" or
       type(farmlandManager) ~= "table" or type(farmlandManager.getFarmlandAtWorldPosition) ~= "function" or
       type(farmlandManager.getFarmlandOwner) ~= "function" or type(mission) ~= "table" then
        return nil
    end
    return mission, mod, util, farmlandManager
end

local function matches(state, mission, mod)
    return state and state.mission == mission and state.mod == mod and
           state.cells == mod.cells and state.revision == mod.overlayRevision and
           state.cellSize == mod.cellSize
end

local function begin(mission, mod)
    return {
        mission = mission, mod = mod, cells = mod.cells, revision = mod.overlayRevision,
        cellSize = mod.cellSize, cursor = nil, scanned = 0, parcels = {},
        finishedAt = nil, error = nil,
    }
end

function SoilCompactionScanner:step()
    local mission, mod, util, farmlandManager = currentSource()
    if not mission then self.state = nil; return end
    local state = self.state
    if not matches(state, mission, mod) then state = begin(mission, mod); self.state = state end
    local now = nowMs()
    if state.finishedAt then
        if now >= state.finishedAt and now - state.finishedAt < RESCAN_AFTER_MS then return end
        state = begin(mission, mod); self.state = state
    end
    if state.error then return end

    local clock = type(_G.getTimeSec) == "function" and _G.getTimeSec or nil
    local started = clock and clock() or nil
    for _ = 1, MAX_CELLS_PER_FRAME do
        local key, value = next(state.cells, state.cursor)
        if key == nil then
            state.finishedAt = now
            break
        end
        state.cursor = key
        state.scanned = state.scanned + 1
        if not finite(key) or not finite(value) or value <= 0 or value > 100 then
            state.error = "invalid-grid-cell"
            break
        end
        local okPos, x, z = pcall(mod.keyToWorldCenter, mod, key)
        if not okPos or not finite(x) or not finite(z) then
            state.error = "invalid-cell-position"
            break
        end
        local okField, isField = pcall(util.getIsFieldAtWorldPos, x, z)
        if not okField or type(isField) ~= "boolean" then
            state.error = "field-ground-unavailable"
            break
        end
        if isField then
            local okParcel, parcel = pcall(farmlandManager.getFarmlandAtWorldPosition, farmlandManager, x, z)
            if not okParcel then state.error = "parcel-unavailable"; break end
            if type(parcel) == "table" and finite(parcel.id) and parcel.id > 0 then
                local row = state.parcels[parcel.id]
                if not row then
                    row = { parcelId = parcel.id, cellCount = 0, penaltySum = 0, maxPenalty = 0 }
                    state.parcels[parcel.id] = row
                end
                row.cellCount = row.cellCount + 1
                row.penaltySum = row.penaltySum + value
                if value > row.maxPenalty then
                    row.maxPenalty, row.hotspotX, row.hotspotZ = value, x, z
                end
            end
        end
        if clock and clock() - started >= MAX_FRAME_SECONDS then break end
    end
    -- The mod increments this revision on normal compaction, relief and each
    -- weathering chunk. Discard mixed-time scans, including one changed mid-step.
    if not matches(state, mission, mod) then self.state = begin(mission, mod) end
end

function SoilCompactionScanner:read(farmId)
    local mission, mod, _, farmlandManager = currentSource()
    local state = self.state
    if not mission or not matches(state, mission, mod) then return nil, "not-scanned" end
    if state.error then return nil, state.error end
    if not state.finishedAt then return nil, "scanning" end
    local age = nowMs() - state.finishedAt
    if age < 0 or age > MAX_SNAPSHOT_AGE_MS then return nil, "stale-scan" end
    if not finite(farmId) or farmId <= 0 then return nil, "no-farm" end

    local rows = {}
    for parcelId, row in pairs(state.parcels) do
        local okOwner, owner = pcall(farmlandManager.getFarmlandOwner, farmlandManager, parcelId)
        if not okOwner then return nil, "ownership-unavailable" end
        if owner == farmId then
            rows[#rows + 1] = {
                parcelId = parcelId, cellCount = row.cellCount,
                averagePenalty = row.penaltySum / row.cellCount,
                maxPenalty = row.maxPenalty,
                hotspotX = row.hotspotX, hotspotZ = row.hotspotZ,
            }
        end
    end
    table.sort(rows, function(a, b)
        if a.maxPenalty == b.maxPenalty then return a.parcelId < b.parcelId end
        return a.maxPenalty > b.maxPenalty
    end)
    return { rows = rows, scannedCells = state.scanned, cellSize = state.cellSize, ageMs = age }, nil
end
