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
    selectStatusSource,
    sourceSetupEvidence,
    publicStatusForSource,
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

    test("selected source B does not receive source A data", () => {
        const states = {
            "source-a": {
                mergedData: {
                    mapTitle: "MAP-A-PRIVATE-FIXTURE",
                    fields: [{ id: 1 }, { id: 2 }],
                    vehicles: [],
                    luaAvailable: true,
                    xmlAvailable: true,
                    exportGeneration: 2,
                },
                lastLuaReceivedAt: Date.now(),
                exportIdentity: { careerId: "career-a" },
            },
            "source-b": {
                mergedData: null,
                identityProvision: "provisioning-required",
                exportIdentity: { careerId: "career-b", publicationSequence: 9, exportGeneration: 2 },
            },
        };
        const servers = [{ id: "source-a", mode: "local" }, { id: "source-b", mode: "ftp" }];
        const selected = selectStatusSource({ selectedId: "source-b", servers, states });
        expect(selected.id).toBe("source-b");
        expect(selected.state.mergedData).toBeNull();
        const projected = [];
        const pub = publicStatusForSource(
            { status: "online", service: "fs25-farm-dashboard-rf", productLine: "rf", port: 12345, appVersion: "source-fixture" },
            selected,
            (ident) => {
                projected.push(ident.careerId);
                return { careerId: ident.careerId, publicationSequence: ident.publicationSequence, exportGeneration: ident.exportGeneration, freshness: null, persistence: "saved", replica: false, authoritative: true, readiness: "unconfirmed" };
            }
        );
        expect(projected).toEqual(["career-b"]);
        expect(pub.mapTitle).toBeUndefined();
        expect(pub.fieldCount).toBeUndefined();
        expect(pub.hasData).toBe(false);
        expect(pub.careerId).toBe("career-b");
        expect(pub.status).toBe("online");
        expect(JSON.stringify(pub)).not.toContain("MAP-A-PRIVATE-FIXTURE");
        expect(JSON.stringify(pub)).not.toContain("savegame");
        expect(JSON.stringify(pub)).not.toContain("ftpPass");
        const evidence = sourceSetupEvidence(selected.state, { nowMs: Date.now(), staleMs: 60000 });
        const setup = buildSetupStatus({
            config: { isConfigured: true, servers },
            httpListening: true,
            setupTokenValid: true,
            hasMergedData: evidence.hasMergedData,
            luaFresh: evidence.luaFresh,
            xmlAvailable: evidence.xmlAvailable,
            identityProvision: evidence.identityProvision,
            sourceId: selected.id,
            emptyCommitted: evidence.emptyCommitted,
        });
        expect(setup.sourceId).toBe("source-b");
        expect(setup.hasMergedData).toBeUndefined();
        expect(setup.status).not.toBe("ready");
        expect(setup.identityProvision).toBe("provisioning-required");
        expect(setup.nextStep).toContain("Automatic FTP creation is not available");
        expect(setup.nextStep).not.toContain("MAP-A");
    });

    test("selected A, empty export, startup, stale, recovery, and provisioned FTP stay on one source", () => {
        const now = Date.now();
        const fresh = new Date(now).toISOString();
        const stale = new Date(now - 1000000).toISOString();
        const a = {
            mergedData: { mapTitle: "MAP-A-PRIVATE-FIXTURE", fields: [{ id: 1 }, { id: 2 }], vehicles: [], luaAvailable: true, xmlAvailable: true, exportGeneration: 2, modVersionCheck: { status: "ok" } },
            lastLuaReceivedAt: fresh,
            identityProvision: "proposed",
            exportIdentity: { careerId: "career-a" },
        };
        const states = { "source-a": a, "source-b": { mergedData: null, identityProvision: "provisioning-required" } };
        const servers = [{ id: "source-a", mode: "local" }, { id: "source-b", mode: "ftp" }];
        const selectedA = selectStatusSource({ selectedId: "source-a", servers, states });
        const pubA = publicStatusForSource({ status: "online", service: "s", productLine: "rf", port: 1, appVersion: "v" }, selectedA, (ident) => ({ careerId: ident.careerId }));
        expect(pubA.mapTitle).toBe("MAP-A-PRIVATE-FIXTURE");
        expect(pubA.fieldCount).toBe(2);
        expect(pubA.careerId).toBe("career-a");
        const ready = buildSetupStatus({
            config: { isConfigured: true, servers },
            httpListening: true,
            setupTokenValid: true,
            ...sourceSetupEvidence(selectedA.state, { nowMs: now, staleMs: 60000 }),
            sourceId: selectedA.id,
        });
        expect(ready.status).toBe("ready");
        expect(ready.sourceId).toBe("source-a");

        const missing = selectStatusSource({ selectedId: "source-c", servers, states });
        expect(missing.id).toBe("source-c");
        expect(missing.state).toBeNull();
        expect(publicStatusForSource({ status: "online", service: "s", productLine: "rf", port: 1, appVersion: "v" }, missing, () => ({ careerId: "nope" })).mapTitle).toBeUndefined();

        const stopped = selectStatusSource({ selectedId: "source-a", servers, states: { "source-a": { ...a, active: false } } });
        expect(stopped.state).toBeNull();

        const fallback = selectStatusSource({ selectedId: "", servers, states });
        expect(fallback.id).toBe("source-a");
        expect(fallback.explicit).toBe(false);

        const emptyState = {
            mergedData: { mapTitle: "EMPTY", fields: [], vehicles: [], luaAvailable: true, xmlAvailable: true, exportGeneration: 4 },
            lastLuaReceivedAt: fresh,
            identityProvision: "adopted-readonly",
            exportIdentity: { careerId: "career-empty" },
        };
        const emptyPub = publicStatusForSource({ status: "online", service: "s", productLine: "rf", port: 1, appVersion: "v" }, { id: "source-a", state: emptyState }, (ident) => ({ careerId: ident.careerId }));
        expect(emptyPub.fieldCount).toBe(0);
        expect(emptyPub.hasData).toBe(true);
        expect(emptyPub.careerId).toBe("career-empty");
        const emptySetup = buildSetupStatus({
            config: { isConfigured: true, servers },
            httpListening: true,
            setupTokenValid: true,
            ...sourceSetupEvidence(emptyState, { nowMs: now, staleMs: 60000 }),
            sourceId: "source-a",
        });
        expect(emptySetup.status).toBe("ready");
        expect(emptySetup.emptyCommitted).toBe(true);

        const startup = buildSetupStatus({
            config: { isConfigured: true, servers },
            httpListening: true,
            hasMergedData: true,
            luaFresh: true,
            xmlAvailable: true,
            setupTokenValid: true,
            startupOnly: true,
            sourceId: "source-a",
        });
        expect(startup.status).not.toBe("ready");
        expect(startup.nextStep).toContain("startup export");

        const held = sourceSetupEvidence({
            mergedData: { fields: [{ id: 1 }], vehicles: [], luaAvailable: true, exportGeneration: 3 },
            lastLuaReceivedAt: stale,
            identityProvision: "proposed",
        }, { nowMs: now, staleMs: 1000 });
        expect(held.luaFresh).toBe(false);
        const staleSetup = buildSetupStatus({
            config: { isConfigured: true, servers },
            httpListening: true,
            setupTokenValid: true,
            ...held,
            sourceId: "source-a",
        });
        expect(staleSetup.status).toBe("degraded");

        const recovery = buildSetupStatus({
            config: { isConfigured: true, servers },
            httpListening: true,
            hasMergedData: false,
            setupTokenValid: true,
            identityProvision: "recovery-needed",
            sourceId: "source-b",
        });
        expect(recovery.status).not.toBe("ready");
        expect(recovery.nextStep).toContain("left unchanged");

        const waiting = buildSetupStatus({
            config: { isConfigured: true, servers },
            httpListening: true,
            setupTokenValid: true,
            identityProvision: "waiting",
            sourceId: "source-b",
        });
        expect(waiting.status).not.toBe("ready");
        expect(waiting.nextStep).toContain("Waiting for a dashboard identity");

        const provisioned = buildSetupStatus({
            config: { isConfigured: true, servers: [{ id: "source-b", mode: "ftp", ftpHost: "h", ftpUser: "u", ftpPass: "secret-pass" }] },
            httpListening: true,
            hasMergedData: true,
            luaFresh: true,
            xmlAvailable: true,
            setupTokenValid: true,
            identityProvision: "remote-present-not-replaced",
            sourceId: "source-b",
            modVersionCheck: { status: "ok" },
        });
        expect(provisioned.status).toBe("ready");
        expect(JSON.stringify(provisioned)).not.toContain("secret-pass");
        expect(JSON.stringify(provisioned)).not.toContain("ftpHost");
    });

    test("blank selection skips stopped and disabled sources and steps match the blocker", () => {
        const now = Date.now();
        const fresh = new Date(now).toISOString();
        const mapA = {
            active: false,
            mergedData: {
                mapTitle: "MAP-A-PRIVATE-FIXTURE",
                fields: [{ id: 1 }, { id: 2 }],
                vehicles: [],
                luaAvailable: true,
                xmlAvailable: true,
                exportGeneration: 2,
            },
            lastLuaReceivedAt: fresh,
            identityProvision: "proposed",
            exportIdentity: { careerId: "career-a" },
        };
        const liveB = {
            active: true,
            mergedData: null,
            identityProvision: "provisioning-required",
            exportIdentity: { careerId: "career-b" },
        };
        const servers = [
            { id: "source-a", enabled: true, mode: "local" },
            { id: "source-b", enabled: true, mode: "ftp" },
        ];
        const base = { status: "online", service: "fs25-farm-dashboard-rf", productLine: "rf", port: 12345, appVersion: "source-fixture" };
        const stoppedFallback = selectStatusSource({ selectedId: "", servers, states: { "source-a": mapA, "source-b": liveB } });
        expect(stoppedFallback.id).toBe("source-b");
        expect(stoppedFallback.explicit).toBe(false);
        const stoppedPub = publicStatusForSource(base, stoppedFallback, (ident) => ({ careerId: ident.careerId }));
        expect(stoppedPub.status).toBe("online");
        expect(stoppedPub.hasData).toBe(false);
        expect(stoppedPub.careerId).toBe("career-b");
        expect(JSON.stringify(stoppedPub)).not.toContain("MAP-A-PRIVATE-FIXTURE");
        const stoppedSetup = buildSetupStatus({
            config: { isConfigured: true, servers },
            httpListening: true,
            setupTokenValid: true,
            ...sourceSetupEvidence(stoppedFallback.state, { nowMs: now, staleMs: 60000 }),
            sourceId: stoppedFallback.id,
        });
        expect(stoppedSetup.sourceId).toBe("source-b");
        expect(stoppedSetup.status).not.toBe("ready");
        expect(stoppedSetup.nextStep).toContain("Automatic FTP creation is not available");

        const disabled = selectStatusSource({
            selectedId: "",
            servers: [{ id: "source-a", enabled: false }, { id: "source-b", enabled: true }],
            states: { "source-a": { ...mapA, active: true }, "source-b": liveB },
        });
        expect(disabled.id).toBe("source-b");
        expect(JSON.stringify(publicStatusForSource(base, disabled, (ident) => ({ careerId: ident.careerId }))).includes("MAP-A-PRIVATE-FIXTURE")).toBe(false);

        const none = selectStatusSource({
            selectedId: "",
            servers,
            states: {
                "source-a": mapA,
                "source-b": { ...liveB, active: false, mergedData: { mapTitle: "MAP-B", fields: [{ id: 1 }], vehicles: [] } },
            },
        });
        expect(none.id).toBe("");
        expect(none.state).toBeNull();
        const nonePub = publicStatusForSource(base, none, () => ({ careerId: "nope" }));
        expect(nonePub.status).toBe("online");
        expect(nonePub.mapTitle).toBeUndefined();
        expect(nonePub.hasData).toBeUndefined();

        const explicitStopped = selectStatusSource({
            selectedId: "source-a",
            servers,
            states: { "source-a": mapA, "source-b": { ...liveB, active: true, mergedData: { mapTitle: "MAP-B", fields: [], vehicles: [] } } },
        });
        expect(explicitStopped.id).toBe("source-a");
        expect(explicitStopped.state).toBeNull();
        expect(publicStatusForSource(base, explicitStopped, () => ({ careerId: "career-b" })).mapTitle).toBeUndefined();

        const rawSkipped = selectStatusSource({
            selectedId: "",
            servers: [{ id: "source-a", enabled: false }],
            states: { "source-a": { ...mapA, active: true }, "source-c": { ...liveB, active: true, mergedData: { mapTitle: "MAP-C", fields: [{ id: 1 }], vehicles: [], luaAvailable: true, exportGeneration: 2 } } },
        });
        expect(rawSkipped.id).toBe("source-c");

        const readyInput = {
            config: { isConfigured: true, servers },
            httpListening: true,
            hasMergedData: true,
            luaFresh: true,
            xmlAvailable: true,
            setupTokenValid: true,
            modVersionCheck: { status: "ok" },
            sourceId: "source-a",
        };
        const serviceOf = (out) => out.steps.find((step) => step.id === "service");
        const stepOf = (out, id) => out.steps.find((step) => step.id === id);

        const startup = buildSetupStatus({ ...readyInput, startupOnly: true, identityProvision: "proposed" });
        expect(startup.status).toBe("incomplete");
        expect(startup.lastErrorCode).toBe(ERROR_CODES.E_LUA_STALE);
        expect(serviceOf(startup).state).not.toBe("success");
        expect(stepOf(startup, "connectivity").state).toBe("success");
        expect(startup.nextStep).toContain("startup export");

        const recovery = buildSetupStatus({ ...readyInput, identityProvision: "recovery-needed" });
        expect(recovery.status).toBe("degraded");
        expect(recovery.lastErrorCode).toBe("E_IDENTITY_RECOVERY");
        expect(serviceOf(recovery).state).toBe("error");
        expect(serviceOf(recovery).errorCode).toBe("E_IDENTITY_RECOVERY");
        expect(stepOf(recovery, "connectivity").state).toBe("success");

        const waiting = buildSetupStatus({ ...readyInput, identityProvision: "waiting" });
        expect(waiting.status).not.toBe("ready");
        expect(serviceOf(waiting).state).not.toBe("success");

        const provisioning = buildSetupStatus({ ...readyInput, identityProvision: "provisioning-required" });
        expect(provisioning.status).not.toBe("ready");
        expect(serviceOf(provisioning).state).not.toBe("success");
        expect(provisioning.nextStep).toContain("Automatic FTP creation is not available");

        const token = buildSetupStatus({ ...readyInput, setupTokenValid: false, identityProvision: "recovery-needed" });
        expect(token.lastErrorCode).toBe(ERROR_CODES.E_INVALID_TOKEN);
        expect(token.nextAction).toBe("reset_token");
        expect(stepOf(token, "auth").state).toBe("error");
        expect(stepOf(token, "auth").errorCode).toBe(ERROR_CODES.E_INVALID_TOKEN);
        expect(serviceOf(token).state).not.toBe("success");
        expect(token.nextStep).toBeNull();
        expect(token.identityProvision).toBe("recovery-needed");

        const denied = buildSetupStatus({ ...readyInput, pathDenied: true, identityProvision: "provisioning-required" });
        expect(denied.lastErrorCode).toBe(ERROR_CODES.E_PATH_DENIED);
        expect(denied.nextAction).toBe("verify_save_slot");
        expect(serviceOf(denied).state).toBe("error");
        expect(serviceOf(denied).errorCode).toBe(ERROR_CODES.E_PATH_DENIED);
        expect(denied.nextStep).toBeNull();
        expect(denied.identityProvision).toBe("provisioning-required");

        const offline = buildSetupStatus({ ...readyInput, httpListening: false, identityProvision: "provisioning-required" });
        expect(offline.lastErrorCode).toBe(ERROR_CODES.E_SERVER_OFFLINE);
        expect(offline.nextAction).toBe("start_game");
        expect(stepOf(offline, "connectivity").state).toBe("error");
        expect(stepOf(offline, "connectivity").errorCode).toBe(ERROR_CODES.E_SERVER_OFFLINE);
        expect(serviceOf(offline).state).not.toBe("success");
        expect(offline.nextStep).toBeNull();
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
