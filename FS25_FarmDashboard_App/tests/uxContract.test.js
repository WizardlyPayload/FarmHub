const {
    ERROR_CODES,
    UI_STATES,
    SETUP_STEP_STATES,
    shouldAutoRetry,
    nextRetryDelayMs,
    classifyHttpStatus,
    classifyRawError,
    createUxEventLog,
    configCompleteness,
    lanRiskProfile,
    applyFreshnessMeta,
    buildSetupStatus,
    buildModuleUiState,
    normalizeSetupStepState,
    MAX_UX_EVENTS,
} = require("../uxContract.cjs");
const classify = require("../web/assests/js/ux-classify.js");

describe("uxContract", () => {
    test("retry policy only covers recoverable network/offline", () => {
        expect(shouldAutoRetry(ERROR_CODES.E_SERVER_OFFLINE)).toBe(true);
        expect(shouldAutoRetry(ERROR_CODES.E_NETWORK)).toBe(true);
        expect(shouldAutoRetry(ERROR_CODES.E_AUTH_MISSING)).toBe(false);
        expect(shouldAutoRetry(ERROR_CODES.E_INVALID_TOKEN)).toBe(false);
        expect(shouldAutoRetry(ERROR_CODES.E_LAN_BLOCKED)).toBe(false);
    });

    test("retry delay grows with jitter but stays bounded", () => {
        const d0 = nextRetryDelayMs(0, () => 0);
        const d2 = nextRetryDelayMs(2, () => 1);
        expect(d0).toBeGreaterThanOrEqual(400);
        expect(d2).toBeLessThanOrEqual(2500 + 2500 * 0.25);
        expect(d2).toBeGreaterThan(d0);
    });

    test("classifies HTTP and raw errors into taxonomy", () => {
        expect(classifyHttpStatus(401)).toBe(ERROR_CODES.E_AUTH_MISSING);
        expect(classifyHttpStatus(500)).toBe(ERROR_CODES.E_SERVER_OFFLINE);
        expect(classifyRawError("Invalid setup token")).toBe(ERROR_CODES.E_INVALID_TOKEN);
        expect(classifyRawError("ECONNREFUSED")).toBe(ERROR_CODES.E_SERVER_OFFLINE);
        expect(classifyRawError("EACCES permission denied")).toBe(ERROR_CODES.E_PERMISSION_DENIED);
        expect(classifyRawError("ENOENT save folder")).toBe(ERROR_CODES.E_PATH_DENIED);
    });

    test("event log keeps last 5", () => {
        const log = createUxEventLog();
        for (let i = 0; i < 8; i += 1) {
            log.push({ code: "E_NETWORK", message: String(i), source: "merge" });
        }
        expect(log.list()).toHaveLength(MAX_UX_EVENTS);
        expect(log.list()[0].message).toBe("7");
    });

    test("config completeness and LAN risk badges", () => {
        expect(configCompleteness({})).toBe(0);
        expect(configCompleteness({ isConfigured: true, servers: [{ name: "A", mode: "local", localSubFolder: "savegame1" }] })).toBe(1);
        expect(lanRiskProfile({ lanAccessEnabled: false }).id).toBe("local");
        expect(lanRiskProfile({ lanAccessEnabled: true, lanAuthOptional: true }).id).toBe("exposed-open");
        expect(lanRiskProfile({ lanAccessEnabled: true, lanAuthOptional: false }).id).toBe("exposed-auth");
    });

    test("freshness meta marks cache fallback as stale never live", () => {
        const out = applyFreshnessMeta(
            { dataSource: "merged", luaAvailable: false, dataTimestamps: {} },
            { cacheUsedDueToFailure: true, lastLuaAt: null, nowIso: "2026-09-03T10:00:00.000Z" }
        );
        expect(out.dataTimestamps.isStale).toBe(true);
        expect(out.dataTimestamps.cacheUsedDueToFailure).toBe(true);
        expect(out.dataTimestamps.confidence).toBe("cache");
        expect(out.dataTimestamps.staleReason).toBe(ERROR_CODES.E_CACHE_FALLBACK);
        expect(out.dataTimestamps.fetchedAt).toBeTruthy();
    });

    test("setup status gates fresh install vs ready", () => {
        const fresh = buildSetupStatus({ config: {}, httpListening: true, setupTokenValid: true });
        expect(fresh.status).toBe("needs-setup");
        expect(fresh.lastErrorCode).toBe(ERROR_CODES.E_CONFIG_INCOMPLETE);
        expect(fresh.nextAction).toBe("add_server");
        expect(fresh.steps).toHaveLength(4);

        const ready = buildSetupStatus({
            config: {
                isConfigured: true,
                servers: [{ id: "s1", name: "Local", mode: "local", localSubFolder: "savegame1" }],
            },
            httpListening: true,
            hasMergedData: true,
            luaFresh: true,
            xmlAvailable: true,
            setupTokenValid: true,
            modVersionCheck: { status: "ok" },
        });
        expect(ready.status).toBe("ready");
        expect(ready.lastErrorCode).toBeNull();
        expect(ready.configCompleteness).toBe(1);
    });

    test("invalid token is a user-action nextAction", () => {
        const out = buildSetupStatus({
            config: {
                isConfigured: true,
                servers: [{ id: "s1", name: "Local", mode: "local", localSubFolder: "savegame1" }],
            },
            setupTokenValid: false,
            httpListening: true,
        });
        expect(out.lastErrorCode).toBe(ERROR_CODES.E_INVALID_TOKEN);
        expect(out.nextAction).toBe("reset_token");
    });

    test("pending is a first-class UI state and unknown setup steps stay pending", () => {
        expect(UI_STATES).toEqual(expect.arrayContaining(["pending", "loading"]));
        expect(SETUP_STEP_STATES).toEqual(["success", "error", "pending"]);
        expect(normalizeSetupStepState("pending")).toBe("pending");
        expect(normalizeSetupStepState("success")).toBe("success");
        expect(normalizeSetupStepState("error")).toBe("error");
        expect(normalizeSetupStepState("loading")).toBe("pending");
        expect(normalizeSetupStepState("nope")).toBe("pending");
        expect(buildModuleUiState({ state: "pending" }).state).toBe("pending");
        expect(buildModuleUiState({ state: "nope" }).state).toBe("loading");
    });

    test("fresh install vs partial config vs ready step states", () => {
        const fresh = buildSetupStatus({ config: {}, httpListening: true, setupTokenValid: true });
        const byId = Object.fromEntries(fresh.steps.map((s) => [s.id, s]));
        expect(byId.detect.state).toBe("error");
        expect(byId.detect.errorCode).toBe(ERROR_CODES.E_CONFIG_INCOMPLETE);
        expect(byId.connectivity.state).toBe("pending");
        expect(byId.auth.state).toBe("success");
        expect(byId.service.state).toBe("pending");
        expect(fresh.steps.every((s) => s.state !== "loading")).toBe(true);

        const partial = buildSetupStatus({
            config: { servers: [{ name: "Draft", mode: "ftp" }] },
            httpListening: true,
            setupTokenValid: true,
        });
        expect(partial.status).toBe("incomplete");
        expect(partial.steps.find((s) => s.id === "detect").state).toBe("pending");
        expect(partial.steps.every((s) => s.state !== "loading")).toBe(true);

        const ready = buildSetupStatus({
            config: {
                isConfigured: true,
                servers: [{ id: "s1", name: "Local", mode: "local", localSubFolder: "savegame1" }],
            },
            httpListening: true,
            hasMergedData: true,
            luaFresh: true,
            xmlAvailable: true,
            setupTokenValid: true,
            modVersionCheck: { status: "ok" },
        });
        expect(ready.steps.map((s) => s.state)).toEqual(["success", "success", "success", "success"]);
    });

    test("contract classify helpers match ux-classify.js", () => {
        expect(classifyRawError("Invalid setup token")).toBe(classify.classifyRawError("Invalid setup token"));
        expect(classifyHttpStatus(403)).toBe(classify.classifyHttpStatus(403));
        expect(classifyRawError("lua export stale")).toBe(ERROR_CODES.E_LUA_STALE);
        expect(classifyRawError("E_LAN_TIMEOUT")).toBe(ERROR_CODES.E_LAN_TIMEOUT);
        expect(classifyRawError("Setup is only available on the PC")).toBe(ERROR_CODES.E_SETUP_LOCAL_ONLY);
        expect(ERROR_CODES.E_LAN_TIMEOUT).toBe("E_LAN_TIMEOUT");
        expect(ERROR_CODES.E_SETUP_LOCAL_ONLY).toBe("E_SETUP_LOCAL_ONLY");
    });
});
