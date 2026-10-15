"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const ts = require("../../NEW APP/node_modules/typescript");
const vm = require("vm");
const registration = require("../replicaRegistration");
const { encodeEnvelope } = require("../exportEnvelope");
const { writeStrictPair } = require("../replicaPairContract.cjs");
const pendingReplicaSession = require("../pendingReplicaSession.cjs");
const { resolveServersForSave, configNeedsServerReboot } = require("../setupConfigMerge.cjs");
const runtimeActivation = require("../runtimeActivation");

const SOURCE_ID = "mp-6a677ec7f2bd";
const KEY = "private-pairing-value";

function fixture() {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-orphan-"));
    const root = path.join(profile, "modSettings", "FS25_FarmDashboard");
    fs.mkdirSync(root, { recursive: true });
    const original = {
        id: SOURCE_ID, name: "Witcombe", mode: "local", localPath: root,
        localSubFolder: "savegame1", replicaRemoteSlot: "savegame1",
        replicaRegistration: { remoteSlot: "savegame1", sessionPairing: KEY },
    };
    const published = registration.publishReplicaRegistration(profile, [original]);
    if (!published.ok) throw new Error(published.error);
    if (!registration.commitRegistrationPublication(published).ok) throw new Error("commit fixture");
    fs.writeFileSync(path.join(root, "replicaTrust.xml"),
        `<farmDashboardReplicaTrust><link sourceId="${SOURCE_ID}" careerId="career-1" keyId="0123456789abcdef" key="${"a".repeat(64)}"/></farmDashboardReplicaTrust>`);
    const envelope = encodeEnvelope(JSON.stringify({ savegameName: "Witcombe", mapTitle: "Witcombe" }), {
        careerId: "career-1", sessionId: "session-1", publicationSequence: 2,
        exportGeneration: 1, simulationTimeMs: 100,
    });
    writeStrictPair(path.join(root, "replicas", SOURCE_ID), envelope, {
        sourceId: SOURCE_ID, sourceSlot: "savegame1", connectionEpoch: "1", slot: "a", replicaRevision: 1,
    });
    return { profile, root, original, close: () => fs.rmSync(profile, { recursive: true, force: true }) };
}

function mainHarness(profile, initial) {
    const mainPath = path.join(__dirname, "..", "main.js");
    const source = fs.readFileSync(mainPath, "utf8");
    const ast = ts.createSourceFile(mainPath, source, ts.ScriptTarget.Latest, true);
    const names = ["orphanReplicaState", "applyFarmdashSetupConfig", "setupSaveOutcome"];
    const channels = ["get-orphan-replica-recovery", "start-orphan-replica-challenge",
        "cancel-orphan-replica-challenge", "restore-orphan-replica"];
    const parts = [];
    for (const name of names) {
        const node = ast.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === name);
        if (!node) throw new Error(`missing ${name}`);
        parts.push(node.getText(ast));
    }
    const offer = ast.statements.find((s) => ts.isVariableStatement(s) && s.declarationList.declarations.some((d) => d.name.text === "orphanOfferState"));
    parts.push(offer.getText(ast));
    for (const channel of channels) {
        const node = ast.statements.find((s) => ts.isExpressionStatement(s) &&
            ts.isCallExpression(s.expression) && s.expression.expression.getText(ast) === "registerTrustedHandle" &&
            s.expression.arguments[0]?.text === channel);
        if (!node) throw new Error(`missing channel ${channel}`);
        parts.push(node.getText(ast));
    }
    let stored = initial;
    let boots = 0;
    const handlers = {};
    const ctx = vm.createContext({
        fs, path, crypto: require("crypto"), registration, replicaRegistration: registration,
        pendingReplicaSession, resolveServersForSave, configNeedsServerReboot,
        runtimeActivation: runtimeActivation.createScope(),
        getFs25DocumentsRoot: () => profile,
        store: { get: () => stored, set: (_key, next) => { stored = next; } },
        bootServer: () => { boots += 1; }, uxEventLog: { clear() {} },
        registerTrustedHandle: (name, handler) => { handlers[name] = handler; },
        console: { log() {}, warn() {}, error() {} },
    });
    vm.runInContext(parts.join("\n"), ctx);
    return { handlers, stored: () => stored, boots: () => boots,
        saveConfig: (next, options) => {
            ctx.__nextConfig = next;
            ctx.__saveOptions = options;
            return vm.runInContext("applyFarmdashSetupConfig(__nextConfig, __saveOptions)", ctx);
        },
        expireChallenge: () => vm.runInContext("orphanOfferState.offer.challenge.expiresAt = 0", ctx) };
}

function selectorAfterFreshBoot(config) {
    const mainPath = path.join(__dirname, "..", "main.js");
    const source = fs.readFileSync(mainPath, "utf8");
    const ast = ts.createSourceFile(mainPath, source, ts.ScriptTarget.Latest, true);
    const names = ["labelText", "usesDefaultCareerProfile", "projectConfiguredServerRow", "configuredServerList"];
    const parts = names.map((name) => {
        const node = ast.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === name);
        if (!node) throw new Error(`missing ${name}`);
        return node.getText(ast);
    });
    const ctx = vm.createContext({
        store: { get: () => config }, serverStates: {},
        boundSources: { snapshot: () => null },
        isExplicitReplicaXmlSource: (server) => Boolean(server?.replicaRemoteSlot),
        peekCareerSaveLabels: () => ({ savegameName: null, mapTitle: null }),
        looksLikeSaveSlotId: (value) => /^savegame\d+$/i.test(String(value || "")),
    });
    vm.runInContext(parts.join("\n"), ctx);
    return JSON.parse(JSON.stringify(vm.runInContext("configuredServerList()", ctx)));
}

function requestFields(root) {
    const xml = fs.readFileSync(path.join(root, "replicaRecoveryRequest.xml"), "utf8");
    return Object.fromEntries([...xml.matchAll(/([A-Za-z]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
}

function writeGameProof(root, request, overrides = {}, secret = "a".repeat(64)) {
    const fields = { nonce: request.nonce, sourceId: request.sourceId, careerId: request.careerId,
        remoteSlot: request.remoteSlot, keyId: request.keyId, sessionKey: "fresh-current-session", ...overrides };
    const message = ["FDPAIR1", "recover", request.nonce, request.sourceId, request.careerId,
        request.remoteSlot, "fresh-current-session", request.keyId].join("|");
    fields.proof = crypto.createHmac("sha256", Buffer.from(secret, "hex")).update(message).digest("hex");
    fs.writeFileSync(path.join(root, "replicaRecoveryProof.xml"),
        `<farmDashboardRecoveryProof ${Object.entries(fields).map(([key, value]) => `${key}="${value}"`).join(" ")}/>`);
}

describe("strict orphan linked-source recovery", () => {
    test("a fresh app profile cannot import a retained replica through ordinary settings", async () => {
        const f = fixture();
        try {
            const h = mainHarness(f.profile, { isConfigured: false, servers: [] });
            const scanned = {
                id: SOURCE_ID, name: "Witcombe", mode: "local", localPath: f.root,
                localSubFolder: "savegame1", replicaRemoteSlot: "savegame1",
            };
            await expect(h.saveConfig({ isConfigured: true, servers: [scanned] }))
                .rejects.toThrow("replica-proof-required");
            await expect(h.saveConfig({ isConfigured: true, servers: [f.original] }))
                .rejects.toThrow("replica-proof-required");
            expect(h.stored().servers).toEqual([]);
        } finally { f.close(); }
    });
    test("stale proof stays pending for a fresh nonce, then the new game proof succeeds", () => {
        const f = fixture();
        try {
            const candidate = registration.detectOrphanLinkedSource(f.profile, []);
            const old = registration.startRecoveryChallenge(f.profile, candidate);
            writeGameProof(f.root, requestFields(f.root));
            const staleProof = fs.readFileSync(path.join(f.root, "replicaRecoveryProof.xml"));
            const fresh = registration.startRecoveryChallenge(f.profile, candidate);
            expect(fresh.ok).toBe(true);
            expect(fresh.challenge.nonce).not.toBe(old.challenge.nonce);
            expect(fs.existsSync(path.join(f.root, "replicaRecoveryProof.xml"))).toBe(false);
            fs.writeFileSync(path.join(f.root, "replicaRecoveryProof.xml"), staleProof);
            expect(registration.verifyRecoveryChallenge(f.profile, candidate, fresh.challenge).error).toBe("waiting");
            writeGameProof(f.root, requestFields(f.root));
            expect(registration.verifyRecoveryChallenge(f.profile, candidate, fresh.challenge).ok).toBe(true);
        } finally { f.close(); }
    });

    test("retiring an old nonce preserves a racing newer request and proof", () => {
        const f = fixture();
        try {
            const candidate = registration.detectOrphanLinkedSource(f.profile, []);
            const old = registration.startRecoveryChallenge(f.profile, candidate);
            const fresh = registration.startRecoveryChallenge(f.profile, candidate);
            writeGameProof(f.root, requestFields(f.root));
            expect(registration.retireRecoveryChallenge(f.profile, old.challenge).ok).toBe(true);
            expect(requestFields(f.root).nonce).toBe(fresh.challenge.nonce);
            expect(fs.existsSync(path.join(f.root, "replicaRecoveryProof.xml"))).toBe(true);
            expect(registration.retireRecoveryChallenge(f.profile, fresh.challenge).ok).toBe(true);
            expect(fs.existsSync(path.join(f.root, "replicaRecoveryRequest.xml"))).toBe(false);
            expect(fs.existsSync(path.join(f.root, "replicaRecoveryProof.xml"))).toBe(false);
        } finally { f.close(); }
    });

    test("expiry retires its own files; late Cancel and Confirm cannot affect a replacement challenge", async () => {
        const f = fixture();
        try {
            const h = mainHarness(f.profile, { isConfigured: true, servers: [] });
            const offer = await h.handlers["get-orphan-replica-recovery"]({});
            const expired = await h.handlers["start-orphan-replica-challenge"]({}, offer.offer.offerId);
            writeGameProof(f.root, requestFields(f.root));
            h.expireChallenge();
            const expiredView = await h.handlers["get-orphan-replica-recovery"]({});
            expect(expiredView).toMatchObject({ state: "offer", error: "expired" });
            expect(fs.existsSync(path.join(f.root, "replicaRecoveryRequest.xml"))).toBe(false);
            expect(fs.existsSync(path.join(f.root, "replicaRecoveryProof.xml"))).toBe(false);
            const old = await h.handlers["start-orphan-replica-challenge"]({}, offer.offer.offerId);
            writeGameProof(f.root, requestFields(f.root));
            const fresh = await h.handlers["start-orphan-replica-challenge"]({}, offer.offer.offerId);
            writeGameProof(f.root, requestFields(f.root));
            expect((await h.handlers["cancel-orphan-replica-challenge"]({}, offer.offer.offerId, old.challengeId)).ok).toBe(false);
            expect((await h.handlers["restore-orphan-replica"]({}, offer.offer.offerId, old.challengeId)).ok).toBe(false);
            expect((await h.handlers["get-orphan-replica-recovery"]({})).state).toBe("verified");
            expect(requestFields(f.root).nonce).toMatch(/^[a-f0-9]{32}$/);
            expect(fs.existsSync(path.join(f.root, "replicaRecoveryProof.xml"))).toBe(true);
            expect((await h.handlers["cancel-orphan-replica-challenge"]({}, offer.offer.offerId, fresh.challengeId)).ok).toBe(true);
            expect(fs.existsSync(path.join(f.root, "replicaRecoveryRequest.xml"))).toBe(false);
            expect(fs.existsSync(path.join(f.root, "replicaRecoveryProof.xml"))).toBe(false);
            expect(h.stored().servers).toEqual([]);
            expect(expired.challengeId).not.toBe(old.challengeId);
        } finally { f.close(); }
    });

    test("forged key and wrong source or career never write a source", async () => {
        for (const attack of [
            { fields: { sourceId: "mp-111111111111" } },
            { fields: { careerId: "wrong-career" } },
            { fields: {}, secret: "b".repeat(64) },
        ]) {
            const f = fixture();
            try {
                const h = mainHarness(f.profile, { isConfigured: true, servers: [] });
                const original = fs.readFileSync(path.join(f.root, "replicaSources.xml"));
                const offer = await h.handlers["get-orphan-replica-recovery"]({});
                const started = await h.handlers["start-orphan-replica-challenge"]({}, offer.offer.offerId);
                writeGameProof(f.root, requestFields(f.root), attack.fields, attack.secret);
                expect((await h.handlers["get-orphan-replica-recovery"]({})).state).toBe("offer");
                expect((await h.handlers["restore-orphan-replica"]({}, offer.offer.offerId, started.challengeId)).ok).toBe(false);
                expect(h.stored().servers).toEqual([]);
                expect(fs.readFileSync(path.join(f.root, "replicaSources.xml")).equals(original)).toBe(true);
                expect(fs.existsSync(path.join(f.root, "replicaRecoveryRequest.xml"))).toBe(false);
                expect(fs.existsSync(path.join(f.root, "replicaRecoveryProof.xml"))).toBe(false);
            } finally { f.close(); }
        }
    });
    test("no game response and explicit Cancel leave config, registration and trust unchanged", async () => {
        const f = fixture();
        try {
            const h = mainHarness(f.profile, { isConfigured: true, servers: [] });
            const original = fs.readFileSync(path.join(f.root, "replicaSources.xml"));
            const trust = fs.readFileSync(path.join(f.root, "replicaTrust.xml"));
            const offer = await h.handlers["get-orphan-replica-recovery"]({});
            const started = await h.handlers["start-orphan-replica-challenge"]({}, offer.offer.offerId);
            expect(started.ok).toBe(true);
            expect((await h.handlers["get-orphan-replica-recovery"]({})).state).toBe("waiting");
            expect((await h.handlers["restore-orphan-replica"]({}, offer.offer.offerId, started.challengeId)).ok).toBe(false);
            writeGameProof(f.root, requestFields(f.root));
            expect((await h.handlers["get-orphan-replica-recovery"]({})).state).toBe("verified");
            await h.handlers["cancel-orphan-replica-challenge"]({}, offer.offer.offerId, started.challengeId);
            expect((await h.handlers["restore-orphan-replica"]({}, offer.offer.offerId, started.challengeId)).ok).toBe(false);
            expect(fs.existsSync(path.join(f.root, "replicaRecoveryRequest.xml"))).toBe(false);
            expect(fs.existsSync(path.join(f.root, "replicaRecoveryProof.xml"))).toBe(false);
            expect(h.stored().servers).toEqual([]);
            expect(fs.readFileSync(path.join(f.root, "replicaSources.xml")).equals(original)).toBe(true);
            expect(fs.readFileSync(path.join(f.root, "replicaTrust.xml")).equals(trust)).toBe(true);
            expect(fs.existsSync(path.join(f.root, "replicaSources.transaction.json"))).toBe(false);
        } finally { f.close(); }
    });

    test("fresh in-game proof, then explicit confirm, restores same source/slot and rotates token", async () => {
        const f = fixture();
        try {
            const h = mainHarness(f.profile, { isConfigured: true, servers: [] });
            const original = fs.readFileSync(path.join(f.root, "replicaSources.xml"));
            const trust = fs.readFileSync(path.join(f.root, "replicaTrust.xml"));
            const offer = await h.handlers["get-orphan-replica-recovery"]({});
            const started = await h.handlers["start-orphan-replica-challenge"]({}, offer.offer.offerId);
            expect(started.ok).toBe(true);
            writeGameProof(f.root, requestFields(f.root));
            expect((await h.handlers["get-orphan-replica-recovery"]({})).state).toBe("verified");
            expect(h.stored().servers).toEqual([]);
            expect(fs.readFileSync(path.join(f.root, "replicaSources.xml")).equals(original)).toBe(true);
            const restored = await h.handlers["restore-orphan-replica"]({}, offer.offer.offerId, started.challengeId);
            expect(restored).toMatchObject({ ok: true, sourceId: SOURCE_ID });
            expect(h.stored().servers[0]).toMatchObject({ id: SOURCE_ID, localSubFolder: "savegame1",
                replicaRemoteSlot: "savegame1", replicaRegistration: {
                    remoteSlot: "savegame1", sessionPairing: "fresh-current-session",
                } });
            expect(registration.parseRegistrationDocument(fs.readFileSync(path.join(f.root, "replicaSources.xml"), "utf8")).rows)
                .toContainEqual({ sourceId: SOURCE_ID, remoteSlot: "savegame1", sessionPairing: "fresh-current-session" });
            expect(fs.readFileSync(path.join(f.root, "replicaTrust.xml")).equals(trust)).toBe(true);
            expect(fs.existsSync(path.join(f.root, "replicaSources.transaction.json"))).toBe(false);
            expect(fs.existsSync(path.join(f.root, "replicaRecoveryRequest.xml"))).toBe(false);
            expect(fs.existsSync(path.join(f.root, "replicaRecoveryProof.xml"))).toBe(false);
            expect((await h.handlers["restore-orphan-replica"]({}, offer.offer.offerId)).ok).toBe(false);
            const reboot = mainHarness(f.profile, h.stored());
            expect((await reboot.handlers["get-orphan-replica-recovery"]({})).state).toBe("none");
            expect(selectorAfterFreshBoot(h.stored())).toContainEqual(expect.objectContaining({
                id: SOURCE_ID, mode: "local", localSubFolder: "savegame1",
            }));
            expect(require("../exportIngress").ingestWatchedSlot(path.join(f.root, "replicas", SOURCE_ID),
                { sourceId: SOURCE_ID }).status).toBe("replica");
        } finally { f.close(); }
    });

    test("stale, replayed, mismatched and invalid proofs fail closed", () => {
        const f = fixture();
        try {
            const candidate = registration.detectOrphanLinkedSource(f.profile, []);
            const started = registration.startRecoveryChallenge(f.profile, candidate, 1000);
            expect(started.ok).toBe(true);
            const challenge = started.challenge;
            expect(registration.verifyRecoveryChallenge(f.profile, candidate, challenge, 1001).error).toBe("waiting");
            writeGameProof(f.root, requestFields(f.root));
            expect(challenge.expiresAt).toBe(301000);
            expect(registration.verifyRecoveryChallenge(f.profile, candidate, challenge, 68000).ok).toBe(true);
            expect(registration.verifyRecoveryChallenge(f.profile, candidate, challenge, challenge.expiresAt).error).toBe("expired");
            expect(registration.verifyRecoveryChallenge(f.profile, candidate, challenge, 1002).ok).toBe(true);
            for (const altered of [
                { nonce: "0".repeat(32) }, { sourceId: "mp-111111111111" },
                { careerId: "wrong-career" }, { remoteSlot: "savegame2" },
                { keyId: "1111111111111111" }, { sessionKey: "wrong-server-session" },
            ]) {
                writeGameProof(f.root, requestFields(f.root), altered);
                expect(registration.verifyRecoveryChallenge(f.profile, candidate, challenge, 1002).ok).toBe(false);
            }
            writeGameProof(f.root, requestFields(f.root), {}, "b".repeat(64));
            expect(registration.verifyRecoveryChallenge(f.profile, candidate, challenge, 1002).error).toBe("invalid-proof");
            const oldResponse = fs.readFileSync(path.join(f.root, "replicaRecoveryProof.xml"));
            const renewed = registration.startRecoveryChallenge(f.profile, candidate, 1003);
            expect(renewed.ok).toBe(true);
            fs.writeFileSync(path.join(f.root, "replicaRecoveryProof.xml"), oldResponse);
            expect(registration.verifyRecoveryChallenge(f.profile, candidate, renewed.challenge, 1004).ok).toBe(false);
            expect(registration.beginOrphanAdoption(f.profile, [], candidate, renewed.challenge).ok).toBe(false);
            expect(fs.existsSync(path.join(f.root, "replicaSources.transaction.json"))).toBe(false);
        } finally { f.close(); }
    });

    test("interrupted adoption restores the old registry, while a saved app row commits the repair", () => {
        for (const appSaved of [false, true]) {
            const f = fixture();
            try {
                const original = fs.readFileSync(path.join(f.root, "replicaSources.xml"));
                const candidate = registration.detectOrphanLinkedSource(f.profile, []);
                const started = registration.startRecoveryChallenge(f.profile, candidate);
                writeGameProof(f.root, requestFields(f.root));
                const adopted = registration.beginOrphanAdoption(f.profile, [], candidate, started.challenge);
                expect(adopted.ok).toBe(true);
                expect(fs.existsSync(path.join(f.root, "replicaSources.transaction.json"))).toBe(true);
                const reconciled = registration.reconcileRegistrationTransaction(f.profile,
                    appSaved ? [adopted.row] : []);
                expect(reconciled.ok).toBe(true);
                expect(fs.existsSync(path.join(f.root, "replicaSources.transaction.json"))).toBe(false);
                const after = fs.readFileSync(path.join(f.root, "replicaSources.xml"));
                if (appSaved) {
                    expect(after.equals(original)).toBe(false);
                    expect(registration.parseRegistrationDocument(after.toString("utf8")).rows[0].sessionPairing)
                        .toBe("fresh-current-session");
                } else expect(after.equals(original)).toBe(true);
            } finally { f.close(); }
        }
    });
    test("retained metadata is an offer only; guessing restore cannot write", async () => {
        const f = fixture();
        try {
            const h = mainHarness(f.profile, { isConfigured: true, servers: [] });
            const regPath = path.join(f.root, "replicaSources.xml");
            const before = fs.readFileSync(regPath);
            const offer = await h.handlers["get-orphan-replica-recovery"]({});
            expect(offer.state).toBe("offer");
            expect(registration.detectOrphanLinkedSource(f.profile, []).ok).toBe(true);
            expect(JSON.stringify(offer)).not.toContain(KEY);
            expect(JSON.stringify(offer)).not.toContain("0123456789abcdef");
            expect(h.stored().servers).toEqual([]);
            expect(fs.readFileSync(regPath).equals(before)).toBe(true);
            expect(fs.existsSync(path.join(f.root, "replicaSources.transaction.json"))).toBe(false);
            // No proof exists; a guessed or stale confirmation is refused.
            expect((await h.handlers["restore-orphan-replica"]({}, "0".repeat(32))).ok).toBe(false);
            expect(h.stored().servers).toEqual([]);
            expect(h.boots()).toBe(0);
            expect(fs.readFileSync(regPath).equals(before)).toBe(true);
        } finally { f.close(); }
    });

    test("ambiguity, wrong slot, conflicting ID, absent trust, and pending transaction refuse an offer", () => {
        const f = fixture();
        try {
            const good = registration.detectOrphanLinkedSource(f.profile, []);
            expect(good.ok).toBe(true);
            expect(registration.detectOrphanLinkedSource(f.profile, [
                { ...f.original, replicaRegistration: { remoteSlot: "savegame2", sessionPairing: KEY } },
            ]).ok).toBe(false);
            expect(registration.detectOrphanLinkedSource(f.profile, [{ id: SOURCE_ID, mode: "ftp" }]).error).toBe("conflict");
            const pair = path.join(f.root, "replicas", SOURCE_ID, "selection-a.xml");
            const original = fs.readFileSync(pair, "utf8");
            fs.writeFileSync(pair, original.replace('sourceSlot="savegame1"', 'sourceSlot="savegame2"'));
            expect(registration.detectOrphanLinkedSource(f.profile, []).ok).toBe(false);
            fs.writeFileSync(pair, original);
            const trust = path.join(f.root, "replicaTrust.xml");
            const trustBytes = fs.readFileSync(trust);
            fs.writeFileSync(trust, "<farmDashboardReplicaTrust/>");
            expect(registration.detectOrphanLinkedSource(f.profile, []).ok).toBe(false);
            fs.writeFileSync(trust, trustBytes);
            const second = { ...f.original, id: "mp-111111111111", replicaRegistration: { remoteSlot: "savegame2", sessionPairing: "other-key" } };
            const published = registration.publishReplicaRegistration(f.profile, [f.original, second]);
            expect(published.ok).toBe(true);
            expect(registration.detectOrphanLinkedSource(f.profile, []).ok).toBe(false);
            expect(registration.restoreRegistrationPublication(published).ok).toBe(true);
            const published2 = registration.publishReplicaRegistration(f.profile, [f.original, second]);
            expect(published2.ok).toBe(true);
            expect(registration.commitRegistrationPublication(published2).ok).toBe(true);
            expect(registration.detectOrphanLinkedSource(f.profile, []).error).toBe("ambiguous");
        } finally { f.close(); }
    });

    test("a valid A/B replica from a different career cannot recover the same source ID and slot", () => {
        const f = fixture();
        try {
            const before = fs.readFileSync(path.join(f.root, "replicaSources.xml"));
            const otherCareer = encodeEnvelope(JSON.stringify({ savegameName: "Other career" }), {
                careerId: "career-2", sessionId: "session-2", publicationSequence: 3,
                exportGeneration: 2, simulationTimeMs: 200,
            });
            writeStrictPair(path.join(f.root, "replicas", SOURCE_ID), otherCareer, {
                sourceId: SOURCE_ID, sourceSlot: "savegame1", connectionEpoch: "2", slot: "a", replicaRevision: 2,
            });
            expect(registration.detectOrphanLinkedSource(f.profile, []).error).toBe("career-mismatch");
            expect(fs.readFileSync(path.join(f.root, "replicaSources.xml")).equals(before)).toBe(true);
            expect(fs.existsSync(path.join(f.root, "replicaSources.transaction.json"))).toBe(false);
        } finally { f.close(); }
    });

    test("a retained registration with a substituted pairing token cannot be adopted", () => {
        const f = fixture();
        try {
            const before = fs.readFileSync(path.join(f.root, "replicaSources.xml"));
            const altered = before.toString("utf8").replace(`serverKey="${KEY}"`, 'serverKey="substituted-token"');
            fs.writeFileSync(path.join(f.root, "replicaSources.xml"), altered);
            const candidate = registration.detectOrphanLinkedSource(f.profile, []);
            expect(candidate.ok).toBe(true);
            expect(registration.beginOrphanAdoption(f.profile, [], candidate).ok).toBe(false);
            expect(fs.existsSync(path.join(f.root, "replicaSources.transaction.json"))).toBe(false);
            expect(selectorAfterFreshBoot({ isConfigured: true, servers: [f.original] })).toContainEqual(
                expect.objectContaining({ id: SOURCE_ID, name: "Witcombe", mode: "local", localSubFolder: "savegame1" })
            );
        } finally { f.close(); }
    });

    test("registration membership is order-independent for a non-terminal orphan but never permits duplicates", () => {
        const orphan = { sourceId: SOURCE_ID, remoteSlot: "savegame1", sessionPairing: KEY };
        const existing = { sourceId: "mp-111111111111", remoteSlot: "savegame2", sessionPairing: "existing-token" };
        expect(registration.sameRegistrationMembers([existing, orphan], [orphan, existing])).toBe(true);
        expect(registration.sameRegistrationMembers([orphan, existing], [existing, orphan])).toBe(true);
        expect(registration.sameRegistrationMembers([existing, orphan], [orphan, orphan])).toBe(false);
        expect(registration.sameRegistrationMembers([existing, orphan], [orphan, { ...existing, sessionPairing: KEY }])).toBe(false);
    });
});
