// Shared UX contract: error codes, setup status, retry, freshness.
// Keep in sync with docs/UX-STATE-CONTRACT.md and NEW APP/src/lib/ux-state.ts.

const { isLuaExportStale, LUA_EXPORT_STALE_MS } = require("./liveExportFreshness");
const {
    ERROR_CODES: CLASSIFY_ERROR_CODES,
    NEXT_ACTION: CLASSIFY_NEXT_ACTION,
    classifyHttpStatus: classifyHttpStatusShared,
    classifyRawError: classifyRawErrorShared,
    nextActionForCode: nextActionForCodeShared,
} = require("./web/assests/js/ux-classify.js");

const UI_STATES = Object.freeze(["loading", "error", "empty", "success", "stale", "pending"]);
const SETUP_STEP_STATES = Object.freeze(["success", "error", "pending"]);

const ERROR_CODES = Object.freeze({ ...CLASSIFY_ERROR_CODES });

const ERROR_CLASS = Object.freeze({
    E_CONFIG_INCOMPLETE: "blocking",
    E_AUTH_MISSING: "user-action",
    E_INVALID_TOKEN: "user-action",
    E_LAN_BLOCKED: "user-action",
    E_LAN_TIMEOUT: "user-action",
    E_SETUP_LOCAL_ONLY: "user-action",
    E_SERVER_OFFLINE: "recoverable",
    E_LUA_STALE: "recoverable",
    E_MOD_MISSING: "user-action",
    E_MOD_OUTDATED: "user-action",
    E_PATH_DENIED: "user-action",
    E_PERMISSION_DENIED: "user-action",
    E_CACHE_FALLBACK: "recoverable",
    E_NETWORK: "recoverable",
    E_SAVE_FAILED: "blocking",
});

const NEXT_ACTION = Object.freeze({ ...CLASSIFY_NEXT_ACTION });

const RETRY_POLICY = Object.freeze({
    maxAttempts: 3,
    baseDelayMs: 400,
    maxDelayMs: 2500,
    jitterRatio: 0.25,
    retryableCodes: Object.freeze(["E_SERVER_OFFLINE", "E_NETWORK"]),
});

const MAX_UX_EVENTS = 5;

function errorClass(code) {
    return ERROR_CLASS[code] || "blocking";
}

function nextActionForCode(code) {
    return nextActionForCodeShared(code);
}

function shouldAutoRetry(code) {
    return RETRY_POLICY.retryableCodes.includes(String(code || ""));
}

function nextRetryDelayMs(attempt, random = Math.random) {
    const n = Math.max(0, Number(attempt) || 0);
    const exp = Math.min(RETRY_POLICY.maxDelayMs, RETRY_POLICY.baseDelayMs * 2 ** n);
    const jitter = exp * RETRY_POLICY.jitterRatio * Number(random());
    return Math.round(exp + jitter);
}

function classifyHttpStatus(status) {
    return classifyHttpStatusShared(status);
}

function classifyRawError(rawMsg) {
    return classifyRawErrorShared(rawMsg);
}

function createUxEventLog(max = MAX_UX_EVENTS) {
    const events = [];
    return {
        push(entry) {
            const row = {
                at: entry?.at || new Date().toISOString(),
                code: entry?.code || ERROR_CODES.E_NETWORK,
                message: String(entry?.message || "").slice(0, 240),
                source: entry?.source || "setup",
            };
            events.unshift(row);
            while (events.length > max) events.pop();
            return row;
        },
        list() {
            return events.slice();
        },
        clear() {
            events.length = 0;
        },
    };
}

function configCompleteness(config) {
    const servers = Array.isArray(config?.servers) ? config.servers : [];
    if (!config?.isConfigured) return servers.length ? 0.45 : 0;
    if (!servers.length) return 0.35;
    const usable = servers.filter((s) => {
        if (!s) return false;
        if (s.mode === "ftp") return !!(s.ftpHost && s.ftpUser && s.ftpPass);
        return !!(s.localSubFolder || s.localPath || s.name);
    });
    if (!usable.length) return 0.5;
    return 1;
}

function lanRiskProfile(lan) {
    if (!lan?.lanAccessEnabled) {
        return { id: "local", labelKey: "ux.lan.localOnly", tone: "accent", recommended: true };
    }
    if (lan.lanAuthOptional) {
        return { id: "exposed-open", labelKey: "ux.lan.exposedHigh", tone: "danger", recommended: false };
    }
    return { id: "exposed-auth", labelKey: "ux.lan.exposedAuth", tone: "warn", recommended: false };
}

function applyFreshnessMeta(obj, options = {}) {
    if (!obj || typeof obj !== "object") return obj;
    const ts = { ...(obj.dataTimestamps || {}) };
    const lastLuaAt = options.lastLuaAt || ts.lastLuaReceivedAt || null;
    const lastXmlAt = options.lastXmlAt || ts.lastXmlReceivedAt || null;
    const nowIso = options.nowIso || new Date().toISOString();
    const staleMs = Number(options.staleMs || ts.luaExportStaleMs) || LUA_EXPORT_STALE_MS;
    const cacheUsed = !!(
        options.cacheUsedDueToFailure ||
        ts.cacheUsedDueToFailure ||
        ts.loadedFromDiskCacheAt
    );
    const held = !!(
        ts.heldFromSnapshotAt ||
        ts.mergeHeldStaleAt ||
        ts.liveExportStaleAt ||
        ts.liveSectionsHeldAt
    );
    const luaStale = isLuaExportStale(lastLuaAt, options.nowMs || Date.now(), staleMs);
    const xmlOnly = obj.dataSource === "xml_only" || obj.luaAvailable === false;
    const isStale = !!(cacheUsed || held || luaStale || xmlOnly);
    let staleReason = null;
    if (cacheUsed) staleReason = ERROR_CODES.E_CACHE_FALLBACK;
    else if (isStale) staleReason = ERROR_CODES.E_LUA_STALE;
    let confidence = "live";
    if (cacheUsed) confidence = "cache";
    else if (isStale) confidence = "held";
    const source =
        options.source ||
        (cacheUsed ? "cache" : obj.dataSource === "lua_only" ? "lua" : obj.dataSource === "xml_only" ? "xml" : obj.dataSource || ts.source || "unknown");

    ts.lastLuaReceivedAt = lastLuaAt || ts.lastLuaReceivedAt || null;
    ts.lastXmlReceivedAt = lastXmlAt || ts.lastXmlReceivedAt || null;
    ts.mergeComputedAt = ts.mergeComputedAt || nowIso;
    ts.fetchedAt = ts.mergeComputedAt || nowIso;
    ts.source = source;
    ts.isStale = isStale;
    ts.staleReason = isStale ? staleReason : null;
    ts.cacheUsedDueToFailure = cacheUsed;
    ts.confidence = confidence;
    if (options.collectionHealth) ts.collectionHealth = options.collectionHealth;
    else if (obj.collectionHealth && !ts.collectionHealth) ts.collectionHealth = obj.collectionHealth;

    return { ...obj, dataTimestamps: ts };
}

function normalizeSetupStepState(state) {
    return SETUP_STEP_STATES.includes(state) ? state : "pending";
}

function buildModuleUiState(partial = {}) {
    const state = UI_STATES.includes(partial.state) ? partial.state : "loading";
    return {
        state,
        timestamp: partial.timestamp || new Date().toISOString(),
        errorCode: partial.errorCode || null,
        retryFn: null,
        lastUpdated: partial.lastUpdated || null,
        source: partial.source || "unknown",
        isStale: state === "stale" || !!partial.isStale,
        staleReason: partial.staleReason || null,
    };
}

function buildSetupStatus(input = {}) {
    const config = input.config || {};
    const completeness = configCompleteness(config);
    const hasServers = Array.isArray(config.servers) && config.servers.length > 0;
    const configured = !!config.isConfigured && hasServers;
    const httpUp = input.httpListening !== false;
    const hasMerged = !!input.hasMergedData;
    const luaFresh = input.luaFresh === true;
    const xmlOk = input.xmlAvailable === true;
    const tokenOk = input.setupTokenValid !== false;
    const lan = input.lan || {};
    const modCheck = input.modVersionCheck || {};
    const pathDenied = !!input.pathDenied;

    const steps = [
        {
            id: "detect",
            state: normalizeSetupStepState(configured ? "success" : hasServers ? "pending" : "error"),
            errorCode: configured ? null : ERROR_CODES.E_CONFIG_INCOMPLETE,
        },
        {
            id: "connectivity",
            state: normalizeSetupStepState(
                !httpUp ? "error" : hasMerged || xmlOk || luaFresh ? "success" : "pending"
            ),
            errorCode: !httpUp ? ERROR_CODES.E_SERVER_OFFLINE : null,
        },
        {
            id: "auth",
            state: normalizeSetupStepState(!tokenOk ? "error" : "success"),
            errorCode: tokenOk ? null : ERROR_CODES.E_INVALID_TOKEN,
        },
        {
            id: "service",
            state: normalizeSetupStepState(hasMerged && (luaFresh || xmlOk) ? "success" : "pending"),
            errorCode: pathDenied
                ? ERROR_CODES.E_PATH_DENIED
                : modCheck.status === "outdated"
                  ? ERROR_CODES.E_MOD_OUTDATED
                  : null,
        },
    ];

    let lastErrorCode = null;
    if (!configured) lastErrorCode = ERROR_CODES.E_CONFIG_INCOMPLETE;
    else if (!tokenOk) lastErrorCode = ERROR_CODES.E_INVALID_TOKEN;
    else if (pathDenied) lastErrorCode = ERROR_CODES.E_PATH_DENIED;
    else if (!httpUp) lastErrorCode = ERROR_CODES.E_SERVER_OFFLINE;
    else if (modCheck.status === "outdated") lastErrorCode = ERROR_CODES.E_MOD_OUTDATED;
    else if (configured && !hasMerged) lastErrorCode = ERROR_CODES.E_LUA_STALE;
    else if (hasMerged && !luaFresh) lastErrorCode = ERROR_CODES.E_LUA_STALE;

    let status = "ready";
    if (!configured) status = completeness > 0 ? "incomplete" : "needs-setup";
    else if (lastErrorCode && lastErrorCode !== ERROR_CODES.E_LUA_STALE) status = "degraded";
    else if (lastErrorCode === ERROR_CODES.E_LUA_STALE) status = hasMerged ? "degraded" : "incomplete";

    if (configured && hasMerged && tokenOk && httpUp && !pathDenied && modCheck.status !== "outdated") {
        status = luaFresh ? "ready" : "degraded";
        if (luaFresh) lastErrorCode = null;
    }

    return {
        status,
        lastErrorCode,
        nextAction: lastErrorCode ? nextActionForCode(lastErrorCode) : "none",
        configCompleteness: completeness,
        requiresRestart: !!input.requiresRestart,
        lanRisk: lanRiskProfile(lan),
        steps,
        recentEvents: Array.isArray(input.recentEvents) ? input.recentEvents.slice(0, MAX_UX_EVENTS) : [],
    };
}

module.exports = {
    UI_STATES,
    SETUP_STEP_STATES,
    ERROR_CODES,
    ERROR_CLASS,
    NEXT_ACTION,
    RETRY_POLICY,
    MAX_UX_EVENTS,
    errorClass,
    nextActionForCode,
    shouldAutoRetry,
    nextRetryDelayMs,
    classifyHttpStatus,
    classifyRawError,
    createUxEventLog,
    configCompleteness,
    lanRiskProfile,
    applyFreshnessMeta,
    buildModuleUiState,
    normalizeSetupStepState,
    buildSetupStatus,
};
