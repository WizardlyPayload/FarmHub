'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Exercise the actual main-process functions without opening Electron in Jest.
// An archived main.js can be supplied to demonstrate that the regression fails.
const source = fs.readFileSync(
    process.env.FARMDASH_STARTUP_TEST_SOURCE || path.join(__dirname, '..', 'main.js'),
    'utf8'
);

function extractBetween(start, end) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + start.length);
    if (from < 0 || to < 0) throw new Error('Startup function boundary not found');
    return source.slice(from, to);
}

const startupFunctions = [
    extractBetween('function loadSetupWindow() {', '/** PowerShell 5.1'),
    extractBetween('function createWindow() {', "process.on('uncaughtException'"),
].join('\n');

function start(options = {}) {
    const appDirectory = path.resolve('startup-fixture');
    const win = {
        loadFile: jest.fn().mockResolvedValue(undefined),
        loadURL: jest.fn().mockResolvedValue(undefined),
        isDestroyed: jest.fn().mockReturnValue(false),
        webContents: {
            on: jest.fn(),
            executeJavaScript: jest.fn().mockResolvedValue(undefined),
        },
    };
    const context = vm.createContext({
        mainWindow: null,
        BrowserWindow: jest.fn().mockImplementation(() => win),
        ensureSetupWriteToken: jest.fn(),
        editionPolicy: { windowTitle: () => 'Farm Dashboard V5' },
        PRODUCT_LINE: 'v5',
        FARMDASH_DEV: false,
        PORT: 8768,
        __dirname: appDirectory,
        path,
        fs: { existsSync: () => options.hasNewUi !== false },
        attachEditContextMenu: jest.fn(),
        console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
        store: {
            get: (key) => key === 'config'
                ? options.config
                : key === 'farmdashSetupWriteToken' ? 'test-only-token' : undefined,
        },
        bootServer: jest.fn().mockResolvedValue(undefined),
        shouldServeNewUi: () => options.newUi !== false,
        resolveNewUiDistDir: () => path.join(appDirectory, 'ui-v2'),
        getSetupLoadOptions: () => options.locale ? { query: { lang: options.locale } } : {},
        server: options.noServer ? null : { listening: !!options.listening },
        getLanBindAddress: () => options.bind || '127.0.0.1',
        listenFarmdashHttp: jest.fn(),
    });
    vm.runInContext(startupFunctions, context);
    context.createWindow();
    const ready = () => {
        context.server = { listening: true };
        const callback = context.listenFarmdashHttp.mock.calls[0][1];
        callback();
    };
    return { context, win, ready, appDirectory };
}

test('fresh V5 waits for HTTP instead of loading root-relative assets through file:', () => {
    const { context, win, ready } = start();
    expect(win.loadFile).not.toHaveBeenCalled();
    expect(win.loadURL).not.toHaveBeenCalled();
    expect(context.listenFarmdashHttp).toHaveBeenCalledTimes(1);
    ready();
    expect(win.loadURL).toHaveBeenCalledWith('http://127.0.0.1:8768/setup.html');
    expect(win.webContents.executeJavaScript).not.toHaveBeenCalled();
});

test('fresh V5 also starts when there is no HTTP server object yet', () => {
    const { win, ready } = start({ noServer: true });
    ready();
    expect(win.loadURL).toHaveBeenCalledWith('http://127.0.0.1:8768/setup.html');
    expect(win.loadFile).not.toHaveBeenCalled();
});

test('an already-listening V5 backend opens setup without starting a second listener', () => {
    const { context, win } = start({ listening: true });
    expect(context.listenFarmdashHttp).not.toHaveBeenCalled();
    expect(win.loadURL).toHaveBeenCalledWith('http://127.0.0.1:8768/setup.html');
    expect(win.loadFile).not.toHaveBeenCalled();
});

test('first-run HTTP setup preserves the chosen installer language', () => {
    const { win, ready } = start({ locale: 'de' });
    ready();
    expect(win.loadURL).toHaveBeenCalledWith('http://127.0.0.1:8768/setup.html?lang=de');
});

test('desktop setup uses loopback even when LAN listening is configured', () => {
    const { context, win, ready } = start({ bind: '0.0.0.0' });
    expect(context.listenFarmdashHttp.mock.calls[0][0]).toBe('0.0.0.0');
    ready();
    expect(win.loadURL).toHaveBeenCalledWith('http://127.0.0.1:8768/setup.html');
});

test('closing the window before HTTP readiness does not navigate a destroyed window', () => {
    const { win, ready } = start();
    win.isDestroyed.mockReturnValue(true);
    ready();
    expect(win.loadURL).not.toHaveBeenCalled();
});

test('Classic retains its immediate local-file first-run setup', () => {
    const { win, appDirectory } = start({ newUi: false, locale: 'en' });
    expect(win.loadFile).toHaveBeenCalledWith(path.join(appDirectory, 'setup.html'), { query: { lang: 'en' } });
});

test('a missing new-UI build retains the legacy setup fallback', () => {
    const { win, appDirectory } = start({ hasNewUi: false });
    expect(win.loadFile).toHaveBeenCalledWith(path.join(appDirectory, 'setup.html'), {});
});

test('configured profiles still launch the existing dashboard boot path', () => {
    const config = { isConfigured: true, servers: [] };
    const { context, win } = start({ config });
    expect(context.bootServer).toHaveBeenCalledWith(config);
    expect(context.listenFarmdashHttp).not.toHaveBeenCalled();
    expect(win.loadFile).not.toHaveBeenCalled();
    expect(win.loadURL).not.toHaveBeenCalled();
});
