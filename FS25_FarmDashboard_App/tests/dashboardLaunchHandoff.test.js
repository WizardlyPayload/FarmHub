'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');

const mainPath = process.env.FARMDASH_NAVIGATION_SOURCE || path.join(__dirname, '..', 'main.js');
const source = fs.readFileSync(mainPath, 'utf8');
const navigation = source.slice(source.indexOf('let launchDashboardInFlight = null;'), source.indexOf('function probeLoopbackStatus('));
const boot = source.slice(source.indexOf('async function bootServer('), source.indexOf('/** Same persistence + boot as ipcMain save-settings'));

function harness() {
    const wc = new EventEmitter();
    wc.url = 'http://127.0.0.1:8768/setup.html';
    wc.loading = false;
    wc.getURL = () => wc.url;
    wc.isLoadingMainFrame = () => wc.loading;
    wc.isDestroyed = () => false;
    const loads = [];
    const win = {
        webContents: wc,
        isDestroyed: () => false,
        loadURL: jest.fn((url) => {
            const previous = loads.at(-1);
            if (previous && !previous.finished) previous.reject(new Error('ERR_ABORTED (-3)'));
            wc.loading = true;
            const pending = { url, finished: false };
            const promise = new Promise((resolve, reject) => Object.assign(pending, { resolve, reject }));
            // Observe the old bootServer's detached rejection during before-fix regression runs.
            promise.catch(() => {});
            loads.push(pending);
            return promise;
        }),
    };
    const config = { isConfigured: true, servers: [] };
    const ctx = vm.createContext({
        mainWindow: win, PORT: 8768, URL, Promise,
        setTimeout, clearTimeout, setImmediate: jest.fn(),
        console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
        server: { listening: true }, serverStates: {},
        store: { get: () => config },
        stopAllWatchers: async () => {},
        hydrateServerCacheFromDisk: jest.fn(),
        hydrateLuaSnapshotFromDiskAtBoot: async () => {},
        startLocalWatching: async () => {},
        startFtpPollingCoordinator: jest.fn(),
        startVanillaFillTypeHudWarmup: jest.fn(),
        getLanBindAddress: () => '127.0.0.1',
        listenFarmdashHttp: jest.fn(),
        isTrustedDashboardIpcSender: event => event?.trusted === true,
        shouldLoadDashboardUrl: () => wc.url.endsWith('/setup.html'),
    });
    vm.runInContext(navigation + '\n' + boot, ctx, { filename: mainPath });
    const finish = () => {
        const pending = loads.at(-1);
        wc.url = new URL(pending.url).href;
        wc.loading = false;
        pending.finished = true;
        wc.emit('did-finish-load');
        pending.resolve();
    };
    const fail = (code = -102, desc = 'ERR_CONNECTION_REFUSED') => {
        const pending = loads.at(-1);
        pending.finished = true;
        wc.loading = false;
        wc.emit('did-fail-load', {}, code, desc, pending.url, true);
        pending.reject(new Error(desc));
    };
    return { ctx, wc, win, config, loads, finish, fail };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('backend boot and Launch Dashboard share one navigation when boot wins the race', async () => {
    const h = harness();
    await h.ctx.bootServer(h.config, { deferHydrate: true });
    const launch = h.ctx.launchDashboardFromIpc({ trusted: true });
    h.finish();
    await expect(launch).resolves.toEqual({ ok: true, stage: 'ready' });
    expect(h.win.loadURL).toHaveBeenCalledTimes(1);
});

test('backend boot and Launch Dashboard share one navigation when IPC wins the race', async () => {
    const h = harness();
    const launch = h.ctx.launchDashboardFromIpc({ trusted: true });
    await h.ctx.bootServer(h.config, { deferHydrate: true });
    h.finish();
    await expect(launch).resolves.toEqual({ ok: true, stage: 'ready' });
    expect(h.win.loadURL).toHaveBeenCalledTimes(1);
});

test('equivalent root URLs share the same pending promise', async () => {
    const h = harness();
    const first = h.ctx.waitForDashboardNavigation('http://127.0.0.1:8768', 15000);
    const second = h.ctx.waitForDashboardNavigation('http://127.0.0.1:8768/', 15000);
    h.finish();
    await Promise.all([first, second]);
    expect(first).toBe(second);
    expect(h.win.loadURL).toHaveBeenCalledTimes(1);
});

test('an already loaded dashboard is not reloaded by a late launch request', async () => {
    const h = harness();
    h.wc.url = 'http://127.0.0.1:8768/';
    const launch = h.ctx.launchDashboardFromIpc({ trusted: true });
    if (h.loads.length) h.finish();
    await expect(launch).resolves.toEqual({ ok: true, stage: 'ready' });
    expect(h.win.loadURL).not.toHaveBeenCalled();
});

test('a loading dashboard is not incorrectly reported ready', async () => {
    const h = harness();
    h.wc.url = 'http://127.0.0.1:8768/';
    h.wc.loading = true;
    const wait = h.ctx.waitForDashboardNavigation(h.wc.url, 15000);
    expect(h.win.loadURL).toHaveBeenCalledTimes(1);
    h.finish();
    await wait;
});

test('subframe failures do not fail the main dashboard launch', async () => {
    const h = harness();
    const launch = h.ctx.launchDashboardFromIpc({ trusted: true });
    h.wc.emit('did-fail-load', {}, -3, 'ERR_ABORTED', 'http://127.0.0.1:8768/frame', false);
    h.finish();
    await expect(launch).resolves.toEqual({ ok: true, stage: 'ready' });
});

test('genuine main-frame failures remain visible and can be retried', async () => {
    const h = harness();
    const first = h.ctx.launchDashboardFromIpc({ trusted: true });
    h.fail();
    await expect(first).resolves.toEqual({ ok: false, error: 'ERR_CONNECTION_REFUSED', stage: 'navigating' });
    const retry = h.ctx.launchDashboardFromIpc({ trusted: true });
    h.finish();
    await expect(retry).resolves.toEqual({ ok: true, stage: 'ready' });
    expect(h.win.loadURL).toHaveBeenCalledTimes(2);
});

test('timeout fails clearly and removes navigation listeners', async () => {
    const h = harness();
    const launch = h.ctx.launchDashboardFromIpc({ trusted: true });
    jest.advanceTimersByTime(15001);
    await expect(launch).resolves.toEqual({ ok: false, error: 'navigation_timeout', stage: 'navigating' });
    expect(h.wc.listenerCount('did-finish-load')).toBe(0);
    expect(h.wc.listenerCount('did-fail-load')).toBe(0);
    expect(h.wc.listenerCount('destroyed')).toBe(0);
});

test('success removes navigation listeners and the timeout', async () => {
    const h = harness();
    const launch = h.ctx.launchDashboardFromIpc({ trusted: true });
    h.finish();
    await launch;
    expect(h.wc.listenerCount('did-finish-load')).toBe(0);
    expect(h.wc.listenerCount('did-fail-load')).toBe(0);
    expect(h.wc.listenerCount('destroyed')).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
});

test('window destruction rejects the pending launch promptly', async () => {
    const h = harness();
    const launch = h.ctx.launchDashboardFromIpc({ trusted: true });
    h.wc.emit('destroyed');
    // Complete the baseline implementation so this test also terminates before the fix.
    h.finish();
    await expect(launch).resolves.toEqual({ ok: false, error: 'no_window', stage: 'navigating' });
});

test('untrusted callers cannot join an existing trusted launch', async () => {
    const h = harness();
    const trusted = h.ctx.launchDashboardFromIpc({ trusted: true });
    await expect(h.ctx.launchDashboardFromIpc({ trusted: false })).resolves.toEqual({
        ok: false, error: 'untrusted_sender', stage: 'idle',
    });
    h.finish();
    await trusted;
    expect(h.win.loadURL).toHaveBeenCalledTimes(1);
});

test('unconfigured profiles cannot launch the dashboard', async () => {
    const h = harness();
    h.config.isConfigured = false;
    await expect(h.ctx.launchDashboardFromIpc({ trusted: true })).resolves.toEqual({
        ok: false, error: 'not_configured', stage: 'persisted',
    });
    expect(h.win.loadURL).not.toHaveBeenCalled();
});

