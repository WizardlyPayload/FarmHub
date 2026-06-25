// Shared live-export freshness for navbar badge + merge (per server/save slot).

/** No new mod export within this window → treat as snapshot/XML for the active save. */
const LUA_EXPORT_STALE_MS = 90_000;

function isLuaExportStale(lastLuaReceivedAt, nowMs = Date.now()) {
    if (!lastLuaReceivedAt) return true;
    const parsed = Date.parse(String(lastLuaReceivedAt));
    if (Number.isNaN(parsed)) return true;
    return nowMs - parsed > LUA_EXPORT_STALE_MS;
}

module.exports = {
    LUA_EXPORT_STALE_MS,
    isLuaExportStale,
};
