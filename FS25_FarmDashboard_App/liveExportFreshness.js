// Shared live-export freshness for navbar badge + merge (per server/save slot).

/** Minimum stale window (local SP with fast file watch). */
const LUA_EXPORT_STALE_MS = 90_000;
/** Extra slack after one FTP poll interval so dedicated servers are not marked stale between polls. */
const LUA_EXPORT_STALE_BUFFER_MS = 45_000;

function resolveLuaExportStaleMs(ftpIntervalMinutes = 1) {
    const mins = Math.min(25, Math.max(1, parseInt(ftpIntervalMinutes, 10) || 1));
    const pollMs = mins * 60_000;
    return Math.max(LUA_EXPORT_STALE_MS, pollMs + LUA_EXPORT_STALE_BUFFER_MS);
}

function isLuaExportStale(lastLuaReceivedAt, nowMs = Date.now(), staleMs = LUA_EXPORT_STALE_MS) {
    if (!lastLuaReceivedAt) return true;
    const parsed = Date.parse(String(lastLuaReceivedAt));
    if (Number.isNaN(parsed)) return true;
    const windowMs = Number(staleMs);
    const limit = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : LUA_EXPORT_STALE_MS;
    return nowMs - parsed > limit;
}

module.exports = {
    LUA_EXPORT_STALE_MS,
    LUA_EXPORT_STALE_BUFFER_MS,
    resolveLuaExportStaleMs,
    isLuaExportStale,
};
