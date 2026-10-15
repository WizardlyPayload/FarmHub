"use strict";

/**
 * FARMHUB-20261006-PAIRING-REVIEW-132 (desktop side): the replica session pairing (and FTP / feed secrets) never
 * cross into the renderer. Every IPC channel and preload method is enumerated from production source; the
 * config-shaped ones are invoked as registered in main.js. Settings / setup saves of the redacted config keep the
 * exact stored secrets and replicaSources.xml; removing a linked row still revokes it.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const ts = require("../../NEW APP/node_modules/typescript");
const replicaRegistration = require("../replicaRegistration");
const pendingReplicaSession = require("../pendingReplicaSession.cjs");
const runtimeActivation = require("../runtimeActivation");
const { resolveServersForSave, configNeedsServerReboot } = require("../setupConfigMerge.cjs");

const mainPath = path.join(__dirname, "..", "main.js");
const preloadPath = path.join(__dirname, "..", "preload.js");
const mainSource = fs.readFileSync(mainPath, "utf8");
const mainAst = ts.createSourceFile(mainPath, mainSource, ts.ScriptTarget.Latest, true);

const PAIRING = "join-secret-token-132";
const FTP_PASS = "ftp-secret-value-132";
const FEED_CODE = "feed-secret-code-132";
const SECRETS = [PAIRING, FTP_PASS, FEED_CODE];

function registrationCall(node) {
    if (!ts.isExpressionStatement(node) || !ts.isCallExpression(node.expression)) return null;
    const call = node.expression;
    if (!ts.isIdentifier(call.expression)) return null;
    const fn = call.expression.text;
    if (fn !== "registerTrustedHandle" && fn !== "registerTrustedEvent") return null;
    const channel = call.arguments[0];
    if (!channel || !ts.isStringLiteral(channel)) return null;
    return { fn, channel: channel.text, text: node.getText(mainAst) };
}

const REGISTRATIONS = mainAst.statements.map(registrationCall).filter(Boolean);

/**
 * Every renderer-reachable main-process channel, classified. A new channel fails this suite until it is listed
 * here with how it treats config secrets.
 */
const CHANNELS = {
    // Config-shaped: must go through the shared redactor.
    "get-current-config": "redacted-config",
    // Pairing: renderer view without the session token.
    "get-pending-replica-session": "pending-view",
    "approve-pending-replica-session": "pending-outcome",
    "decline-pending-replica-session": "pending-outcome",
    "get-orphan-replica-recovery": "pending-view",
    "start-orphan-replica-challenge": "pending-outcome",
    "cancel-orphan-replica-challenge": "pending-outcome",
    "restore-orphan-replica": "pending-outcome",
    // Reads config but returns only save outcome / ids / names / mode checks.
    "save-settings": "save-outcome",
    "read-server-live-cache": "no-config",
    "get-field-exclusion-options": "no-config",
    // No server config at all.
    "export-mod-store-images": "no-config",
    "launch-dashboard": "no-config",
    "read-local-farmdash-data-json": "no-config",
    "get-lan-access-settings": "no-config",
    "save-lan-access-settings": "no-config",
    "get-setup-status": "no-config",
    "run-setup-handshake": "no-config",
    "restore-lan-defaults": "no-config",
    "get-desktop-app-version": "no-config",
    "check-desktop-app-updates": "no-config",
    "get-stored-locale": "no-config",
    "get-translations-json": "no-config",
    "get-ui-preferences": "no-config",
    "save-ui-preferences": "no-config",
    "set-simhub-live-context": "no-config",
    "get-mod-config": "no-config",
    "save-mod-config": "no-config",
    "scan-local-saves": "no-config",
    "open-setup": "event",
    "reset-settings": "event",
    "set-stored-locale": "event",
};

/** Production main.js pieces (functions, top-level consts and channel registrations) in one vm context. */
function loadMain({ functions = [], consts = [], channels = [] }, context) {
    const parts = [];
    for (const name of functions) {
        const node = mainAst.statements.find((s) => ts.isFunctionDeclaration(s) && s.name && s.name.text === name);
        if (!node) throw new Error("missing function " + name);
        parts.push(node.getText(mainAst));
    }
    for (const name of consts) {
        const node = mainAst.statements.find((s) => ts.isVariableStatement(s)
            && s.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name));
        if (!node) throw new Error("missing const " + name);
        parts.push(node.getText(mainAst).replace(/^const /, "var "));
    }
    for (const channel of channels) {
        const reg = REGISTRATIONS.find((r) => r.channel === channel);
        if (!reg) throw new Error("missing channel " + channel);
        parts.push(reg.text);
    }
    const handlers = {};
    const ctx = vm.createContext({
        console, JSON, Object, Array, String, Number, Set, Map, Error, Promise, path, fs,
        registerTrustedHandle: (channel, handler) => { handlers[channel] = handler; },
        registerTrustedEvent: (channel, handler) => { handlers[channel] = handler; },
        ...context,
    });
    vm.runInContext(parts.join("\n"), ctx);
    return { handlers, ctx };
}

function seedConfig(profile) {
    return {
        isConfigured: true,
        ftpPolling: { initialDelaySeconds: 0, intervalMinutes: 5, scheduleMode: "sync" },
        servers: [
            { id: "ftp-a", name: "Host", mode: "ftp", ftpHost: "h.example", ftpPort: 21, ftpUser: "u", ftpPass: FTP_PASS, ftpBasePath: "/p" },
            { id: "feed-a", name: "Feed", mode: "local", localPath: profile, localSubFolder: "savegame2", httpFeedHost: "f.example", httpFeedCode: FEED_CODE },
            {
                id: "mp-0a1b2c3d4e5f", name: "Linked", mode: "local",
                localPath: path.join(profile, "modSettings", "FS25_FarmDashboard"), localSubFolder: "savegame1",
                replicaRemoteSlot: "savegame1", replicaRegistration: { remoteSlot: "savegame1", sessionPairing: PAIRING },
            },
        ],
    };
}

function expectNoSecrets(value) {
    const text = JSON.stringify(value === undefined ? null : value);
    for (const secret of SECRETS) expect(text).not.toContain(secret);
}

describe("every renderer path is enumerated (132)", () => {
    test("main.js channels match the classified list exactly", () => {
        const names = REGISTRATIONS.map((r) => r.channel).sort();
        expect(new Set(names).size).toBe(names.length);
        expect(names).toEqual(Object.keys(CHANNELS).sort());
        for (const r of REGISTRATIONS) {
            expect(r.fn === "registerTrustedEvent").toBe(CHANNELS[r.channel] === "event");
        }
        expect(mainSource).not.toMatch(/ipcMain\.(handle|on|handleOnce|once)\(\s*['"]/);
    });

    test("preload exposes only registered channels", () => {
        const preload = fs.readFileSync(preloadPath, "utf8");
        const used = [...preload.matchAll(/ipcRenderer\.(invoke|send)\('([^']+)'/g)].map((m) => m[2]);
        expect(used.length).toBeGreaterThan(20);
        for (const channel of used) expect(Object.keys(CHANNELS)).toContain(channel);
        expect(preload).not.toMatch(/sessionPairing|replicaRegistration|ftpPass|httpFeedCode/);
    });

    test("only classified handlers touch stored config; none return raw rows or the pairing", () => {
        const configReaders = /store\.get\('config'\)|getServersFromStore\(/;
        for (const r of REGISTRATIONS) {
            const kind = CHANNELS[r.channel];
            if (kind === "no-config" && !["read-server-live-cache", "get-field-exclusion-options"].includes(r.channel)) {
                expect([r.channel, configReaders.test(r.text)]).toEqual([r.channel, false]);
            }
            if (r.channel !== "approve-pending-replica-session") expect(r.text).not.toMatch(/sessionPairing/);
        }
        const config = REGISTRATIONS.find((r) => r.channel === "get-current-config").text;
        expect(config).toMatch(/currentConfigForRenderer\(\)/);
        expect(config).not.toMatch(/store\.get/);
    });

    test("the setup HTTP GET uses the same redactor; public projections carry no secrets", () => {
        const route = mainSource.slice(mainSource.indexOf("expressApp.get('/api/setup-config'"), mainSource.indexOf("expressApp.post('/api/setup-config'"));
        expect(route).toMatch(/redactConfigSecrets\(store\.get\('config'\)/);
        for (const name of ["buildPublicStatusPayload", "projectConfiguredServerRow"]) {
            const node = mainAst.statements.find((s) => ts.isFunctionDeclaration(s) && s.name && s.name.text === name);
            expect(node).toBeTruthy();
            expect(node.getText(mainAst)).not.toMatch(/sessionPairing|replicaRegistration|ftpPass|httpFeedCode/);
        }
    });
});

describe("config-shaped renderer handlers, invoked as registered (132)", () => {
    test("get-current-config returns no pairing, FTP password or feed code; the store keeps them", async () => {
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-132-cfg-"));
        try {
            const stored = seedConfig(profile);
            const { handlers } = loadMain({ functions: ["redactConfigSecrets", "currentConfigForRenderer"], channels: ["get-current-config"] }, {
                store: { get: () => stored },
            });
            const cfg = await handlers["get-current-config"]({});
            expectNoSecrets(cfg);
            expect(cfg.servers[0]).toMatchObject({ id: "ftp-a", ftpPassSet: true, httpFeedCodeSet: false });
            expect(cfg.servers[1]).toMatchObject({ id: "feed-a", httpFeedCodeSet: true });
            expect(cfg.servers[2].replicaRegistration).toEqual({ remoteSlot: "savegame1", sessionPairingSet: true });
            expect(stored.servers[2].replicaRegistration.sessionPairing).toBe(PAIRING);
            expect(stored.servers[0].ftpPass).toBe(FTP_PASS);
            const empty = loadMain({ functions: ["redactConfigSecrets", "currentConfigForRenderer"], channels: ["get-current-config"] }, {
                store: { get: () => undefined },
            });
            expect(await empty.handlers["get-current-config"]({})).toBeUndefined();
        } finally {
            fs.rmSync(profile, { recursive: true, force: true });
        }
    });

    test("get-pending-replica-session omits serverKey in pending and linked states", async () => {
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-132-pending-"));
        try {
            const fields = {
                schema: "1", pendingId: "0123456789abcdef", serverKey: PAIRING, careerId: "fd-1a2b3c4d5e6f7a8b-1",
                sourceSlot: "savegame1", mapTitle: "Witcombe", serverName: "Farm",
            };
            fields.check = pendingReplicaSession.pendingCheck(fields);
            const attrs = Object.entries(fields).map(([k, v]) => `${k}="${v}"`).join(" ");
            const file = pendingReplicaSession.pendingPathFor(profile);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, `<?xml version="1.0" encoding="utf-8" standalone="no"?>\n<farmDashboardPendingSession ${attrs}/>\n`);
            let stored = { servers: [] };
            const { handlers } = loadMain({
                functions: ["pendingReplicaState"], consts: ["declinedPendingIds"],
                channels: ["get-pending-replica-session"],
            }, {
                pendingReplicaSession,
                getFs25DocumentsRoot: () => profile,
                store: { get: () => stored },
            });
            const view = await handlers["get-pending-replica-session"]({});
            expect(view.state).toBe("pending");
            expectNoSecrets(view);
            stored = seedConfig(profile);
            const linked = await handlers["get-pending-replica-session"]({});
            expect(linked.state).toBe("linked");
            expectNoSecrets(linked);
        } finally {
            fs.rmSync(profile, { recursive: true, force: true });
        }
    });
});

describe("Settings and setup saves of the redacted config keep the exact secrets (132)", () => {
    function harness() {
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-132-save-"));
        let stored = seedConfig(profile);
        const seeded = replicaRegistration.publishReplicaRegistration(profile, stored.servers);
        expect(seeded.ok).toBe(true);
        expect(replicaRegistration.commitRegistrationPublication(seeded).ok).toBe(true);
        const registrationFile = path.join(profile, "modSettings", "FS25_FarmDashboard", "replicaSources.xml");
        const logs = [];
        const capture = (...args) => { logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")); };
        let boots = 0;
        const { handlers } = loadMain({
            functions: ["redactConfigSecrets", "currentConfigForRenderer", "applyFarmdashSetupConfig", "setupSaveOutcome"],
            channels: ["get-current-config", "save-settings"],
        }, {
            console: { log: capture, warn: capture, error: capture, info: capture },
            replicaRegistration,
            resolveServersForSave,
            configNeedsServerReboot,
            runtimeActivation: runtimeActivation.createScope(),
            getFs25DocumentsRoot: () => profile,
            bootServer: () => { boots += 1; },
            uxEventLog: { clear() {} },
            store: { get: () => stored, set: (_key, value) => { stored = value; } },
        });
        return {
            profile, handlers, registrationFile, logs,
            stored: () => stored,
            boots: () => boots,
            close: () => fs.rmSync(profile, { recursive: true, force: true }),
        };
    }

    test("Settings: load redacted, rename a server and change polling, save: pairing, FTP and feed secrets and replicaSources.xml unchanged", async () => {
        const h = harness();
        try {
            const before = fs.readFileSync(h.registrationFile, "utf8");
            const cfg = await h.handlers["get-current-config"]({});
            expectNoSecrets(cfg);
            const serversDraft = cfg.servers.map((s) => (s.id === "mp-0a1b2c3d4e5f" ? { ...s, name: "Renamed" } : s));
            const res = await h.handlers["save-settings"]({}, {
                ...cfg, isConfigured: true, servers: serversDraft,
                ftpPolling: { ...cfg.ftpPolling, intervalMinutes: 10 },
            });
            expect(res.ok).toBe(true);
            expectNoSecrets(res);
            const after = h.stored();
            expect(after.servers.find((s) => s.id === "mp-0a1b2c3d4e5f")).toMatchObject({
                name: "Renamed", replicaRegistration: { remoteSlot: "savegame1", sessionPairing: PAIRING },
            });
            expect(after.servers.find((s) => s.id === "mp-0a1b2c3d4e5f").replicaRegistration).toEqual({ remoteSlot: "savegame1", sessionPairing: PAIRING });
            expect(after.servers.find((s) => s.id === "ftp-a").ftpPass).toBe(FTP_PASS);
            expect(after.servers.find((s) => s.id === "feed-a").httpFeedCode).toBe(FEED_CODE);
            expect(JSON.stringify(after)).not.toMatch(/PassSet|CodeSet|sessionPairingSet/);
            expect(after.ftpPolling.intervalMinutes).toBe(10);
            expect(fs.readFileSync(h.registrationFile, "utf8")).toBe(before);
            for (const line of h.logs) for (const secret of SECRETS) expect(line).not.toContain(secret);
        } finally {
            h.close();
        }
    });

    test("setup: saving the loaded config as-is, or with the Set flag stripped, keeps the pairing", async () => {
        const h = harness();
        try {
            const before = fs.readFileSync(h.registrationFile, "utf8");
            const cfg = await h.handlers["get-current-config"]({});
            expect((await h.handlers["save-settings"]({}, { ...cfg, isConfigured: true })).ok).toBe(true);
            const stripped = JSON.parse(JSON.stringify(await h.handlers["get-current-config"]({})));
            for (const s of stripped.servers) {
                delete s.ftpPassSet;
                delete s.httpFeedCodeSet;
                if (s.replicaRegistration) delete s.replicaRegistration.sessionPairingSet;
            }
            expect((await h.handlers["save-settings"]({}, stripped)).ok).toBe(true);
            const after = h.stored();
            expect(after.servers.find((s) => s.id === "mp-0a1b2c3d4e5f").replicaRegistration.sessionPairing).toBe(PAIRING);
            expect(after.servers.find((s) => s.id === "ftp-a").ftpPass).toBe(FTP_PASS);
            expect(after.servers.find((s) => s.id === "feed-a").httpFeedCode).toBe(FEED_CODE);
            expect(fs.readFileSync(h.registrationFile, "utf8")).toBe(before);
        } finally {
            h.close();
        }
    });

    test("removing the linked row revokes it; adding an FTP source with a new password still stores it", async () => {
        const h = harness();
        try {
            const cfg = await h.handlers["get-current-config"]({});
            const servers = cfg.servers.filter((s) => s.id !== "mp-0a1b2c3d4e5f");
            servers.push({ id: "ftp-b", name: "New", mode: "ftp", ftpHost: "n.example", ftpPort: 21, ftpUser: "n", ftpPass: "new-pass" });
            expect((await h.handlers["save-settings"]({}, { ...cfg, servers })).ok).toBe(true);
            const after = h.stored();
            expect(after.servers.map((s) => s.id)).toEqual(["ftp-a", "feed-a", "ftp-b"]);
            expect(after.servers.find((s) => s.id === "ftp-b").ftpPass).toBe("new-pass");
            expect(after.servers.find((s) => s.id === "ftp-a").ftpPass).toBe(FTP_PASS);
            const text = fs.existsSync(h.registrationFile) ? fs.readFileSync(h.registrationFile, "utf8") : "";
            expect(text).not.toContain(PAIRING);
            expect(text).not.toContain("mp-0a1b2c3d4e5f");
        } finally {
            h.close();
        }
    });
});

describe("linked-server limit matches the game's retained links (132)", () => {
    test("the app links up to 16 servers and refuses a 17th instead of silently evicting a renewal key", () => {
        const profile = path.join(os.tmpdir(), "farmdash-132-limit");
        const session = (i) => ({ serverKey: `join-${i}`, sourceSlot: "savegame1", mapTitle: "Map", serverName: `S${i}` });
        const servers = [{ id: "ftp-a", mode: "ftp" }];
        for (let i = 1; i <= 16; i++) {
            const built = pendingReplicaSession.approvedServerRow(session(i), profile, servers);
            expect(built.ok).toBe(true);
            servers.push(built.row);
        }
        expect(pendingReplicaSession.MAX_LINKED_SERVERS).toBe(16);
        expect(pendingReplicaSession.approvedServerRow(session(17), profile, servers)).toEqual({ ok: false, error: "link-limit" });
        expect(pendingReplicaSession.approvedServerRow(session(3), profile, servers)).toMatchObject({ ok: false, error: "already-linked" });
        expect(replicaRegistration.validateSnapshot(servers).ok).toBe(true);
        const lua = fs.readFileSync(path.join(__dirname, "../../FS25_FarmDashboard_Mod/src/FarmDashboardReplicaPairing.lua"), "utf8");
        expect(lua).toMatch(/P\.MAX_TRUST = 16\b/);
        expect(lua).toMatch(/P\.MAX_CHALLENGE_IDS = P\.MAX_TRUST\b/);
    });
});
