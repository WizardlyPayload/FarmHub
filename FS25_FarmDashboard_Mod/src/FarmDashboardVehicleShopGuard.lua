-- FS25 FarmDashboard | FarmDashboardVehicleShopGuard.lua | v3.3.6
-- Read-only detection of in-flight vehicle loads (vehicleSystem.pendingVehicleLoads).
-- Never wraps vehicleSystem methods — that breaks MP shop spawn with Courseplay.

FarmDashboardVehicleShopGuard = {}
FarmDashboardVehicleShopGuard._installed = false

--- True when the engine has at least one in-flight vehicle load (read-only, no method hooks).
function FarmDashboardVehicleShopGuard.hasEnginePendingLoads()
    local mission = _G.g_currentMission
    local vs = mission and mission.vehicleSystem
    if vs == nil then return false end

    for _, key in ipairs({ "pendingVehicleLoads", "pendingLoads", "vehicleLoadsPending" }) do
        local t = vs[key]
        if type(t) == "table" and next(t) ~= nil then
            return true
        end
    end
    return false
end

--- @return number 0 or 1 (enough for spawn grace; avoids iterating the fleet table)
function FarmDashboardVehicleShopGuard.getPendingLoadCount()
    return FarmDashboardVehicleShopGuard.hasEnginePendingLoads() and 1 or 0
end

local function markInstalled()
    if FarmDashboardVehicleShopGuard._installed then return true end
    if not (FarmDashboard and FarmDashboard.isAuthority and FarmDashboard:isAuthority()) then
        return false
    end
    FarmDashboardVehicleShopGuard._installed = true
    local cp = false
    local dc = rawget(_G, "FarmDashboardDataCollector")
    if dc and dc.isCourseplayLoaded then
        local ok, v = pcall(function() return dc:isCourseplayLoaded() end)
        if ok then cp = v == true end
    end
    Logging.info(
        "[FarmDash] Vehicle spawn guard: passive pending poll (no vehicleSystem hooks) courseplay=%s",
        tostring(cp)
    )
    return true
end

function FarmDashboardVehicleShopGuard.install()
    markInstalled()
end

function FarmDashboardVehicleShopGuard.onMissionLoaded()
    FarmDashboardVehicleShopGuard._installed = false
    markInstalled()
end

function FarmDashboardVehicleShopGuard.tryInstall()
    markInstalled()
end
