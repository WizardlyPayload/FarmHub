'use strict';

const fs = require('fs');
const path = require('path');
const { createBoundSourcePublication, ownsOrigin, statusForPayload } = require('../boundSourcePublication.cjs');
const { configNeedsServerReboot } = require('../setupConfigMerge.cjs');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

function registry() {
  let tick = 0;
  let nextId = 0;
  return createBoundSourcePublication({
    sameBinding: (before, after) => !configNeedsServerReboot({ servers: [before] }, { servers: [after] }),
    now: () => new Date(Date.UTC(2026, 9, 9, 12, 0, tick++)),
    randomId: () => `opaque-${++nextId}`,
  });
}

function source(overrides = {}) {
  return { id: 'farm-a', name: 'Farm A', enabled: true, localPath: 'C:/private/save-a', ...overrides };
}

function state(generation, overrides = {}) {
  return {
    active: true,
    activationGeneration: generation,
    exportIdentity: {
      sourceId: 'farm-a', careerId: 'career-a', sessionId: 'session-a',
      publicationSequence: 11, exportGeneration: 4, legacy: false,
    },
    ...overrides,
  };
}

function exportedFunction(name, nextMarker, injected) {
  const start = mainSource.indexOf(`function ${name}(`);
  const end = mainSource.indexOf(nextMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const names = Object.keys(injected);
  return new Function(...names, `${mainSource.slice(start, end)}; return ${name};`)(...Object.values(injected));
}

describe('bound source publication', () => {
  test('one immutable record backs server row, flat API data, and WS frame', () => {
    const boundSources = registry();
    boundSources.beginActivation([source()], 1);
    const liveState = state(1);
    boundSources.attach('farm-a', liveState, 1);
    const visible = { serverId: 'farm-a', currentMoney: 123, mapTitle: 'Published map' };
    const publication = boundSources.publish('farm-a', liveState, 1, visible);
    expect(publication.changed).toBe(true);
    expect(publication.sourceBinding).toEqual({
      bindingId: 'opaque-1', stateRevision: 2, stateStatus: 'snapshot',
      publishedAt: expect.any(String),
      exportIdentity: {
        careerId: 'career-a', sessionId: 'session-a',
        publicationSequence: 11, exportGeneration: 4,
      },
    });
    expect(Object.isFrozen(publication.payload)).toBe(true);
    visible.currentMoney = 999;
    expect(boundSources.snapshot('farm-a').payload.currentMoney).toBe(123);

    const projectConfiguredServerRow = exportedFunction('projectConfiguredServerRow', 'function configuredServerList(', {
      boundSources,
      labelText: (value) => value || '',
      looksLikeSaveSlotId: () => false,
      usesDefaultCareerProfile: () => false,
      peekCareerSaveLabels: () => ({}),
    });
    const row = projectConfiguredServerRow(source(), {
      mergedData: { mapTitle: 'Unpublished map', currentMoney: 999 },
      configWarning: null,
    });
    expect(row.sourceBinding).toEqual(publication.sourceBinding);
    expect(JSON.stringify(row)).not.toContain('Unpublished map');

    const routes = {};
    const routeSource = mainSource.slice(
      mainSource.indexOf("expressApp.get('/api/data'"),
      mainSource.indexOf("expressApp.get('/api/animals'"),
    );
    expect(routeSource).toContain('boundSources.snapshot(sid)');
    new Function('expressApp', 'resolveServerIdForRequest', 'boundSources', 'console', routeSource)(
      { get: (route, handler) => { routes[route] = handler; } },
      () => 'farm-a', boundSources, console,
    );
    let response;
    routes['/api/data']({ query: {} }, { json: (value) => { response = value; } });
    expect(response.currentMoney).toBe(123);
    expect(response.sourceBinding).toEqual(publication.sourceBinding);

    const clients = new Set([{ readyState: 1, send: (frame) => { response = JSON.parse(frame); } }]);
    const broadcast = exportedFunction('broadcast', '\nfunction ', {
      boundSources,
      cloneMergedDataWithFieldExclusions: (data) => data,
      lastBroadcastHashByServer: {}, clients, WebSocket: { OPEN: 1 }, statusForPayload,
    });
    // A later visible transition uses the same bound record in the WS envelope.
    broadcast('farm-a', { serverId: 'farm-a', currentMoney: 124, mapTitle: 'Published map' }, liveState);
    expect(response.type).toBe('data');
    expect(response.sourceBinding).toEqual(boundSources.snapshot('farm-a').sourceBinding);
    expect(response.data.sourceBinding).toEqual(response.sourceBinding);
    expect(response.data.currentMoney).toBe(124);
  });

  test('duplicate reads do not advance revision; held and cache presentation do', () => {
    const boundSources = registry();
    boundSources.beginActivation([source()], 1);
    const liveState = state(1);
    boundSources.attach('farm-a', liveState, 1);
    const payload = { serverId: 'farm-a', value: 1 };
    const first = boundSources.publish('farm-a', liveState, 1, payload);
    const duplicate = boundSources.publish('farm-a', liveState, 1, { ...payload });
    expect(duplicate.changed).toBe(false);
    expect(duplicate.sourceBinding).toEqual(first.sourceBinding);
    const held = boundSources.publish('farm-a', liveState, 1,
      { ...payload, dataTimestamps: { confidence: 'held' } });
    expect(held.sourceBinding.exportIdentity).toEqual(first.sourceBinding.exportIdentity);
    expect(held.sourceBinding.stateRevision).toBeGreaterThan(first.sourceBinding.stateRevision);
    expect(held.sourceBinding.stateStatus).toBe('held');
    const cache = boundSources.publish('farm-a', liveState, 1,
      { ...payload, dataTimestamps: { source: 'cache' } });
    expect(cache.sourceBinding.stateRevision).toBeGreaterThan(held.sourceBinding.stateRevision);
    expect(cache.sourceBinding.stateStatus).toBe('cache');
  });

  test('transport clock noise does not renew a revision, but visible, provenance and export changes do', () => {
    const boundSources = registry();
    boundSources.beginActivation([source()], 1);
    const liveState = state(1);
    boundSources.attach('farm-a', liveState, 1);
    const base = {
      value: 1,
      lastUpdated: '2026-10-09T12:00:00.000Z',
      transportTimestamp: '2026-10-09T12:00:00.000Z',
      responseTimestamp: '2026-10-09T12:00:00.000Z',
      dataTimestamps: {
        mergeComputedAt: '2026-10-09T12:00:00.000Z',
        fetchedAt: '2026-10-09T12:00:00.000Z',
        lastPolledAt: '2026-10-09T12:00:00.000Z',
        lastReadAt: '2026-10-09T12:00:00.000Z',
        lastCheckedAt: '2026-10-09T12:00:00.000Z',
        lastMergedAt: '2026-10-09T12:00:00.000Z',
        lastLuaReceivedAt: '2026-10-09T11:59:00.000Z',
      },
    };
    const first = boundSources.publish('farm-a', liveState, 1, base);
    const clockOnly = boundSources.publish('farm-a', liveState, 1, {
      ...base,
      lastUpdated: '2026-10-09T12:00:01.000Z',
      transportTimestamp: '2026-10-09T12:00:01.000Z',
      responseTimestamp: '2026-10-09T12:00:01.000Z',
      dataTimestamps: {
        ...base.dataTimestamps,
        mergeComputedAt: '2026-10-09T12:00:01.000Z',
        fetchedAt: '2026-10-09T12:00:01.000Z',
        lastPolledAt: '2026-10-09T12:00:01.000Z',
        lastReadAt: '2026-10-09T12:00:01.000Z',
        lastCheckedAt: '2026-10-09T12:00:01.000Z',
        lastMergedAt: '2026-10-09T12:00:01.000Z',
      },
    });
    expect(clockOnly.changed).toBe(false);
    expect(clockOnly.sourceBinding).toEqual(first.sourceBinding);
    expect(clockOnly.payload).toEqual(first.payload);
    const realChange = boundSources.publish('farm-a', liveState, 1, { ...base, value: 2 });
    expect(realChange.changed).toBe(true);
    expect(realChange.sourceBinding.stateRevision).toBe(first.sourceBinding.stateRevision + 1);
    const provenanceChange = boundSources.publish('farm-a', liveState, 1, {
      ...base, value: 2,
      dataTimestamps: { ...base.dataTimestamps, lastLuaReceivedAt: '2026-10-09T12:00:02.000Z' },
    });
    expect(provenanceChange.sourceBinding.stateRevision).toBe(realChange.sourceBinding.stateRevision + 1);
    liveState.exportIdentity = { ...liveState.exportIdentity, exportGeneration: 5 };
    const newExport = boundSources.publish('farm-a', liveState, 1, provenanceChange.payload);
    expect(newExport.sourceBinding.stateRevision).toBe(provenanceChange.sourceBinding.stateRevision + 1);
    expect(newExport.sourceBinding.exportIdentity.exportGeneration).toBe(5);
  });

  test.each([
    ['cache confidence', { dataTimestamps: { confidence: 'cache' } }, 'cache'],
    ['cache fallback', { dataTimestamps: { cacheUsedDueToFailure: true } }, 'cache'],
    ['cache restore', { dataTimestamps: { loadedFromDiskCacheAt: '2026-10-09T12:00:00Z' } }, 'cache'],
    ['cache source', { dataTimestamps: { source: 'cache' } }, 'cache'],
    ['held confidence', { dataTimestamps: { confidence: 'held' } }, 'held'],
    ['stale confidence', { dataTimestamps: { confidence: 'stale' } }, 'held'],
    ['unconfirmed confidence', { dataTimestamps: { confidence: 'unconfirmed' } }, 'held'],
    ['stale timestamp flag', { dataTimestamps: { isStale: true } }, 'held'],
    ['stale payload flag', { isStale: true }, 'held'],
    ['error payload', { error: 'read failed' }, 'held'],
    ['fresh payload', { dataTimestamps: { confidence: 'live' } }, 'snapshot'],
  ])('%s maps to %s state', (_label, payload, expected) => {
    expect(statusForPayload(state(1), payload)).toBe(expected);
  });

  test('blocked state overrides cache, stale and error payload hints', () => {
    expect(statusForPayload(state(1, { active: false }), {
      error: 'read failed', dataTimestamps: { confidence: 'cache', isStale: true },
    })).toBe('blocked');
  });

  test('validated replica survives a missing authority folder as held in API and WS', () => {
    const boundSources = registry();
    boundSources.beginActivation([source()], 1);
    const liveState = state(1, {
      configWarning: { code: 'localSubFolderMissing', expected: 'C:/private/missing' },
    });
    boundSources.attach('farm-a', liveState, 1);
    boundSources.clearOwned(liveState, 'blocked');
    liveState.exportIngress = {
      status: 'replica', replica: true, legacy: false, payload: { currentMoney: 123 },
      identity: { ...liveState.exportIdentity, replica: true, configuredSlot: 'savegame7' },
    };
    liveState.exportIdentity = {
      ...liveState.exportIdentity, replica: true, ingressStatus: 'replica', configuredSlot: 'savegame7',
    };
    const payload = {
      serverId: 'farm-a', currentMoney: 123,
      dataTimestamps: { confidence: 'held', lastLuaReceivedAt: '2026-10-09T02:00:24.000Z' },
    };
    const frames = [];
    const broadcast = exportedFunction('broadcast', '\nfunction ', {
      boundSources, cloneMergedDataWithFieldExclusions: (data) => data,
      lastBroadcastHashByServer: {},
      clients: new Set([{ readyState: 1, send: (frame) => frames.push(JSON.parse(frame)) }]),
      WebSocket: { OPEN: 1 }, statusForPayload,
    });
    broadcast('farm-a', payload, liveState);
    const published = boundSources.snapshot('farm-a');
    expect(published.sourceBinding.stateStatus).toBe('held');
    expect(published.sourceBinding.exportIdentity).toMatchObject({
      publicationSequence: 11, exportGeneration: 4,
    });
    expect(published.payload.dataTimestamps.lastLuaReceivedAt).toBe('2026-10-09T02:00:24.000Z');
    expect(frames).toHaveLength(1);
    expect(frames[0].sourceBinding).toEqual(published.sourceBinding);
    expect(frames[0].data.currentMoney).toBe(123);

    const routes = {};
    const routeSource = mainSource.slice(
      mainSource.indexOf("expressApp.get('/api/data'"),
      mainSource.indexOf("expressApp.get('/api/animals'"),
    );
    new Function('expressApp', 'resolveServerIdForRequest', 'boundSources', 'console', routeSource)(
      { get: (route, handler) => { routes[route] = handler; } },
      () => 'farm-a', boundSources, console,
    );
    let response;
    routes['/api/data']({ query: {} }, { json: (value) => { response = value; } });
    expect(response.currentMoney).toBe(123);
    expect(response.sourceBinding).toEqual(published.sourceBinding);

    liveState.exportIngress = {
      ...liveState.exportIngress,
      identity: { ...liveState.exportIngress.identity, publicationSequence: 12, exportGeneration: 5 },
    };
    liveState.exportIdentity = {
      ...liveState.exportIdentity, publicationSequence: 12, exportGeneration: 5,
    };
    broadcast('farm-a', {
      ...payload, dataTimestamps: { confidence: 'live', lastLuaReceivedAt: '2026-10-09T03:00:24.000Z' },
    }, liveState);
    expect(frames).toHaveLength(2);
    expect(frames[1].sourceBinding.stateStatus).toBe('snapshot');
    expect(frames[1].sourceBinding.exportIdentity.exportGeneration).toBe(5);
  });

  test('missing authority never publishes an absent or untrusted replica', () => {
    const boundSources = registry();
    boundSources.beginActivation([source()], 1);
    const validState = state(1, {
      configWarning: { code: 'localSubFolderMissing' },
      exportIngress: {
        status: 'replica', replica: true, legacy: false, payload: { currentMoney: 123 },
        identity: {
          sourceId: 'farm-a', careerId: 'career-a', sessionId: 'session-a',
          publicationSequence: 11, exportGeneration: 4, configuredSlot: 'savegame7',
        },
      },
    });
    validState.exportIdentity = {
      ...validState.exportIdentity, replica: true, ingressStatus: 'replica', configuredSlot: 'savegame7',
    };
    boundSources.attach('farm-a', validState, 1);
    const payload = { serverId: 'farm-a', dataTimestamps: { confidence: 'live' } };
    expect(statusForPayload(validState, null)).toBe('blocked');
    for (const altered of [
      { exportIngress: null },
      { exportIngress: { ...validState.exportIngress, status: 'unavailable' } },
      { exportIngress: { ...validState.exportIngress, status: 'last-known' } },
      { exportIngress: { ...validState.exportIngress, legacy: true } },
      { exportIngress: { ...validState.exportIngress, identity: {
        ...validState.exportIngress.identity, sourceId: 'other-source',
      } } },
      { exportIngress: { ...validState.exportIngress, identity: {
        ...validState.exportIngress.identity, configuredSlot: 'savegame8',
      } } },
      { exportIngress: { ...validState.exportIngress, identity: {
        ...validState.exportIngress.identity, exportGeneration: 5,
      } } },
      { exportIdentity: { ...validState.exportIdentity, replica: false } },
      { configWarning: { code: 'registration-recovery-required' } },
      { configWarning: { code: 'configuration-required' } },
      { active: false },
    ]) {
      expect(statusForPayload({ ...validState, ...altered }, payload)).toBe('blocked');
    }
    expect(statusForPayload(validState, payload)).toBe('snapshot');
  });

  test('display-only saves retain binding; routing changes rotate it without exposing configuration', () => {
    const boundSources = registry();
    const privateSource = source({
      localPath: 'C:/CANARY_PRIVATE_PATH', ftpHost: 'CANARY_ENDPOINT',
      ftpUsername: 'CANARY_USERNAME', ftpPassword: 'CANARY_PASSWORD',
      pairingKey: 'CANARY_TOKEN',
    });
    const initialEvent = boundSources.beginActivation([privateSource], 1)[0];
    const firstId = initialEvent.sourceBinding.bindingId;
    expect(JSON.stringify(initialEvent)).not.toMatch(/CANARY_|secretRevision/i);
    const same = boundSources.beginActivation([{ ...privateSource, name: 'Renamed farm' }], 2)[0];
    expect(same.sourceBinding.bindingId).toBe(firstId);
    let priorId = same.sourceBinding.bindingId;
    for (const change of [
      { enabled: false }, { replicaRemoteSlot: 'other-slot' },
      { ftpSavegameRemoteDir: '/other-directory' }, { localPath: 'C:/another' },
    ]) {
      const changed = boundSources.beginActivation([{ ...privateSource, ...change }], 3)[0];
      expect(changed.sourceBinding.bindingId).not.toBe(priorId);
      expect(JSON.stringify(changed.sourceBinding)).not.toMatch(/CANARY_|secretRevision/i);
      priorId = boundSources.beginActivation([privateSource], 4)[0].sourceBinding.bindingId;
    }
    const disabled = boundSources.beginActivation([{ ...privateSource, enabled: false }], 5)[0];
    const disabledState = state(5);
    boundSources.attach('farm-a', disabledState, 5);
    expect(disabled.sourceBinding.stateStatus).toBe('blocked');
    expect(boundSources.publish('farm-a', disabledState, 5, { value: 'forbidden' })).toBeNull();
    expect(boundSources.beginActivation([], 6)[0]).toMatchObject({ removed: true, serverId: 'farm-a' });
  });

  test('old activation cannot publish or complete delayed map-outline warmup after A to B', async () => {
    const boundSources = registry();
    boundSources.beginActivation([source()], 1);
    const oldState = state(1);
    boundSources.attach('farm-a', oldState, 1);
    let resolveOutline;
    const deferred = new Promise((resolve) => { resolveOutline = resolve; });
    const mapFieldOutlineMemo = new Map();
    const broadcasts = [];
    const serverStates = { 'farm-a': oldState };
    const warmupMapFieldOutlines = exportedFunction('warmupMapFieldOutlines', 'function mapFillResultForMerged(', {
      serverStates, boundSources, ownsOrigin, outlineMemoKeyFromMerged: () => 'map-key',
      mapFieldOutlineMemo, mapFieldOutlineWarmup: new Set(),
      collectFs25ModsDirectories: () => [], getElectronDocumentsPath: () => '',
      getFs25DocumentsRoot: () => '', path, resolveMapFieldOutlines: () => deferred,
      broadcast: (...args) => broadcasts.push(args), console,
    });
    warmupMapFieldOutlines('farm-a', { mapTitle: 'A' });
    boundSources.beginActivation([source({ localPath: 'C:/private/save-b' })], 2);
    const newState = state(2);
    serverStates['farm-a'] = newState;
    boundSources.attach('farm-a', newState, 2);
    expect(boundSources.publish('farm-a', oldState, 1, { value: 'old' })).toBeNull();
    resolveOutline({ fields: ['old'] });
    await deferred;
    await Promise.resolve();
    expect(mapFieldOutlineMemo.size).toBe(0);
    expect(broadcasts).toHaveLength(0);
    expect(boundSources.snapshot('farm-a').sourceBinding.stateStatus).toBe('pending');

    const routes = {};
    const routeSource = mainSource.slice(
      mainSource.indexOf("expressApp.get('/api/data'"),
      mainSource.indexOf("expressApp.get('/api/animals'"),
    );
    new Function('expressApp', 'resolveServerIdForRequest', 'boundSources', 'console', routeSource)(
      { get: (route, handler) => { routes[route] = handler; } },
      () => 'farm-a', boundSources, console,
    );
    let httpResponse;
    routes['/api/data']({ query: {} }, { json: (value) => { httpResponse = value; } });
    expect(httpResponse.sourceBinding).toEqual(boundSources.snapshot('farm-a').sourceBinding);
    expect(httpResponse.sourceBinding.bindingId).toBe('opaque-2');
    expect(httpResponse).not.toHaveProperty('value');

    const frames = [];
    const broadcast = exportedFunction('broadcast', '\nfunction ', {
      boundSources, cloneMergedDataWithFieldExclusions: (data) => data,
      lastBroadcastHashByServer: {},
      clients: new Set([{ readyState: 1, send: (frame) => frames.push(JSON.parse(frame)) }]),
      WebSocket: { OPEN: 1 }, statusForPayload,
    });
    broadcast('farm-a', { value: 'delayed A merge' }, oldState);
    expect(frames).toHaveLength(0);
    broadcast('farm-a', { value: 'current B' }, newState);
    expect(frames).toHaveLength(1);
    expect(frames[0].sourceBinding.bindingId).toBe('opaque-2');
    expect(frames[0].data.value).toBe('current B');
    expect(boundSources.publish('farm-a', oldState, 1, { value: 'late A watcher' })).toBeNull();
  });

  test('source contract is additive and routing signature remains private', () => {
    for (const field of ['enabled', 'replicaRemoteSlot', 'ftpSavegameRemoteDir']) {
      expect(fs.readFileSync(path.join(__dirname, '..', 'setupConfigMerge.cjs'), 'utf8')).toContain(field);
    }
    expect(mainSource).toContain('boundSources.beginActivation(servers, activationToken)');
    expect(mainSource).toContain('broadcastSourceState');
    expect(mainSource).toContain('boundSources.snapshot(sid)');
    expect(mainSource).toContain('sourceBinding: published.sourceBinding');
  });
});
