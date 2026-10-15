'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { productionFunctions } = require('./helpers/production-source.cjs');
const { encodeEnvelope } = require('../exportEnvelope');
const exportIngress = require('../exportIngress');
const localIngressController = require('../localIngressController');

let mockUserData;
jest.mock('electron', () => ({ app: { getPath: () => mockUserData } }), { virtual: true });
const collector = require('../xmlCollector');

describe('replica XML source isolation', () => {
    let root;
    let dashboard;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'farmhub-replica-xml-'));
        mockUserData = path.join(root, 'userData');
        dashboard = path.join(root, 'modSettings', 'FS25_FarmDashboard');
        fs.mkdirSync(dashboard, { recursive: true });
        fs.mkdirSync(mockUserData, { recursive: true });
        const localSave = path.join(root, 'savegame1');
        fs.mkdirSync(localSave);
        fs.writeFileSync(path.join(localSave, 'careerSavegame.xml'),
            '<careerSavegame><savegameName>UNRELATED-PC</savegameName></careerSavegame>');
    });

    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    test('same-slot replica cannot resolve, fingerprint, or collect the local PC XML', async () => {
        const replica = { id: 'mp-source', mode: 'local', localPath: dashboard,
            localSubFolder: 'savegame1', replicaRemoteSlot: 'savegame1' };
        expect(collector.getSavegamePath(replica, 'savegame1')).toBeNull();
        expect(await collector.getSavegamePathAsync(replica, 'savegame1')).toBeNull();
        expect(await collector.getSavegameXmlFingerprint(replica, 'savegame1')).toBeNull();
        expect(await collector.collectXmlData(replica, 'savegame1')).toBeNull();

        const ingressOnly = { id: 'mp-source', mode: 'local', localPath: dashboard,
            localSubFolder: 'savegame1' };
        expect(await collector.getSavegamePathAsync(ingressOnly, 'savegame1', 'replica')).toBeNull();
        expect(await collector.collectXmlData(ingressOnly, 'savegame1', 'replica')).toBeNull();
    });

    test('true local and dedicated FTP still collect their own XML', async () => {
        const local = { id: 'local-source', mode: 'local', localPath: dashboard, localSubFolder: 'savegame1' };
        expect(await collector.getSavegamePathAsync(local, 'savegame1')).toBe(path.join(root, 'savegame1'));
        expect((await collector.collectXmlData(local, 'savegame1')).career.savegameName).toBe('UNRELATED-PC');

        const ftp = { id: 'ftp-source', mode: 'ftp', localSubFolder: 'savegame1' };
        const ftpDir = path.join(mockUserData, 'ftpXmlCache', ftp.id, 'savegame1');
        fs.mkdirSync(ftpDir, { recursive: true });
        fs.writeFileSync(path.join(ftpDir, 'careerSavegame.xml'),
            '<careerSavegame><savegameName>DEDICATED-FTP</savegameName></careerSavegame>');
        expect(await collector.getSavegamePathAsync(ftp, 'savegame1')).toBe(ftpDir);
        expect((await collector.collectXmlData(ftp, 'savegame1')).career.savegameName).toBe('DEDICATED-FTP');
    });

    test('poll drops wrong XML and held merge, then leaves replica Lua only', async () => {
        const replica = { id: 'mp-source', mode: 'local', localPath: dashboard,
            localSubFolder: 'savegame1', replicaRemoteSlot: 'savegame1' };
        const state = { ingressKind: 'replica', luaData: { savegameName: 'CURRENT-MP' },
            xmlData: { career: { savegameName: 'UNRELATED-PC' } },
            lastXmlReceivedAt: 'old', lastXmlFingerprint: 'old',
            mergedData: { savegameName: 'UNRELATED-PC' },
            lastGoodMergedSnapshot: { savegameName: 'UNRELATED-PC' },
            liveSectionBackup: { fields: [{ id: 42 }] }, fieldLiveCache: { 42: {} }, fieldHistory: { 42: {} } };
        const serverStates = { 'mp-source': state };
        const rebuildMerged = jest.fn(async () => {
            state.mergedData = { ...state.luaData, xmlAvailable: !!state.xmlData };
        });
        const fingerprint = jest.fn(collector.getSavegameXmlFingerprint);
        const collect = jest.fn(collector.collectXmlData);
        const api = productionFunctions('FS25_FarmDashboard_App/main.js',
            ['clearUnprovenReplicaXml', 'triggerXmlPoll'], {
                serverStates, store: { get: () => ({ servers: [replica] }) },
                boundSources: { clearOwned: () => null },
                isExplicitReplicaXmlSource: collector.isExplicitReplicaXmlSource,
                getSavegameXmlFingerprint: fingerprint, collectXmlData: collect,
                rebuildMerged, hasHttpFeed: () => false,
            });
        await api.triggerXmlPoll('mp-source');
        expect(fingerprint).not.toHaveBeenCalled();
        expect(collect).not.toHaveBeenCalled();
        expect(state.xmlData).toBeNull();
        expect(state.lastXmlReceivedAt).toBeNull();
        expect(state.lastXmlFingerprint).toBeNull();
        expect(state.lastGoodMergedSnapshot).toBeNull();
        expect(state.liveSectionBackup).toBeNull();
        expect(state.fieldLiveCache).toEqual({});
        expect(state.fieldHistory).toEqual({});
        expect(state.mergedData).toEqual({ savegameName: 'CURRENT-MP', xmlAvailable: false });
        expect(rebuildMerged).toHaveBeenCalledTimes(1);
        await api.triggerXmlPoll('mp-source');
        expect(rebuildMerged).toHaveBeenCalledTimes(1);
        state.xmlData = { career: { savegameName: 'LATE-PC' } };
        state.lastXmlReceivedAt = 'late';
        state.lastXmlFingerprint = 'late';
        state.mergedData = { savegameName: 'LATE-PC' };
        await api.triggerXmlPoll('mp-source');
        expect(state.xmlData).toBeNull();
        expect(state.mergedData).toEqual({ savegameName: 'CURRENT-MP', xmlAvailable: false });
        expect(rebuildMerged).toHaveBeenCalledTimes(2);
    });

    test('delayed local poll cannot commit into a replaced replica state with the same ID', async () => {
        const id = 'shared-source';
        const oldRow = { id, mode: 'local', localPath: dashboard, localSubFolder: 'savegame1' };
        const newRow = { ...oldRow, replicaRegistration: { remoteSlot: 'savegame1' } };
        const oldState = { active: true, ingressKind: 'authority', xmlData: null, activationGeneration: 1 };
        const newState = { active: true, ingressKind: 'replica', xmlData: null, activationGeneration: 2 };
        const serverStates = { [id]: oldState };
        const memory = { config: { servers: [oldRow] } };
        let started;
        let finishCollection;
        const collectionStarted = new Promise((resolve) => { started = resolve; });
        const rebuildMerged = jest.fn();
        const api = productionFunctions('FS25_FarmDashboard_App/main.js',
            ['clearUnprovenReplicaXml', 'triggerXmlPoll'], {
                serverStates, store: { get: () => memory.config },
                isExplicitReplicaXmlSource: collector.isExplicitReplicaXmlSource,
                getSavegameXmlFingerprint: async () => 'old-fingerprint',
                collectXmlData: () => { started(); return new Promise((resolve) => { finishCollection = resolve; }); },
                rebuildMerged, hasHttpFeed: () => false,
            });
        const poll = api.triggerXmlPoll(id);
        await collectionStarted;
        memory.config = { servers: [newRow] };
        serverStates[id] = newState;
        finishCollection({ career: { savegameName: 'UNRELATED-PC' } });
        await poll;
        expect(oldState.xmlData).toBeNull();
        expect(newState.xmlData).toBeNull();
        expect(rebuildMerged).not.toHaveBeenCalled();
    });

    test('delayed old-source merge cannot publish after same-ID activation replacement', async () => {
        const id = 'shared-source';
        const oldRow = { id, mode: 'local', localPath: dashboard, localSubFolder: 'savegame1' };
        const newRow = { ...oldRow, replicaRegistration: { remoteSlot: 'savegame1' } };
        const oldState = { active: true, activationGeneration: 1,
            luaData: { savegameName: 'OLD-LOCAL' }, xmlData: { career: { savegameName: 'UNRELATED-PC' } } };
        const newState = { active: true, activationGeneration: 2,
            luaData: { savegameName: 'CURRENT-MP' }, xmlData: null, mergedData: null };
        const serverStates = { [id]: oldState };
        const rows = [oldRow];
        let started;
        let finishHydration;
        const hydrationStarted = new Promise((resolve) => { started = resolve; });
        const mergeData = jest.fn();
        const broadcast = jest.fn();
        const api = productionFunctions('FS25_FarmDashboard_App/main.js', ['rebuildMerged'], {
            serverStates, getServersFromStore: () => rows,
            SESSION_USER_DATA_DIR: mockUserData,
            isLocalModeServer: () => true,
            getLocalLuaJsonPathForServer: () => null,
            hydrateLuaDataAnimalsFromDetailsAsync: () => {
                started();
                return new Promise((resolve) => { finishHydration = resolve; });
            },
            app: { getPath: () => mockUserData }, mergeData, broadcast,
        });
        const merge = api.rebuildMerged(id);
        await hydrationStarted;
        rows[0] = newRow;
        serverStates[id] = newState;
        finishHydration(oldState.luaData);
        await merge;
        expect(mergeData).not.toHaveBeenCalled();
        expect(broadcast).not.toHaveBeenCalled();
        expect(newState.mergedData).toBeNull();
    });

    test('restart rejects untyped and replica caches before ingress, including renderer fallback', () => {
        const srv = { id: 'mp-source', mode: 'local', localPath: dashboard,
            localSubFolder: 'savegame1' };
        const replicaDir = path.join(dashboard, 'replicas', srv.id);
        fs.mkdirSync(replicaDir, { recursive: true });
        fs.writeFileSync(path.join(replicaDir, 'selected.xml'), '<pending/>');
        const stale = { mergedSnapshot: { savegameName: 'UNRELATED-PC' }, lastXmlAt: 'old' };
        const state = { active: true, mergedData: null };
        const serverStates = { [srv.id]: state };
        const broadcast = jest.fn();
        const loadServerCache = jest.fn(() => stale);
        const source = productionFunctions('FS25_FarmDashboard_App/main.js', [
            'resolveServerLocalPath', 'resolveLocalWatchParts', 'localCacheSourceProof',
            'localCacheSourceEligible', 'hydrateServerCacheFromDisk',
            'readServerLiveCacheForRenderer',
        ], {
            serverStates, getServersFromStore: () => [srv],
            isExplicitReplicaXmlSource: collector.isExplicitReplicaXmlSource,
            localIngressController, exportIngress, fs,
            getFs25DocumentsRoot: () => root,
            loadServerCache, app: { getPath: () => mockUserData }, broadcast,
            SESSION_USER_DATA_DIR: mockUserData,
        });

        source.hydrateServerCacheFromDisk(srv.id);
        expect(state.mergedData).toBeNull();
        expect(broadcast).not.toHaveBeenCalled();
        expect(source.readServerLiveCacheForRenderer(srv.id)).toMatchObject({ ok: false });

        stale.sourceProof = { kind: 'authority', sourceId: srv.id,
            careerId: 'old-career', sessionId: 'old-session', configuredSlot: 'savegame1' };
        source.hydrateServerCacheFromDisk(srv.id);
        expect(state.mergedData).toBeNull();
        expect(source.readServerLiveCacheForRenderer(srv.id)).toMatchObject({ ok: false, error: 'source_unconfirmed' });
    });

    test('matching authority cache remains available to a true local source', () => {
        const srv = { id: 'local-source', mode: 'local', localPath: dashboard,
            localSubFolder: 'savegame1' };
        const authorityDir = path.join(dashboard, 'savegame1');
        fs.mkdirSync(path.join(authorityDir, 'career-a'), { recursive: true });
        fs.writeFileSync(path.join(authorityDir, 'career-a', 'slot-a.xml'),
            encodeEnvelope(JSON.stringify({ savegameName: 'LOCAL-A', serverInfo: { saveSlot: 'savegame1' } }), {
                careerId: 'career-a', sessionId: 'session-a',
                publicationSequence: 1, exportGeneration: 1, simulationTimeMs: 10,
            }));
        fs.writeFileSync(path.join(authorityDir, 'active.xml'),
            '<farmDashboardRoute schema="1" careerId="career-a" sessionId="session-a" publicationSequence="1" slot="a" persistence="saved" sourceSlot="savegame1"/>');
        const ingress = exportIngress.ingestWatchedSlot(authorityDir,
            { sourceId: srv.id, configuredSlot: 'savegame1' });
        expect(ingress.status).toBe('valid');
        const state = { exportIdentity: { ...ingress.identity, sourceId: srv.id, authoritative: true } };
        const record = { mergedSnapshot: { savegameName: 'LOCAL-A' } };
        const serverStates = { [srv.id]: state };
        const source = productionFunctions('FS25_FarmDashboard_App/main.js', [
            'resolveServerLocalPath', 'resolveLocalWatchParts', 'localCacheSourceProof',
            'localCacheSourceEligible', 'readServerLiveCacheForRenderer',
        ], {
            serverStates, getServersFromStore: () => [srv],
            isExplicitReplicaXmlSource: collector.isExplicitReplicaXmlSource,
            localIngressController, exportIngress, fs,
            getFs25DocumentsRoot: () => root,
            loadServerCache: () => record,
            app: { getPath: () => mockUserData },
            SESSION_USER_DATA_DIR: mockUserData,
        });
        record.sourceProof = source.localCacheSourceProof(srv.id, state);
        expect(record.sourceProof).toMatchObject({ kind: 'authority', sourceId: srv.id });
        expect(source.localCacheSourceEligible(srv, null, record)).toBe(true);
        expect(source.readServerLiveCacheForRenderer(srv.id)).toMatchObject({
            ok: true, data: { savegameName: 'LOCAL-A' },
        });
        fs.unlinkSync(path.join(authorityDir, 'active.xml'));
        const replicaDir = path.join(dashboard, 'replicas', srv.id);
        fs.mkdirSync(replicaDir, { recursive: true });
        fs.writeFileSync(path.join(replicaDir, 'selected.xml'), '<pending/>');
        expect(source.readServerLiveCacheForRenderer(srv.id)).toMatchObject({
            ok: false, error: 'source_unconfirmed',
        });
    });
});
