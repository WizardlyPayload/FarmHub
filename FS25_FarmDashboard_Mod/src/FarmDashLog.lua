-- FS25 FarmDashboard | FarmDashLog.lua | v1.0.0
-- ModHub log hygiene: normal gameplay stays free of warnings/errors.
-- Verbose / diagnostic lines go through dev* helpers (FarmDashDiagnostics.enabled).

FarmDashLog = {}

function FarmDashLog.isVerbose()
    local D = rawget(_G, "FarmDashDiagnostics")
    return D and D.enabled == true
end

function FarmDashLog.dev(fmt, ...)
    if not FarmDashLog.isVerbose() then return end
    if select("#", ...) > 0 and type(fmt) == "string" then
        Logging.info("[FarmDash] " .. string.format(fmt, ...))
    else
        Logging.info("[FarmDash] " .. tostring(fmt))
    end
end

function FarmDashLog.devWarn(fmt, ...)
    if not FarmDashLog.isVerbose() then return end
    if select("#", ...) > 0 and type(fmt) == "string" then
        Logging.warning("[FarmDash] " .. string.format(fmt, ...))
    else
        Logging.warning("[FarmDash] " .. tostring(fmt))
    end
end
