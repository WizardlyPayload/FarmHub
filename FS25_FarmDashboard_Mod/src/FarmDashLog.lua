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

--- Always visible (diagnostics off). Identical messages are suppressed for 60s of g_time.
FarmDashLog._errLast = FarmDashLog._errLast or {}

function FarmDashLog.error(fmt, ...)
    local msg
    if select("#", ...) > 0 and type(fmt) == "string" then
        local ok, formatted = pcall(string.format, fmt, ...)
        msg = ok and formatted or tostring(fmt)
    else
        msg = tostring(fmt)
    end
    local now = (type(_G.g_time) == "number") and _G.g_time or 0
    local prev = FarmDashLog._errLast[msg]
    if type(prev) == "number" and (now - prev) < 60000 and now >= prev then
        return
    end
    FarmDashLog._errLast[msg] = now
    Logging.warning("[FarmDash] " .. msg)
end

--- Per-frame collector / cycle trace (diagnostics only). Prefix [trace] for log filtering.
function FarmDashLog.trace(fmt, ...)
    if not FarmDashLog.isVerbose() then return end
    if select("#", ...) > 0 and type(fmt) == "string" then
        Logging.info("[FarmDash][trace] " .. string.format(fmt, ...))
    else
        Logging.info("[FarmDash][trace] " .. tostring(fmt))
    end
end

--- Always logged (not gated by diagnostics). MP clients never run collectors.
function FarmDashLog.warnNoAuthorityTrace()
    Logging.warning(
        "[FarmDash] Diagnostics enabled on multiplayer CLIENT — collector trace only runs on single-player, host, or dedicated server. Check the server log.txt for [FarmDash][trace] lines."
    )
end
