-- Read-only orchard snapshot for base-game grapes/olives and DLC vine crops.
-- PlaceableVine and PlaceableOrchard both provide getVineFruitTypeIndex.
OrchardDataCollector = {}

local cachedMission, cachedRows = nil, {}
local trackedFruits = { GRAPE = true, OLIVE = true, BANANA = true, COFFEECHERRIES = true }

local function call(target, method, ...)
    if type(target) ~= "table" or type(target[method]) ~= "function" then return nil end
    local ok, value = pcall(target[method], target, ...)
    if ok then return value end
    return nil
end

local function finite(value)
    local n = tonumber(value)
    if n == nil or n ~= n or n == math.huge or n == -math.huge then return nil end
    return n
end

local function readRows(placeable, fruitIndex, fence, now)
    local segments = fence and fence.segments
    if type(segments) ~= "table" then return nil, nil, nil, nil, false end
    local count = #segments
    local key = tostring(placeable)
    local previous = cachedRows[key]
    if previous and previous.count == count and now >= previous.time and now - previous.time < 60000 then
        return previous.count, previous.length, previous.ready, previous.withered, previous.measured
    end
    local length, measuredLength, ready, withered = 0, 0, 0, 0
    local first = segments[1]
    local canRead = type(placeable.getHasSegmentTargetGrowthState) == "function"
        and (type(placeable.spec_vine) == "table" or (type(first) == "table" and type(first.getHasTargetGrowthState) == "function"))
    local measured = canRead and count <= 512
    for i = 1, math.min(count, 512) do
        local segment = segments[i]
        -- Base-game PlaceableFence uses x1/z1/x2/z2; DLC FenceSegment
        -- uses startPosX/startPosZ/endPosX/endPosZ.
        local x1, x2 = finite(segment.x1 or segment.startPosX), finite(segment.x2 or segment.endPosX)
        local z1, z2 = finite(segment.z1 or segment.startPosZ), finite(segment.z2 or segment.endPosZ)
        if x1 and x2 and z1 and z2 then
            local dx, dz = x2 - x1, z2 - z1
            length = length + math.sqrt(dx * dx + dz * dz)
            measuredLength = measuredLength + 1
        end
        if measured then
            if call(placeable, "getHasSegmentTargetGrowthState", segment, fruitIndex, true, false) == true then ready = ready + 1 end
            if call(placeable, "getHasSegmentTargetGrowthState", segment, fruitIndex, false, true) == true then withered = withered + 1 end
        end
    end
    if count > 512 or measuredLength ~= count then length = nil end
    if not measured then ready, withered = nil, nil end
    -- Keep the disease scan across row-geometry cache refreshes.
    local entry = previous or {}
    entry.time, entry.count, entry.length = now, count, length
    entry.ready, entry.withered, entry.measured = ready, withered, measured
    cachedRows[key] = entry
    return count, length, ready, withered, measured
end

-- Coffee disease is represented in the DLC's growth cache. Its node count can
-- be large, so scan a bounded number per export rather than querying the
-- density map or blocking one game frame. Some game builds do not expose
-- VineSystem.dirtyNodes; the DLC's live growthValues remain the source there.
local function readCoffeeDisease(placeable, fruit, fence, mission, now)
    if type(fruit) ~= "table" or type(fruit.sickReplacements) ~= "table" then return nil, false, false end
    local segments = fence and fence.segments
    if type(segments) ~= "table" or #segments == 0 or #segments > 512 then return nil, false, false end
    local key = tostring(placeable)
    local cached = cachedRows[key]
    local vineSystem = mission and mission.vineSystem
    local dirty = vineSystem and vineSystem.dirtyNodes
    if type(dirty) ~= "table" then dirty = nil end
    if not cached then return nil, false, false end
    if cached.diseaseSegmentCount ~= #segments then
        cached.diseaseTime, cached.diseaseScan, cached.diseaseUnsupported = nil, nil, nil
        cached.diseaseNodes = nil
    end
    cached.diseaseSegmentCount = #segments
    if cached.diseaseUnsupported then return nil, false, false end

    -- Once a complete scan has mapped its nodes, a known dirty coffee node
    -- invalidates the cached result immediately. Unrelated vines do not.
    if dirty and cached.diseaseNodes then
        for node in pairs(dirty) do
            if cached.diseaseNodes[node] then
                cached.diseaseTime, cached.diseaseScan = nil, nil
                break
            end
        end
    end
    if cached.diseaseTime and now >= cached.diseaseTime and now - cached.diseaseTime < 60000 then
        return cached.sickRows, true, false
    end

    local scan = cached.diseaseScan or { segment = 1, sickRows = 0, visited = 0, nodes = {} }
    local processed = 0
    while scan.segment <= #segments and processed < 2048 do
        local segment = segments[scan.segment]
        local nodes = segment and segment.vineNodes
        if type(nodes) ~= "table" or next(nodes) == nil then
            cached.diseaseScan = nil
            return nil, false, false
        end
        local sick = false
        for node, vineData in pairs(nodes) do
            scan.visited, processed = scan.visited + 1, processed + 1
            if scan.visited > 65536 or type(vineData) ~= "table"
                or type(vineData.growthValues) ~= "table" or #vineData.growthValues == 0 then
                cached.diseaseScan = nil
                cached.diseaseUnsupported = true
                return nil, false, false
            end
            scan.nodes[node] = true
            if dirty and dirty[node] then
                cached.diseaseTime, cached.diseaseScan = nil, nil
                return nil, false, true
            end
            for _, section in ipairs(vineData.growthValues) do
                if type(section) ~= "table" or type(section.values) ~= "table" then
                    cached.diseaseScan = nil
                    return nil, false, false
                end
                for state in pairs(fruit.sickReplacements) do
                    if (finite(section.values[state]) or 0) > 0 then sick = true end
                end
            end
        end
        if sick then scan.sickRows = scan.sickRows + 1 end
        scan.segment = scan.segment + 1
    end
    if scan.segment <= #segments then
        cached.diseaseScan = scan
        return nil, false, true
    end
    cached.sickRows, cached.diseaseTime = scan.sickRows, now
    cached.diseaseNodes, cached.diseaseScan = scan.nodes, nil
    return scan.sickRows, true, false
end

function OrchardDataCollector.collect(mission)
    local placeables = mission and mission.placeableSystem and mission.placeableSystem.placeables
    if type(placeables) ~= "table" then return { schema = 1, available = false, rows = {} } end
    if mission ~= cachedMission then cachedMission, cachedRows = mission, {} end
    -- GIANTS exposes engine globals through the mod environment's lookup chain.
    -- rawget(_G, ...) skips that chain and returns nil in a live save.
    local now = finite(g_time) or 0
    local rows = {}
    local truncated = false
    for _, placeable in pairs(placeables) do
        local index = call(placeable, "getVineFruitTypeIndex")
        local fruit = index and call(g_fruitTypeManager, "getFruitTypeByIndex", index)
        local fruitName = fruit and tostring(fruit.name or ""):upper() or ""
        if trackedFruits[fruitName] then
            if #rows >= 128 then
                truncated = true
            else
                local owner = finite(call(placeable, "getOwnerFarmId")) or 0
                local fence = call(placeable, "getFence") or placeable.spec_fence
                local rowCount, rowLength, ready, withered, measured = readRows(placeable, index, fence, now)
                local sick, diseaseMeasured, diseaseScanning = nil, false, false
                if fruitName == "COFFEECHERRIES" then
                    sick, diseaseMeasured, diseaseScanning = readCoffeeDisease(placeable, fruit, fence, mission, now)
                end
                rows[#rows + 1] = {
                    id = tostring(placeable.uniqueId or placeable.id or #rows + 1),
                    farmId = owner,
                    fruitType = fruitName,
                    rows = rowCount,
                    rowLengthMeters = rowLength and math.floor(rowLength + 0.5) or nil,
                    readyRows = ready,
                    witheredRows = withered,
                    growthMeasured = measured,
                    sickRows = sick,
                    diseaseMeasured = diseaseMeasured,
                    diseaseScanning = diseaseScanning,
                }
            end
        end
    end
    table.sort(rows, function(a, b)
        if a.farmId ~= b.farmId then return a.farmId < b.farmId end
        if a.fruitType ~= b.fruitType then return a.fruitType < b.fruitType end
        return a.id < b.id
    end)
    return { schema = 1, available = true, rows = rows, truncated = truncated }
end
