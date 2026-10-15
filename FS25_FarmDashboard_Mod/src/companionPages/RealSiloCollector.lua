-- FS25 FarmDashboard | companionPages/RealSiloCollector.lua | v1.0.0
-- RealSilo - Realistic Silo Compartments (Jo_Vink). Mod-env tables read here:
--   realSiloManager.silos[uid] { placeable, config { numCompartments, capacityPerCompartment,
--                                isConfigured, hasDryer } }, siloNames[uid], transfers[uid],
--                                dryingTransfers[uid], DEFAULT_COMPARTMENTS / DEFAULT_CAPACITY
--   RealSiloCompartmentStorage.siloSlots[uid] { activeSlot, slots[] { index, fillType, fillLevel,
--                                capacity, isActive, isExtension, moisture, quality } }
-- Slot moisture/quality are only copied when the mod already pinned them on the slot; the mod's
-- getEffectiveMoistureInfo is never called because it writes back onto the slot.

local SCAN_SILOS = 60
local MAX_SILOS = 20
local MAX_SLOTS = 16
local MAX_FILLTYPES = 20
local MAX_STORAGES = 8

local function fillTypeInfo(ctx, index)
    local idx = ctx.num(index)
    if idx == nil or idx <= 0 then
        return nil, nil
    end
    local ftm = ctx.global("g_fillTypeManager")
    if type(ftm) ~= "table" then
        return nil, nil
    end
    local name = ctx.call(ftm, "getFillTypeNameByIndex", idx)
    local title = nil
    local ft = ctx.call(ftm, "getFillTypeByIndex", idx)
    if type(ft) == "table" then
        title = ft.title
        name = name or ft.name
    end
    return ctx.clip(name, 40), ctx.clip(title, 60)
end

--- Native PlaceableSilo storage capacity (RealSilo never changes it; see realSiloManager.getStorageCapacity).
local function nativeCapacity(ctx, placeable)
    local spec = type(placeable) == "table" and placeable.spec_silo or nil
    if type(spec) ~= "table" or type(spec.storages) ~= "table" then
        return nil
    end
    local total = 0
    for i = 1, math.min(#spec.storages, MAX_STORAGES) do
        local storage = spec.storages[i]
        if type(storage) == "table" then
            total = total + (ctx.num(storage.capacity) or 0)
        end
    end
    return total > 0 and total or nil
end

local function slotPair(ctx, raw)
    if type(raw) ~= "table" then
        return nil
    end
    local from, to = ctx.num(raw.fromSlot), ctx.num(raw.toSlot)
    if from == nil or to == nil then
        return nil
    end
    return { fromSlot = from, toSlot = to, rate = ctx.num(raw.rate) }
end

CompanionPages.register({
    key = "realSilo",
    modNames = { "FS25_RealSilo", "FS25_369067_RealSilo_Realistic_Silo_Compartments" },
    substrings = { "realsilo", "realistic_silo" },
    collect = function(ctx)
        local mgr = ctx.symbol("realSiloManager")
        if type(mgr) ~= "table" then
            return nil
        end
        local storage = ctx.symbol("RealSiloCompartmentStorage")
        local slotMap = type(storage) == "table" and type(storage.siloSlots) == "table" and storage.siloSlots or nil
        local out = {
            defaults = {
                compartments = ctx.num(mgr.DEFAULT_COMPARTMENTS),
                capacityPerCompartment = ctx.num(mgr.DEFAULT_CAPACITY),
            },
            registeredSilos = ctx.count(mgr.silos),
        }
        local farmId = ctx.farmId
        if type(mgr.silos) ~= "table" or farmId == nil or farmId <= 0 then
            out.readState = "settings-only"
            out.reason = farmId == nil and "no-farm" or "no-silos"
            return out
        end

        local farm = {
            siloCount = 0,
            compartments = 0,
            usedCompartments = 0,
            extensionCompartments = 0,
            totalFill = 0,
            totalCapacity = 0,
            activeTransfers = 0,
            dryingTransfers = 0,
            unconfigured = 0,
            byFillType = {},
        }
        local silos = {}
        local byType = {}
        local scanned, truncated, otherFarms = 0, false, 0
        local transfers = type(mgr.transfers) == "table" and mgr.transfers or {}
        local drying = type(mgr.dryingTransfers) == "table" and mgr.dryingTransfers or {}
        local names = type(mgr.siloNames) == "table" and mgr.siloNames or {}
        for uid, silo in pairs(mgr.silos) do
            scanned = scanned + 1
            if scanned > SCAN_SILOS then
                truncated = true
                break
            end
            if type(silo) == "table" then
                local placeable = type(silo.placeable) == "table" and silo.placeable or nil
                local owner = placeable and ctx.num(placeable.ownerFarmId) or nil
                if owner ~= farmId then
                    otherFarms = otherFarms + 1
                elseif #silos >= MAX_SILOS then
                    truncated = true
                else
                    local cfg = type(silo.config) == "table" and silo.config or {}
                    local data = slotMap and slotMap[uid] or nil
                    local row = {
                        farmId = farmId,
                        id = ctx.clip(uid, 40),
                        name = ctx.clip(names[uid], 40),
                        placeableName = placeable and ctx.clip(ctx.call(placeable, "getName"), 60) or nil,
                        configured = cfg.isConfigured == true,
                        hasDryer = cfg.hasDryer == true,
                        compartments = ctx.num(cfg.numCompartments),
                        capacityPerCompartment = ctx.num(cfg.capacityPerCompartment),
                        storageCapacity = nativeCapacity(ctx, placeable),
                        activeSlot = type(data) == "table" and ctx.num(data.activeSlot) or nil,
                        transfer = slotPair(ctx, transfers[uid]),
                        dryingTransfer = slotPair(ctx, drying[uid]),
                        fill = 0,
                        capacity = 0,
                        slots = {},
                    }
                    if row.transfer and transfers[uid].active == false then
                        row.transfer = nil
                    end
                    local slots = type(data) == "table" and type(data.slots) == "table" and data.slots or {}
                    for i = 1, #slots do
                        local slot = slots[i]
                        if type(slot) == "table" then
                            local level = ctx.num(slot.fillLevel) or 0
                            local capacity = ctx.num(slot.capacity) or 0
                            local ftName, ftTitle = nil, nil
                            if level > 0 then
                                ftName, ftTitle = fillTypeInfo(ctx, slot.fillType)
                            end
                            row.fill = row.fill + level
                            row.capacity = row.capacity + capacity
                            farm.compartments = farm.compartments + 1
                            if level > 0 then
                                farm.usedCompartments = farm.usedCompartments + 1
                                local typeKey = ftName or tostring(ctx.num(slot.fillType) or 0)
                                local agg = byType[typeKey]
                                if agg == nil then
                                    agg = { fillType = ftName, title = ftTitle, liters = 0, compartments = 0 }
                                    byType[typeKey] = agg
                                end
                                agg.liters = agg.liters + level
                                agg.compartments = agg.compartments + 1
                            end
                            if slot.isExtension == true then
                                farm.extensionCompartments = farm.extensionCompartments + 1
                            end
                            if #row.slots < MAX_SLOTS then
                                row.slots[#row.slots + 1] = {
                                    index = ctx.num(slot.index) or i,
                                    fillType = ftName,
                                    title = ftTitle,
                                    fillLevel = ctx.round2(level),
                                    capacity = ctx.round2(capacity),
                                    isActive = slot.isActive == true,
                                    isExtension = slot.isExtension == true,
                                    moisture = ctx.round2(slot.moisture),
                                    quality = ctx.round2(slot.quality),
                                }
                            else
                                row.slotsTruncated = true
                            end
                        end
                    end
                    row.fill = ctx.round2(row.fill)
                    row.capacity = ctx.round2(row.capacity)
                    farm.siloCount = farm.siloCount + 1
                    farm.totalFill = farm.totalFill + (row.fill or 0)
                    farm.totalCapacity = farm.totalCapacity + (row.capacity or 0)
                    if row.transfer then
                        farm.activeTransfers = farm.activeTransfers + 1
                    end
                    if row.dryingTransfer then
                        farm.dryingTransfers = farm.dryingTransfers + 1
                    end
                    if not row.configured then
                        farm.unconfigured = farm.unconfigured + 1
                    end
                    silos[#silos + 1] = row
                end
            end
        end
        local typeRows = {}
        for _, agg in pairs(byType) do
            agg.liters = ctx.round2(agg.liters)
            typeRows[#typeRows + 1] = agg
        end
        table.sort(typeRows, function(a, b)
            if a.liters ~= b.liters then
                return a.liters > b.liters
            end
            return tostring(a.fillType or "") < tostring(b.fillType or "")
        end)
        for i = 1, math.min(#typeRows, MAX_FILLTYPES) do
            farm.byFillType[i] = typeRows[i]
        end
        farm.totalFill = ctx.round2(farm.totalFill)
        farm.totalCapacity = ctx.round2(farm.totalCapacity)
        table.sort(silos, function(a, b)
            return tostring(a.name or a.placeableName or a.id or "") < tostring(b.name or b.placeableName or b.id or "")
        end)

        out.readState = slotMap == nil and "partial" or "ok"
        out.coverage = truncated and "truncated" or "complete"
        out.otherFarmSilos = otherFarms
        out.byFarm = { [tostring(farmId)] = farm }
        -- Top level, not under byFarm: silo -> slot rows would pass the registry's depth cap.
        out.silos = silos
        return out
    end,
})
