'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const ts = require('../../NEW APP/node_modules/typescript');
const pendingReplicaSession = require('../pendingReplicaSession.cjs');
const replicaRegistration = require('../replicaRegistration');
const runtimeActivation = require('../runtimeActivation');
const { resolveServersForSave, configNeedsServerReboot } = require('../setupConfigMerge.cjs');
const { createBoundSourcePublication } = require('../boundSourcePublication.cjs');
const localIngressController = require('../localIngressController');
const exportIngress = require('../exportIngress');
const { encodeEnvelope } = require('../exportEnvelope');
const { writeStrictPair } = require('../replicaPairContract.cjs');

const mainPath = path.join(__dirname, '..', 'main.js');
const source = fs.readFileSync(mainPath, 'utf8');
const ast = ts.createSourceFile(mainPath, source, ts.ScriptTarget.Latest, true);

function productionFunction(name) {
    const node = ast.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
    if (!node) throw new Error(`Missing production function ${name}`);
    return node.getText(ast);
}

function productionHandle(channel) {
    const node = ast.statements.find((statement) => {
        if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) return false;
        const call = statement.expression;
        return ts.isIdentifier(call.expression) && call.expression.text === 'registerTrustedHandle' &&
            ts.isStringLiteral(call.arguments[0]) && call.arguments[0].text === channel;
    });
    if (!node) throw new Error(`Missing production handle ${channel}`);
    return node.getText(ast);
}

test('fresh approval survives a new app process and boots the exact committed replica', async () => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'farmdash-approved-restart-'));
    try {
        let diskConfig;
        const store = () => ({
            get: (key) => key === 'config' ? (diskConfig && JSON.parse(JSON.stringify(diskConfig))) : undefined,
            set: (key, value) => {
                if (key !== 'config') throw new Error(`Unexpected store write ${key}`);
                diskConfig = JSON.parse(JSON.stringify(value));
            },
        });
        const session = {
            schema: '1', pendingId: '0123456789abcdef', serverKey: 'ally-pair-key',
            careerId: 'ally-career-1', sourceSlot: 'savegame3',
            mapTitle: 'Witcombe', serverName: 'Ally',
        };
        session.check = pendingReplicaSession.pendingCheck(session);
        const pendingFile = pendingReplicaSession.pendingPathFor(profile);
        fs.mkdirSync(path.dirname(pendingFile), { recursive: true });
        fs.writeFileSync(pendingFile, `<farmDashboardPendingSession ${Object.entries(session)
            .map(([key, value]) => `${key}="${value}"`).join(' ')}/>\n`);

        const handles = {};
        const firstBoot = jest.fn(async () => ({ applied: true }));
        const firstProcess = vm.createContext({
            console, store: store(), path, replicaRegistration, pendingReplicaSession,
            declinedPendingIds: new Set(), getFs25DocumentsRoot: () => profile,
            resolveServersForSave, configNeedsServerReboot,
            runtimeActivation: runtimeActivation.createScope(), bootServer: firstBoot,
            setupSaveOutcome: (result) => result,
            registerTrustedHandle: (channel, handler) => { handles[channel] = handler; },
        });
        vm.runInContext([
            productionFunction('applyFarmdashSetupConfig'),
            productionFunction('pendingReplicaState'),
            productionHandle('approve-pending-replica-session'),
        ].join('\n'), firstProcess);
        const approved = await handles['approve-pending-replica-session']({}, session.pendingId);
        expect(approved.ok).toBe(true);
        expect(firstBoot).toHaveBeenCalledTimes(1);
        expect(diskConfig.isConfigured).toBe(true);
        const linked = diskConfig.servers[0];
        expect(linked.replicaRegistration).toEqual({ remoteSlot: session.sourceSlot, sessionPairing: session.serverKey });
        expect(replicaRegistration.validateSnapshot(diskConfig.servers).ok).toBe(true);

        const replicaDir = path.join(profile, 'modSettings', 'FS25_FarmDashboard', 'replicas', linked.id);
        fs.mkdirSync(replicaDir, { recursive: true });
        const envelope = encodeEnvelope(JSON.stringify({ vehicles: [{ id: 'ally-tractor' }] }), {
            careerId: session.careerId, sessionId: 'ally-session-1',
            publicationSequence: 1, exportGeneration: 1, simulationTimeMs: 10,
        });
        writeStrictPair(replicaDir, envelope, {
            sourceId: linked.id, sourceSlot: session.sourceSlot,
            connectionEpoch: '1', slot: 'a', replicaRevision: 1,
        });

        const boundSources = createBoundSourcePublication({
            sameBinding: (before, after) => !configNeedsServerReboot({ servers: [before] }, { servers: [after] }),
        });
        const selected = [];
        const bootCalls = [];
        const secondProcess = vm.createContext({
            console, path, __dirname: path.dirname(mainPath), store: store(), replicaRegistration,
            getFs25DocumentsRoot: () => profile,
            runtimeActivation: runtimeActivation.createScope(), boundSources,
            broadcastSourceState: () => {}, stopAllWatchers: async () => {}, serverStates: {},
            isLocalModeServer: (row) => row?.mode === 'local',
            resolveLocalWatchParts: (row) => ({ basePath: row.localPath, folderName: row.localSubFolder }),
            pathExists: async (target) => fs.existsSync(target),
            hydrateServerCacheFromDisk: jest.fn(),
            hydrateLuaSnapshotFromDiskAtBoot: async () => {},
            startLocalWatching: async (row) => {
                const route = localIngressController.selectIngress(row,
                    { basePath: row.localPath, folderName: row.localSubFolder }, fs.existsSync);
                selected.push({ route, ingress: exportIngress.ingestWatchedSlot(route.dir, {
                    sourceId: row.id, configuredSlot: route.configuredSlot,
                }) });
                return { status: 'armed' };
            },
            startFtpPollingCoordinator: () => {}, startVanillaFillTypeHudWarmup: () => {},
            shouldLoadDashboardUrl: () => false,
            server: { listening: false },
            listenFarmdashHttp: (_address, onReady) => { secondProcess.server.listening = true; onReady(); },
            getLanBindAddress: () => '127.0.0.1', PORT: 8768,
            mainWindow: null,
            ensureSetupWriteToken: () => {},
            editionPolicy: { windowTitle: () => 'Farm Dashboard V5' },
            PRODUCT_LINE: 'rf', FARMDASH_DEV: false,
            BrowserWindow: class { constructor() { this.webContents = { on() {} }; } },
            attachEditContextMenu: () => {}, isRfProductLine: () => false,
        });
        vm.runInContext([
            productionFunction('hasRecoverablePersistedReplica'),
            productionFunction('bootServer'),
            productionFunction('createWindow'),
        ].join('\n'), secondProcess);
        const actualBoot = secondProcess.bootServer;
        secondProcess.bootServer = (...args) => {
            const task = actualBoot(...args);
            bootCalls.push(task);
            return task;
        };
        secondProcess.createWindow();
        expect(bootCalls).toHaveLength(1);
        await bootCalls[0];
        expect(secondProcess.server.listening).toBe(true);
        expect(selected).toHaveLength(1);
        expect(selected[0].route.kind).toBe('replica');
        expect(path.normalize(selected[0].route.dir)).toBe(path.normalize(replicaDir));
        expect(selected[0].ingress.status).toBe('replica');
        expect(selected[0].ingress.identity).toMatchObject({
            sourceId: linked.id, sourceSlot: session.sourceSlot, careerId: session.careerId,
        });
        expect(boundSources.snapshot(linked.id).sourceBinding).not.toBeNull();

        // Simulate a profile written by the older approval path, with its setup HTTP listener still idle.
        const olderConfig = { ...diskConfig, isConfigured: false };
        async function launchWith(config) {
            const boot = jest.fn(async () => ({ registrationReady: true, applied: false, scheduled: true }));
            const launch = vm.createContext({
                path, replicaRegistration, getFs25DocumentsRoot: () => profile,
                store: { get: () => config }, server: { listening: true },
                runtimeActivation: runtimeActivation.createScope(),
                isTrustedDashboardIpcSender: () => true,
                launchDashboardInFlight: null, bootServer: boot,
                waitForDashboardNavigation: jest.fn(async () => {}), PORT: 8768,
            });
            vm.runInContext([
                productionFunction('hasRecoverablePersistedReplica'),
                productionFunction('launchDashboardFromIpc'),
            ].join('\n'), launch);
            return { result: await launch.launchDashboardFromIpc({}), boot };
        }
        const recovered = await launchWith(olderConfig);
        expect(recovered.result).toMatchObject({ ok: true, stage: 'ready' });
        expect(recovered.boot).toHaveBeenCalledWith(olderConfig, { deferHydrate: true });
        for (const invalid of [
            { ...olderConfig, servers: [{ ...linked, replicaRegistration: undefined }] },
            { ...olderConfig, servers: [{ ...linked, replicaRemoteSlot: 'savegame4' }] },
            { ...olderConfig, servers: [{ ...linked, localPath: path.join(profile, 'other') }] },
        ]) {
            const rejected = await launchWith(invalid);
            expect(rejected.result).toMatchObject({ ok: false, error: 'not_configured' });
            expect(rejected.boot).not.toHaveBeenCalled();
        }
    } finally {
        if (path.dirname(profile) === os.tmpdir() && path.basename(profile).startsWith('farmdash-approved-restart-')) {
            fs.rmSync(profile, { recursive: true, force: true });
        }
    }
});
