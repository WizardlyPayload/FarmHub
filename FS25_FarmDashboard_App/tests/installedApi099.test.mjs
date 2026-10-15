// FS25 FarmDashboard | tests/installedApi099.test.mjs
// Request-level HTTP/WS checks against an isolated server started from this app tree: Electron, electron-store and
// electron-updater are stubbed, the profile is a temp dir, fixtures are fake, the port is random on 127.0.0.1.
// Never contacts the installed app's ports (8766/8767/8768).
//   node tests/installedApi099.test.mjs                 hardened expectations (Host gate, generic errors)
//   F099_MODE=reproduce node tests/installedApi099.test.mjs   asserts the 096 findings are present (pre-fix trees)
// Optional: F099_APP_DIR (app tree to serve), F099_RECEIPT (receipt path), F099_SERVER_LOG (server stdout/stderr path).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';

const SELF = fileURLToPath(import.meta.url);
const APP_DIR = path.resolve(process.env.F099_APP_DIR || path.join(path.dirname(SELF), '..'));
const LIVE_PORTS = new Set([8766, 8767, 8768]);
const APP_VERSION = '5.0.7';
const noop = () => {};

// ── Isolated server (child process) ──────────────────────────────────────────

function permissive(target) {
    return new Proxy(target, {
        get(t, k) {
            if (k in t) return t[k];
            if (typeof k === 'symbol' || k === 'then') return undefined;
            return noop;
        },
    });
}

function fsFault(p) {
    const s = String(p);
    const base = path.basename(s);
    if (base === 'perm-denied-099.png') {
        return Object.assign(new Error(`EPERM: operation not permitted, stat '${s}'`), { code: 'EPERM', errno: -4048, syscall: 'stat', path: s });
    }
    if (base === 'unexpected-099.png') return new Error(`fixture failure while resolving ${s}`);
    const parts = s.split(/[\\/]/);
    for (let i = 0; i < parts.length; i++) {
        if (!/\.asar$/i.test(parts[i])) continue;
        const archive = parts.slice(0, i + 1).join(path.sep);
        let isFile = false;
        try { isFile = fs.statSync(archive).isFile(); } catch { /* missing */ }
        // Electron's asar-aware fs: a path through a non-archive `*.asar` segment fails with no error code.
        if (!isFile) return new Error('Invalid package ' + archive);
    }
    return null;
}

async function serve() {
    const fixture = JSON.parse(fs.readFileSync(process.env.F099_FIXTURE, 'utf8'));
    const profile = process.env.F099_PROFILE;
    const paths = {
        home: profile,
        appData: path.join(profile, 'AppData', 'Roaming'),
        userData: path.join(profile, 'AppData', 'Roaming', 'fs25-farm-dashboard-099'),
        documents: path.join(profile, 'Documents'),
        temp: os.tmpdir(),
        exe: process.execPath,
    };
    let storeFault = false;
    const loaded = [];

    const app = permissive({
        isPackaged: true,
        commandLine: { hasSwitch: () => false, getSwitchValue: () => '', appendSwitch: noop },
        getPath: (n) => paths[n] || (paths[n] = path.join(profile, 'electron-' + n)),
        setPath: (n, v) => { paths[n] = v; },
        getVersion: () => APP_VERSION,
        getName: () => 'FS25 Farm Dashboard V5',
        getAppPath: () => APP_DIR,
        getLocale: () => 'en',
        isReady: () => true,
        whenReady: () => Promise.resolve(),
        requestSingleInstanceLock: () => true,
        on: noop,
        once: noop,
        quit: noop,
        exit: noop,
    });
    class BrowserWindow extends EventEmitter {
        constructor() {
            super();
            this.webContents = Object.assign(new EventEmitter(), {
                isDestroyed: () => false,
                executeJavaScript: async () => undefined,
                setWindowOpenHandler: noop,
                send: noop,
                getURL: () => '',
            });
        }
        loadURL(u) { loaded.push(String(u).replace(/\?.*$/, '')); return Promise.resolve(); }
        loadFile() { return Promise.resolve(); }
        isDestroyed() { return false; }
        isMinimized() { return false; }
        restore() {}
        focus() {}
        show() {}
        static fromWebContents() { return null; }
        static getAllWindows() { return []; }
    }
    const electronStub = permissive({
        app,
        BrowserWindow,
        ipcMain: permissive({ handle: noop, on: noop, removeHandler: noop }),
        dialog: permissive({ showMessageBox: async () => ({ response: 1 }), showErrorBox: noop, showOpenDialog: async () => ({ canceled: true, filePaths: [] }) }),
        Menu: permissive({ setApplicationMenu: noop, buildFromTemplate: () => ({ popup: noop }) }),
        shell: permissive({ openExternal: async () => undefined, openPath: async () => '' }),
        Notification: class { show() {} },
    });
    class Store {
        constructor(opts = {}) {
            this._data = { ...(opts.defaults || {}), ...JSON.parse(JSON.stringify(fixture.store)) };
            this.path = path.join(paths.userData, 'config.json');
        }
        get(key, def) {
            if (storeFault && key === 'uiPreferences') throw new Error('fixture store read failed at C:\\fixture099-private\\uiPreferences.json');
            const v = String(key).split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), this._data);
            return v === undefined ? def : v;
        }
        set(key, val) {
            if (key && typeof key === 'object') { Object.assign(this._data, key); return; }
            const parts = String(key).split('.');
            let o = this._data;
            for (const p of parts.slice(0, -1)) {
                if (!o[p] || typeof o[p] !== 'object') o[p] = {};
                o = o[p];
            }
            o[parts[parts.length - 1]] = val;
        }
        has(key) { return this.get(key) !== undefined; }
        delete(key) { delete this._data[key]; }
        clear() { this._data = {}; }
        get store() { return this._data; }
        set store(v) { this._data = v; }
        onDidChange() { return noop; }
        onDidAnyChange() { return noop; }
    }
    const updaterStub = permissive({
        autoUpdater: permissive(Object.assign(new EventEmitter(), {
            checkForUpdates: async () => null,
            checkForUpdatesAndNotify: async () => null,
            downloadUpdate: async () => [],
            quitAndInstall: noop,
            setFeedURL: noop,
            logger: null,
        })),
    });

    const originalLoad = Module._load;
    Module._load = function (request) {
        if (request === 'electron') return electronStub;
        if (request === 'electron-store') return Store;
        if (request === 'electron-updater') return updaterStub;
        const mod = originalLoad.apply(this, arguments);
        // Skip the startup fill-type icon warmup (it scans game install folders and converts textures).
        if (/(^|[\\/])fillTypeHud\.cjs$/.test(request)) return { ...mod, prefetchFillTypeHudCache: async () => 0 };
        return mod;
    };
    const originalStat = fs.stat;
    fs.stat = function (p, ...rest) {
        const cb = rest[rest.length - 1];
        const fault = typeof cb === 'function' ? fsFault(p) : null;
        if (fault) { process.nextTick(cb, fault); return undefined; }
        return originalStat.call(this, p, ...rest);
    };
    const originalCreateServer = http.createServer;
    http.createServer = function (...args) {
        const srv = originalCreateServer.apply(this, args);
        srv.once('listening', () => process.stdout.write('F099_READY ' + JSON.stringify({ ...srv.address(), loaded }) + '\n'));
        return srv;
    };
    let pending = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
        pending += chunk;
        let i;
        while ((i = pending.indexOf('\n')) >= 0) {
            const cmd = pending.slice(0, i).trim();
            pending = pending.slice(i + 1);
            if (cmd === 'fault-on') storeFault = true;
            if (cmd === 'fault-off') storeFault = false;
            process.stdout.write('F099_ACK ' + cmd + '\n');
        }
    });
    createRequire(path.join(APP_DIR, 'main.js'))(path.join(APP_DIR, 'main.js'));
}

// ── Test driver ──────────────────────────────────────────────────────────────

const rand = (n) => crypto.randomBytes(n).toString('hex');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

function makeFixture() {
    const secrets = {
        ftpPass: 'fixture-ftp-' + rand(12),
        httpFeedCode: 'fixture-feed-' + rand(12),
        lanPassword: 'fixture-lan-' + rand(12),
        lanWsSecret: rand(24),
        setupToken: rand(32),
    };
    const store = {
        config: {
            isConfigured: false,
            servers: [
                { id: 'srv-fixture-099', name: 'Fixture Dedicated 099', mode: 'ftp', enabled: true, ftpHost: 'ftp.fixture099.invalid', ftpPort: 21, ftpUser: 'fixture-user', ftpPass: secrets.ftpPass, httpFeedCode: secrets.httpFeedCode, savegameSlot: 1 },
                { id: 'local-fixture-099', name: 'Fixture Local 099', mode: 'local', enabled: true, savegameSlot: 2 },
            ],
        },
        lanAccessEnabled: false,
        lanUsername: 'lan-fixture-099',
        lanPassword: secrets.lanPassword,
        lanAllowedIPs: '',
        lanAuthOptional: false,
        lanWsSecret: secrets.lanWsSecret,
        farmdashSetupWriteToken: secrets.setupToken,
        classicConfigImportedV1: true,
        locale: 'en',
    };
    return { secrets, store };
}

function freePort() {
    return new Promise((resolve, reject) => {
        const s = net.createServer();
        s.once('error', reject);
        s.listen(0, '127.0.0.1', () => {
            const { port } = s.address();
            s.close(() => resolve(port));
        });
    });
}

function nicIpv4() {
    for (const list of Object.values(os.networkInterfaces())) {
        for (const a of list || []) {
            if (!a.internal && (a.family === 'IPv4' || a.family === 4)) return a.address;
        }
    }
    return null;
}

async function startServer(fixture, tmp) {
    let port = Number(process.env.F099_PORT || 0);
    if (port && (LIVE_PORTS.has(port) || port === 9999)) throw new Error('F099_PORT must not be a live dashboard port');
    while (!port || LIVE_PORTS.has(port) || port === 9999) port = await freePort();
    const profile = path.join(tmp, 'profile');
    for (const sub of ['Documents', 'AppData/Roaming', 'AppData/Local']) fs.mkdirSync(path.join(profile, sub), { recursive: true });
    const fixturePath = path.join(tmp, 'fixture.json');
    fs.writeFileSync(fixturePath, JSON.stringify({ store: fixture.store }));
    const env = { ...process.env };
    for (const k of ['NODE_ENV', 'FARMDASH_DEV', 'FARMDASH_ALLOW_REMOTE_SETUP', 'FARMDASH_ALLOW_LAN_EXPORT', 'ELECTRON_RUN_AS_NODE']) delete env[k];
    Object.assign(env, {
        FARMDASH_PORT: String(port),
        FARMDASH_PRODUCT_LINE: 'v5',
        F099_FIXTURE: fixturePath,
        F099_PROFILE: profile,
        F099_APP_DIR: APP_DIR,
        USERPROFILE: profile,
        HOME: profile,
        APPDATA: path.join(profile, 'AppData', 'Roaming'),
        LOCALAPPDATA: path.join(profile, 'AppData', 'Local'),
    });
    const child = spawn(process.execPath, [SELF, '--serve'], { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const log = [];
    const waiters = [];
    const onLine = (line) => {
        log.push(line);
        for (const w of [...waiters]) if (w.test(line)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(line); }
    };
    let bufOut = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c) => {
        bufOut += c;
        let i;
        while ((i = bufOut.indexOf('\n')) >= 0) { onLine(bufOut.slice(0, i)); bufOut = bufOut.slice(i + 1); }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c) => { for (const l of c.split(/\r?\n/)) if (l) log.push('[stderr] ' + l); });
    const waitFor = (re, ms) => new Promise((resolve, reject) => {
        const w = { test: (l) => re.test(l), resolve };
        waiters.push(w);
        const t = setTimeout(() => reject(new Error('timeout waiting for ' + re)), ms);
        const orig = w.resolve;
        w.resolve = (l) => { clearTimeout(t); orig(l); };
    });
    const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
    let listening = false;
    const earlyExit = exited.then((e) => {
        if (!listening) throw new Error('server exited before listening: ' + JSON.stringify(e) + '\n' + log.slice(-20).join('\n'));
    });
    earlyExit.catch(noop);
    const readyLine = await Promise.race([waitFor(/^F099_READY /, 60000), earlyExit.then(() => new Promise(noop))]);
    listening = true;
    const ready = JSON.parse(readyLine.slice('F099_READY '.length));
    const control = async (cmd) => {
        const ack = waitFor(new RegExp('^F099_ACK ' + cmd + '$'), 5000);
        child.stdin.write(cmd + '\n');
        await ack;
    };
    const stop = async () => {
        if (child.exitCode == null) child.kill();
        await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
    };
    return { port, ready, control, stop, log, pid: child.pid };
}

function httpRequest(port, { method = 'GET', path: p, headers = {}, localAddress, body }) {
    return new Promise((resolve) => {
        const req = http.request({ host: '127.0.0.1', port, method, path: p, headers, localAddress, agent: false, timeout: 10000 }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', (e) => resolve({ status: 'error:' + (e.code || e.message), headers: {}, body: Buffer.alloc(0) }));
        if (body != null) req.write(body);
        req.end();
    });
}

/** HTTP/1.0 without a Host header (Node's server only enforces Host on HTTP/1.1). */
function rawHttp10(port, method, p) {
    return new Promise((resolve) => {
        const sock = net.connect({ host: '127.0.0.1', port });
        const chunks = [];
        sock.setTimeout(10000, () => sock.destroy());
        sock.on('connect', () => sock.write(`${method} ${p} HTTP/1.0\r\n\r\n`));
        sock.on('data', (c) => chunks.push(c));
        sock.on('close', () => {
            const raw = Buffer.concat(chunks);
            const sep = raw.indexOf('\r\n\r\n');
            const head = (sep >= 0 ? raw.subarray(0, sep) : raw).toString('latin1').split('\r\n');
            const status = Number((/^HTTP\/1\.[01] (\d{3})/.exec(head[0] || '') || [])[1]) || 'error:no-status';
            const headers = {};
            for (const line of head.slice(1)) {
                const i = line.indexOf(':');
                if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
            }
            resolve({ status, headers, body: sep >= 0 ? raw.subarray(sep + 4) : Buffer.alloc(0) });
        });
        sock.on('error', () => {});
    });
}

function wsProbe(WebSocket, port, { path: p = '/', headers = {}, localAddress }) {
    return new Promise((resolve) => {
        let done = false;
        const finish = (status, ws) => {
            if (done) return;
            done = true;
            try { ws && ws.terminate(); } catch { /* ignore */ }
            resolve({ status, headers: {}, body: Buffer.alloc(0) });
        };
        const ws = new WebSocket(`ws://127.0.0.1:${port}${p}`, { headers, localAddress, handshakeTimeout: 8000 });
        ws.on('open', () => finish(101, ws));
        ws.on('unexpected-response', (req, res) => { finish(res.statusCode, null); req.destroy(); });
        ws.on('error', (e) => finish('error:' + (e.code || e.message), ws));
    });
}

const SERVER_ROW_KEYS = new Set(['id', 'name', 'mode', 'localSubFolder', 'savegameName', 'mapTitle', 'configWarning']);
const GENERIC_TEXT = new Set(['Not Found', 'Bad Request', 'Internal Server Error', 'Forbidden']);

function parseJson(buf) {
    try { return JSON.parse(buf.toString('utf8')); } catch { return undefined; }
}

async function main() {
    const mode = process.env.F099_MODE === 'reproduce' ? 'reproduce' : 'hardened';
    const WebSocket = createRequire(path.join(APP_DIR, 'main.js'))('ws');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f099-'));
    const fixture = makeFixture();
    const S = fixture.secrets;
    const server = await startServer(fixture, tmp);
    const P = server.port;
    const NIC = nicIpv4();
    const MACHINE = String(os.hostname() || '').toLowerCase();
    const basic = (u, p) => 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
    const LAN_AUTH = basic('lan-fixture-099', S.lanPassword);
    const LAN_BAD = basic('lan-fixture-099', 'wrong-' + rand(4));
    const LAN = '127.0.0.2';
    const leakMarkers = [APP_DIR, APP_DIR.replace(/\\/g, '/'), APP_DIR.replace(/\\/g, '\\\\'), tmp, tmp.replace(/\\/g, '\\\\'), 'node_modules', 'Invalid package', 'EPERM', 'fixture failure', 'fixture099-private'];
    const stackRe = /\n\s+at\s|\bat\s+\S+\s+\((?:[A-Za-z]:|node:)/;
    const absPathRe = /[A-Za-z]:[\\/]{1,2}[A-Za-z0-9]/;

    const cases = [];
    const add = (id, group, req, expect) => cases.push({ id, group, req, expect });
    const H = (host, extra) => ({ Host: host, ...(extra || {}) });
    const hostileHost = 'attacker.invalid:8768';
    const hostileOrigin = 'http://attacker.invalid:8768';
    const attackerOnPort = `attacker.invalid:${P}`;
    const denied = { status: 403, hostDenied: true, noStore: true, acao: null };
    const deniedSetup = { status: 403, deniedSetup: true, noStore: true, acao: null };

    if (mode === 'reproduce') {
        add('R1-asar-500-leaks', 'reproduce', { path: '/resources/app.asar' }, { status: 500, leaks: true });
        add('R2-attacker-host-servers', 'reproduce', { path: '/api/servers', headers: H(hostileHost) }, { status: 200, serverProjection: true });
        add('R3-attacker-host-setup-status', 'reproduce', { path: '/api/setup-status', headers: H(hostileHost) }, { status: 200, json: true });
        add('R4-attacker-host-lan-ws-token', 'reproduce', { path: '/api/lan-ws-token', headers: H(hostileHost) }, { status: 200, hasToken: true, allowWsSecret: true });
        add('R5-attacker-host-ws-upgrade', 'reproduce', { ws: true, headers: H(hostileHost) }, { status: 101 });
        add('R6-malformed-param-400-leaks', 'reproduce', { path: '/api/livestock/%E0%A4%A' }, { status: 400, leaks: true });
        add('R7-eperm-static-500-leaks', 'reproduce', { path: '/perm-denied-099.png' }, { status: 500, leaks: true });
        add('R8-route-catch-500-leaks', 'reproduce', { path: '/api/simhub-view-config', fault: true }, { status: 500, leaks: true });
    } else {
        // Retained 096 matrix (port-adjusted). Changed expectations: hostile Host on sensitive reads/WS is now refused.
        add('status-baseline', '096', { path: '/api/status' }, { status: 200, json: true, publicStatus: true, acao: null });
        add('status-head', '096', { method: 'HEAD', path: '/api/status' }, { status: 200, acao: null, emptyBody: true });
        add('config-baseline', '096', { path: '/api/setup-config' }, { status: 200, json: true, noStore: true, configRedaction: true, acao: null });
        add('servers-baseline', '096', { path: '/api/servers' }, { status: 200, serverProjection: true });
        add('setup-status-baseline', '096', { path: '/api/setup-status' }, { status: 200, json: true });
        add('animals-baseline', '096', { path: '/api/animals' }, { status: 200, json: true });
        add('unknown-source-data', '096', { path: '/api/data?serverId=__read_only_probe_099_missing_source__' }, { status: 200, waitingData: true });
        for (const [id, origin] of [['loopback', `http://127.0.0.1:${P}`], ['localhost', `http://localhost:${P}`], ['marketing', 'https://farmdashboard.co.uk']]) {
            add('cors-allowed-' + id, '096', { path: '/api/status', headers: { Origin: origin } }, { status: 200, acao: origin, publicStatus: true });
        }
        for (const [id, origin] of [['hostile', hostileOrigin], ['null', 'null'], ['wrong-port', 'http://127.0.0.1:9999'], ['lookalike', 'https://farmdashboard.co.uk.attacker.invalid'], ['malformed', 'not-a-valid-origin']]) {
            add('cors-denied-' + id, '096', { path: '/api/status', headers: { Origin: origin } }, { status: 200, acao: null, publicStatus: true });
        }
        add('config-hostile-origin', '096', { path: '/api/setup-config', headers: { Origin: hostileOrigin } }, { status: 200, acao: null, json: true, noStore: true, configRedaction: true });
        add('config-deny-host-only', '096', { path: '/api/setup-config', headers: H(hostileHost) }, deniedSetup);
        add('config-deny-host-and-origin', '096', { path: '/api/setup-config', headers: H(hostileHost, { Origin: hostileOrigin }) }, deniedSetup);
        add('config-deny-spoofed-forwarding', '096', { path: '/api/setup-config', headers: H(hostileHost, { 'X-Forwarded-Host': `127.0.0.1:${P}`, 'X-Forwarded-For': '127.0.0.1', Forwarded: `for=127.0.0.1;host=127.0.0.1:${P}` }) }, deniedSetup);
        add('config-deny-synthetic-invalid-token', '096', { path: '/api/setup-config', headers: H(hostileHost, { 'X-Setup-Token': 'not-a-valid-token-099' }) }, deniedSetup);
        add('config-deny-case-trailing', '096', { path: '/API/SETUP-CONFIG/', headers: H(hostileHost) }, { status: 403, deniedSetup: true, noStore: true });
        add('config-deny-head', '096', { method: 'HEAD', path: '/api/setup-config', headers: H(hostileHost) }, { status: 403, noStore: true, emptyBody: true });
        add('hostile-host-servers', '096-changed', { path: '/api/servers', headers: H(hostileHost) }, denied);
        add('hostile-host-setup-status', '096-changed', { path: '/api/setup-status', headers: H(hostileHost) }, denied);
        add('hostile-host-animals', '096-changed', { path: '/api/animals', headers: H(hostileHost) }, denied);
        add('hostile-host-and-origin-servers', '096-changed', { path: '/api/servers', headers: H(hostileHost, { Origin: hostileOrigin }) }, denied);
        add('preflight-allowed-control', '096', { method: 'OPTIONS', path: '/api/setup-config', headers: { Origin: `http://127.0.0.1:${P}`, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-setup-token' } }, { status: 204, acao: `http://127.0.0.1:${P}` });
        add('preflight-hostile-control', '096', { method: 'OPTIONS', path: '/api/setup-config', headers: { Origin: hostileOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-setup-token' } }, { status: 200, acao: null, allowIncludes: 'POST' });
        add('preflight-null-origin-control', '096', { method: 'OPTIONS', path: '/api/setup-config', headers: { Origin: 'null', 'Access-Control-Request-Method': 'POST' } }, { status: 200, acao: null, allowIncludes: 'POST' });
        for (const [id, p] of [['setup-handshake', '/api/setup-handshake'], ['converter-action', '/api/export-mod-store-images']]) {
            add(id + '-get-does-not-invoke', '096', { path: p }, { status: 404 });
            add(id + '-head-does-not-invoke', '096', { method: 'HEAD', path: p }, { status: 404 });
            add(id + '-options-only', '096', { method: 'OPTIONS', path: p }, { status: 204, acao: null });
        }
        add('public-ui-shell', '096', { method: 'HEAD', path: '/' }, { status: 200 });
        add('classic-shell-redirect', '096', { method: 'HEAD', path: '/web/index.html' }, { status: 302, location: '/' });
        add('classic-simhub-redirect', '096', { method: 'HEAD', path: '/web/simhub.html' }, { status: 302, location: '/simhub.html' });
        ['/main.js', '/preload.js', '/package.json', '/app-update.yml', '/resources/app.asar', '/.env', '/.git/config', '/config.json', '/web/main.js', '/web/package.json',
            '/%2e%2e/main.js', '/web/%2e%2e/main.js', '/web/..%5cmain.js', '/web/%252e%252e/main.js', '/assets/%2e%2e/%2e%2e/main.js', '/web/%2f..%2fmain.js']
            .forEach((p, i) => add('nonpublic-static-' + (i + 1), '096-static', { path: p }, { status: 404, noLeak: true }));
        add('ws-native-no-origin', '096-ws', { ws: true }, { status: 101 });
        add('ws-same-origin', '096-ws', { ws: true, headers: { Origin: `http://127.0.0.1:${P}` } }, { status: 101 });
        add('ws-marketing-allowlist', '096-ws', { ws: true, headers: { Origin: 'https://farmdashboard.co.uk' } }, { status: 101 });
        for (const [id, h] of [['hostile-origin', { Origin: hostileOrigin }], ['null-origin', { Origin: 'null' }], ['malformed-origin', { Origin: 'not-a-valid-origin' }], ['wrong-port', { Origin: 'http://127.0.0.1:9999' }], ['hostile-referer-no-origin', { Referer: 'http://attacker.invalid:8768/page' }], ['hostile-host-and-origin', { Host: hostileHost, Origin: hostileOrigin }]]) {
            add('ws-' + id, '096-ws', { ws: true, headers: h }, { status: 401 });
        }
        add('ws-hostile-host-no-origin', '096-ws-changed', { ws: true, headers: H(hostileHost) }, { status: 401 });
        add('config-after', '096', { path: '/api/setup-config' }, { status: 200, json: true, noStore: true, configRedaction: true });
        add('status-after', '096', { path: '/api/status' }, { status: 200, json: true, publicStatus: true });

        // Legitimate Host positives (loopback client).
        const goodHosts = [['loopback', `127.0.0.1:${P}`], ['localhost', `localhost:${P}`], ['localhost-upper', `LOCALHOST:${P}`], ['ipv6-loopback', `[::1]:${P}`], ['ipv4-mapped', `[::ffff:127.0.0.1]:${P}`], ['machine-name', `${MACHINE}:${P}`], ['machine-local', `${MACHINE}.local:${P}`]];
        if (NIC) goodHosts.push(['nic-ipv4', `${NIC}:${P}`]);
        for (const [id, host] of goodHosts) add('host-ok-servers-' + id, 'host-positive', { path: '/api/servers', headers: H(host) }, { status: 200, serverProjection: true });
        add('host-ok-setup-config-localhost', 'host-positive', { path: '/api/setup-config', headers: H(`localhost:${P}`) }, { status: 200, noStore: true, configRedaction: true });
        add('host-ok-setup-page', 'host-positive', { path: '/setup.html', headers: H(`127.0.0.1:${P}`) }, { status: 200, noStore: true, setupInjected: true, allowSetupToken: true });
        add('host-ok-ws-localhost', 'host-positive', { ws: true, headers: H(`localhost:${P}`) }, { status: 101 });
        add('host-ok-lan-ws-token-loopback', 'host-positive', { path: '/api/lan-ws-token' }, { status: 200, hasToken: true, allowWsSecret: true });
        add('host-ok-static-shell-any-host', 'host-positive', { method: 'HEAD', path: '/', headers: H(hostileHost) }, { status: 200 });

        // Host negatives on /api/servers (loopback client, so the old loopback bypass would have served them).
        const badHosts = [['attacker-listener-port', attackerOnPort], ['attacker-no-port', 'attacker.invalid'], ['loopback-no-port', '127.0.0.1'], ['loopback-wrong-port', `127.0.0.1:${P + 1}`],
            ['loopback-port-9999', '127.0.0.1:9999'], ['empty-port', '127.0.0.1:'], ['ipv6-no-port', '[::1]'], ['ipv6-unbracketed', `::1:${P}`], ['ipv6-unclosed', '[::1'],
            ['space', `bad host:${P}`], ['userinfo', `127.0.0.1:${P}@attacker.invalid`], ['trailing-dot', `localhost.:${P}`], ['any-address', `0.0.0.0:${P}`], ['other-loopback', `127.0.0.2:${P}`],
            ['numeric-name', String(P)], ['double-port', `127.0.0.1:${P}:${P}`], ['rebind-subdomain', `127.0.0.1.attacker.invalid:${P}`]];
        if (NIC) badHosts.push(['nic-wrong-port', `${NIC}:${P + 1}`]);
        for (const [id, host] of badHosts) add('host-bad-servers-' + id, 'host-negative', { path: '/api/servers', headers: H(host) }, denied);
        add('host-bad-forwarded-spoof-servers', 'host-negative', { path: '/api/servers', headers: H(attackerOnPort, { 'X-Forwarded-Host': `127.0.0.1:${P}`, 'X-Forwarded-For': '127.0.0.1', Forwarded: `for=127.0.0.1;host=127.0.0.1:${P}` }) }, denied);
        add('host-missing-http11-servers', 'host-negative', { path: '/api/servers', noHost: 'http11' }, { status: 400 });

        const sensitive = ['/api/status', '/api/servers', '/api/setup-status', '/api/data', '/api/animals', '/api/vehicles', '/api/fields', '/api/finance', '/api/farmlands', '/api/livestock/1',
            '/api/lan-ws-token', '/api/simhub-session', '/api/simhub-view-config', '/api/item-image-filenames', '/api/map-overview-image?mapId=fixture', '/API/SERVERS/'];
        for (const p of sensitive) add('attacker-host ' + p, 'sensitive-read', { path: p, headers: H(attackerOnPort) }, denied);
        add('attacker-host /api/setup-config', 'sensitive-read', { path: '/api/setup-config', headers: H(attackerOnPort) }, deniedSetup);
        add('attacker-host /setup.html', 'sensitive-read', { path: '/setup.html', headers: H(attackerOnPort) }, { status: 302, noStore: true, locationNot: '/setup.html' });
        add('attacker-host /SETUP.HTML', 'sensitive-read', { path: '/SETUP.HTML', headers: H(attackerOnPort) }, { status: 302, noStore: true, locationNot: '/setup.html' });
        add('attacker-host /api/Setup-Config/', 'sensitive-read', { path: '/api/Setup-Config/', headers: H(attackerOnPort) }, deniedSetup);
        add('attacker-host HEAD /api/servers', 'sensitive-read', { method: 'HEAD', path: '/api/servers', headers: H(attackerOnPort) }, { status: 403, noStore: true, emptyBody: true });
        add('attacker-host OPTIONS /api/servers', 'sensitive-read', { method: 'OPTIONS', path: '/api/servers', headers: H(attackerOnPort, { Origin: `http://${attackerOnPort}`, 'Access-Control-Request-Method': 'GET' }) }, denied);
        add('attacker-host POST /api/setup-handshake', 'sensitive-read', { method: 'POST', path: '/api/setup-handshake', headers: H(attackerOnPort, { 'Content-Type': 'application/json' }), body: '{}' }, denied);
        for (const p of ['/api/status', '/api/servers', '/api/setup-status', '/api/data', '/api/lan-ws-token']) add('malformed-host ' + p, 'sensitive-read', { path: p, headers: H(`bad host:${P}`) }, denied);
        add('malformed-host /api/setup-config', 'sensitive-read', { path: '/api/setup-config', headers: H(`bad host:${P}`) }, deniedSetup);
        for (const p of ['/api/status', '/api/servers', '/api/setup-status', '/api/data', '/api/lan-ws-token']) add('missing-host-http10 ' + p, 'sensitive-read', { path: p, noHost: 'http10' }, denied);
        add('missing-host-http10 /api/setup-config', 'sensitive-read', { path: '/api/setup-config', noHost: 'http10' }, deniedSetup);
        for (const [id, h] of [['attacker-listener-port', H(attackerOnPort)], ['malformed', H(`bad host:${P}`)], ['wrong-port', H(`127.0.0.1:${P + 1}`)], ['no-port', H('localhost')]]) {
            add('ws-bad-host-' + id, 'host-negative-ws', { ws: true, headers: h }, { status: 401 });
        }

        // Simulated LAN client: source 127.0.0.2 is neither loopback nor a NIC address, so LAN Basic applies.
        if (NIC) {
            const nicHost = `${NIC}:${P}`;
            const nicOrigin = `http://${NIC}:${P}`;
            add('lan-servers-nic-auth', 'lan', { path: '/api/servers', headers: H(nicHost, { Authorization: LAN_AUTH }), localAddress: LAN }, { status: 200, serverProjection: true });
            add('lan-data-nic-auth', 'lan', { path: '/api/data?serverId=__read_only_probe_099_missing_source__', headers: H(nicHost, { Authorization: LAN_AUTH }), localAddress: LAN }, { status: 200, waitingData: true });
            add('lan-setup-status-nic-auth', 'lan', { path: '/api/setup-status', headers: H(nicHost, { Authorization: LAN_AUTH }), localAddress: LAN }, { status: 200, json: true });
            add('lan-servers-machine-auth', 'lan', { path: '/api/servers', headers: H(`${MACHINE}:${P}`, { Authorization: LAN_AUTH }), localAddress: LAN }, { status: 200, serverProjection: true });
            add('lan-servers-loopback-name-auth', 'lan', { path: '/api/servers', headers: H(`127.0.0.1:${P}`, { Authorization: LAN_AUTH }), localAddress: LAN }, { status: 200, serverProjection: true });
            add('lan-status-nic-no-auth', 'lan', { path: '/api/status', headers: H(nicHost), localAddress: LAN }, { status: 200, publicStatus: true });
            add('lan-ws-token-nic-auth', 'lan', { path: '/api/lan-ws-token', headers: H(nicHost, { Authorization: LAN_AUTH }), localAddress: LAN }, { status: 200, hasToken: true, allowWsSecret: true });
            add('lan-servers-nic-no-auth', 'lan', { path: '/api/servers', headers: H(nicHost), localAddress: LAN }, { status: 401, noWwwAuthenticate: true });
            add('lan-servers-nic-bad-password', 'lan', { path: '/api/servers', headers: H(nicHost, { Authorization: LAN_BAD }), localAddress: LAN }, { status: 401 });
            add('lan-servers-attacker-host-auth', 'lan', { path: '/api/servers', headers: H(attackerOnPort, { Authorization: LAN_AUTH }), localAddress: LAN }, denied);
            add('lan-status-attacker-host', 'lan', { path: '/api/status', headers: H(attackerOnPort), localAddress: LAN }, denied);
            add('lan-setup-config-nic-auth-stays-local', 'lan', { path: '/api/setup-config', headers: H(nicHost, { Authorization: LAN_AUTH }), localAddress: LAN }, deniedSetup);
            add('lan-ws-nic-token', 'lan-ws', { ws: true, path: '/?t=' + S.lanWsSecret, headers: H(nicHost, { Origin: nicOrigin }), localAddress: LAN }, { status: 101 });
            add('lan-ws-nic-basic', 'lan-ws', { ws: true, headers: H(nicHost, { Origin: nicOrigin, Authorization: LAN_AUTH }), localAddress: LAN }, { status: 101 });
            add('lan-ws-nic-no-credentials', 'lan-ws', { ws: true, headers: H(nicHost, { Origin: nicOrigin }), localAddress: LAN }, { status: 401 });
            add('lan-ws-attacker-host-token', 'lan-ws', { ws: true, path: '/?t=' + S.lanWsSecret, headers: H(attackerOnPort, { Origin: nicOrigin }), localAddress: LAN }, { status: 401 });
        }

        // Public website demo: the tunnel connects from loopback with Host demo.farmdashboard.co.uk. Reads only,
        // never loopback trust; LAN clients naming the demo Host get no shortcut.
        const DEMO = 'demo.farmdashboard.co.uk';
        const DEMO_ORIGIN = 'https://' + DEMO;
        const demoDenied = { status: 403, demoDenied: true, noStore: true, acao: null };
        const demoReads = ['/api/status', '/api/servers', '/api/data', '/api/data?serverId=__read_only_probe_099_missing_source__', '/api/animals', '/api/vehicles', '/api/fields',
            '/api/production', '/api/finance', '/api/weather', '/api/economy', '/api/farmlands', '/api/item-image-filenames'];
        for (const p of demoReads) add('demo-read ' + p, 'demo-read', { path: p, headers: H(DEMO) }, { status: 200, json: true, noLeak: true });
        add('demo-read status payload', 'demo-read', { path: '/api/status', headers: H(DEMO) }, { status: 200, publicStatus: true });
        add('demo-read servers projection', 'demo-read', { path: '/api/servers', headers: H(DEMO) }, { status: 200, serverProjection: true });
        add('demo-read data waiting', 'demo-read', { path: '/api/data?serverId=__read_only_probe_099_missing_source__', headers: H(DEMO) }, { status: 200, waitingData: true });
        add('demo-read map overview no local paths', 'demo-read', { path: '/api/map-overview-image?mapId=fixture', headers: H(DEMO) }, { status: 200, json: true, noLeak: true, noLocalPaths: true });
        add('demo-read map outlines no local paths', 'demo-read', { path: '/api/map-field-outlines?mapId=fixture', headers: H(DEMO) }, { status: 200, json: true, noLeak: true, noLocalPaths: true });
        add('demo-read livestock detail', 'demo-read', { path: '/api/livestock/1', headers: H(DEMO) }, { statusIn: [200, 404], json: true, noLeak: true });
        add('demo-read page shell', 'demo-read', { path: '/', headers: H(DEMO) }, { status: 200 });
        add('demo-read head', 'demo-read', { method: 'HEAD', path: '/api/data', headers: H(DEMO) }, { status: 200, emptyBody: true });
        for (const [id, host] of [['upper', 'DEMO.FarmDashboard.co.uk'], ['port-443', DEMO + ':443'], ['port-80', DEMO + ':80']]) {
            add('demo-read host-' + id, 'demo-read', { path: '/api/data', headers: H(host) }, { status: 200, json: true });
        }
        add('demo-read same-origin fetch', 'demo-read', { path: '/api/data', headers: H(DEMO, { Origin: DEMO_ORIGIN }) }, { status: 200, json: true, acao: DEMO_ORIGIN });
        add('demo-ws browser origin', 'demo-ws', { ws: true, headers: H(DEMO, { Origin: DEMO_ORIGIN }) }, { status: 101 });
        add('demo-ws no origin', 'demo-ws', { ws: true, headers: H(DEMO) }, { status: 401 });
        add('demo-ws hostile origin', 'demo-ws', { ws: true, headers: H(DEMO, { Origin: hostileOrigin }) }, { status: 401 });
        add('demo-ws localhost origin', 'demo-ws', { ws: true, headers: H(DEMO, { Origin: `http://127.0.0.1:${P}` }) }, { status: 401 });

        const demoPrivileged = [
            ['GET', '/api/setup-config'], ['GET', '/API/Setup-Config/'], ['GET', '/api/setup-status'], ['GET', '/api/lan-ws-token'], ['GET', '/api/simhub-session'],
            ['GET', '/api/simhub-view-config'], ['GET', '/setup.html'], ['GET', '/SETUP.HTML'], ['GET', '/api/unknown-099'], ['GET', '/api'], ['OPTIONS', '/api/data'],
        ];
        for (const [method, p] of demoPrivileged) add(`demo-denied ${method} ${p}`, 'demo-denied', { method, path: p, headers: H(DEMO) }, demoDenied);
        const demoWrites = [
            ['/api/setup-config', { 'X-Setup-Token': S.setupToken }, '{"servers":[]}'],
            ['/api/setup-handshake', {}, '{}'],
            ['/api/export-mod-store-images', {}, '{}'],
            ['/api/livestock/1/request', {}, '{}'],
            ['/api/data', {}, '{}'],
        ];
        for (const [p, extra, body] of demoWrites) {
            add('demo-denied POST ' + p, 'demo-denied', { method: 'POST', path: p, headers: H(DEMO, { 'Content-Type': 'application/json', Origin: DEMO_ORIGIN, ...extra }), body }, demoDenied);
            add('demo-denied POST no-origin ' + p, 'demo-denied', { method: 'POST', path: p, headers: H(DEMO, { 'Content-Type': 'application/json', ...extra }), body }, demoDenied);
        }
        add('demo-denied PUT /api/data', 'demo-denied', { method: 'PUT', path: '/api/data', headers: H(DEMO, { 'Content-Type': 'application/json' }), body: '{}' }, demoDenied);
        add('demo-denied DELETE /api/servers', 'demo-denied', { method: 'DELETE', path: '/api/servers', headers: H(DEMO) }, demoDenied);
        add('demo-denied POST /', 'demo-denied', { method: 'POST', path: '/', headers: H(DEMO, { 'Content-Type': 'application/json' }), body: '{}' }, demoDenied);

        // Only the exact demo name on no port / 80 / 443 is a demo; everything else stays under the Host gate.
        for (const [id, host] of [['listener-port', DEMO + ':' + P], ['port-8768', DEMO + ':8768'], ['suffix', DEMO + '.attacker.invalid'], ['prefix', 'x' + DEMO],
            ['sub', 'a.' + DEMO], ['marketing-apex', 'farmdashboard.co.uk'], ['marketing-www', 'www.farmdashboard.co.uk'], ['trailing-dot', DEMO + '.'], ['userinfo', `${DEMO}@attacker.invalid`]]) {
            add('demo-lookalike ' + id, 'demo-negative', { path: '/api/data', headers: H(host) }, denied);
        }
        add('demo-lookalike ws', 'demo-negative', { ws: true, headers: H(DEMO + '.attacker.invalid', { Origin: DEMO_ORIGIN }) }, { status: 401 });
        add('localhost-still-ok after demo', 'demo-negative', { path: '/api/servers', headers: H(`localhost:${P}`) }, { status: 200, serverProjection: true });
        add('localhost-setup-still-ok after demo', 'demo-negative', { path: '/api/setup-config', headers: H(`localhost:${P}`) }, { status: 200, configRedaction: true, noStore: true });

        // A LAN client sending the demo Host is not the tunnel: LAN Basic still applies and privileged paths stay refused.
        add('demo-host-from-lan data no-auth', 'demo-lan', { path: '/api/data', headers: H(DEMO), localAddress: LAN }, { status: 401, noWwwAuthenticate: true });
        add('demo-host-from-lan servers no-auth', 'demo-lan', { path: '/api/servers', headers: H(DEMO), localAddress: LAN }, { status: 401 });
        add('demo-host-from-lan data auth', 'demo-lan', { path: '/api/servers', headers: H(DEMO, { Authorization: LAN_AUTH }), localAddress: LAN }, { status: 200, serverProjection: true });
        add('demo-host-from-lan setup-config auth', 'demo-lan', { path: '/api/setup-config', headers: H(DEMO, { Authorization: LAN_AUTH }), localAddress: LAN }, demoDenied);
        add('demo-host-from-lan lan-ws-token auth', 'demo-lan', { path: '/api/lan-ws-token', headers: H(DEMO, { Authorization: LAN_AUTH }), localAddress: LAN }, demoDenied);
        add('demo-host-from-lan ws origin', 'demo-lan', { ws: true, headers: H(DEMO, { Origin: DEMO_ORIGIN }), localAddress: LAN }, { status: 401 });

        // Error handling: generic bodies, no stack/path/exception text; archives stay 404.
        const gen404 = { status: 404, noLeak: true, noStore: true, genericBody: true };
        add('asar-get', 'errors', { path: '/resources/app.asar' }, gen404);
        add('asar-head', 'errors', { method: 'HEAD', path: '/resources/app.asar' }, { status: 404, emptyBody: true });
        add('asar-attacker-host', 'errors', { path: '/resources/app.asar', headers: H(hostileHost) }, gen404);
        for (const [id, p] of [['upper', '/resources/APP.ASAR'], ['inner', '/x/app.asar/inner.js'], ['unpacked', '/resources/app.asar.unpacked/x.node'], ['encoded-slash', '/resources%2fapp.asar'], ['web', '/web/app.asar'], ['api', '/api/app.asar']]) {
            add('asar-' + id, 'errors', { path: p }, { status: 404, noLeak: true });
        }
        add('eperm-static-get', 'errors', { path: '/perm-denied-099.png' }, { status: 500, noLeak: true, noStore: true, genericBody: true });
        add('eperm-static-head', 'errors', { method: 'HEAD', path: '/perm-denied-099.png' }, { status: 500, emptyBody: true, noStore: true });
        add('unexpected-static-get', 'errors', { path: '/unexpected-099.png' }, { status: 500, noLeak: true, noStore: true, genericBody: true });
        add('enoent-static', 'errors', { path: '/no-such-file-099.js' }, { status: 404, noLeak: true });
        add('malformed-static-path', 'errors', { path: '/%E0%A4%A' }, { statusIn: [400, 404], noLeak: true });
        add('malformed-api-param', 'errors', { path: '/api/livestock/%E0%A4%A' }, { status: 400, noLeak: true, noStore: true, genericBody: true, errorCode: 'E_BAD_REQUEST' });
        add('malformed-api-param-head', 'errors', { method: 'HEAD', path: '/api/livestock/%E0%A4%A' }, { status: 400, emptyBody: true });
        add('malformed-json-body', 'errors', { method: 'POST', path: '/api/setup-config', headers: { 'Content-Type': 'application/json', 'X-Setup-Token': S.setupToken }, body: '{"servers":[' }, { status: 400, noLeak: true, genericBody: true, errorCode: 'E_BAD_REQUEST' });
        add('route-catch-500', 'errors', { path: '/api/simhub-view-config', fault: true }, { status: 500, noLeak: true, errorCode: 'E_INTERNAL' });
        add('config-unchanged-after-errors', 'errors', { path: '/api/setup-config' }, { status: 200, configRedaction: true, noStore: true });
    }

    const results = [];
    let assertions = 0;
    let assertionsPassed = 0;
    const allowedSecretsFor = (exp) => {
        const forbid = [S.ftpPass, S.httpFeedCode, S.lanPassword];
        if (!exp.allowSetupToken) forbid.push(S.setupToken);
        if (!exp.allowWsSecret) forbid.push(S.lanWsSecret);
        return forbid;
    };
    for (const c of cases) {
        const r = c.req;
        if (r.fault) await server.control('fault-on');
        let res;
        if (r.ws) res = await wsProbe(WebSocket, P, r);
        else if (r.noHost === 'http10') res = await rawHttp10(P, r.method || 'GET', r.path);
        else if (r.noHost === 'http11') res = await rawHttp11NoHost(P, r.path);
        else res = await httpRequest(P, r);
        if (r.fault) await server.control('fault-off');
        const e = c.expect;
        const text = res.body.toString('utf8');
        const json = parseJson(res.body);
        const checks = [];
        const check = (name, ok) => { checks.push({ name, ok: !!ok }); };
        if (e.status !== undefined) check('status=' + e.status, res.status === e.status);
        if (e.statusIn) check('status-in ' + e.statusIn.join('/'), e.statusIn.includes(res.status));
        if (e.json) check('json', json !== undefined);
        if (e.noStore) check('no-store', /no-store/i.test(String(res.headers['cache-control'] || '')));
        if ('acao' in e) check('acao=' + e.acao, (res.headers['access-control-allow-origin'] || null) === e.acao);
        if (e.hostDenied) check('host-denied-code', json && json.ok === false && json.errorCode === 'E_HOST_NOT_ALLOWED' && Object.keys(json).length === 3);
        if (e.demoDenied) check('demo-read-only-code', json && json.ok === false && json.errorCode === 'E_DEMO_READ_ONLY' && Object.keys(json).length === 3);
        if (e.noLocalPaths) check('no-local-paths', json && !('sourcePath' in json) && !('modsFoldersChecked' in json));
        if (e.deniedSetup) check('setup-denial-code', json && json.ok === false && json.errorCode === 'E_SETUP_LOCAL_ONLY' && !json.servers);
        if (e.publicStatus) check('public-status', json && json.status === 'online' && json.port === P && json.appVersion === APP_VERSION && !('savegameName' in json));
        if (e.serverProjection) check('server-projection', Array.isArray(json) && json.length === 2 && json.every((row) =>
            Object.keys(row).every((k) => SERVER_ROW_KEYS.has(k) || k === 'sourceBinding')
            && (row.sourceBinding == null || (typeof row.sourceBinding === 'object'
                && Object.keys(row.sourceBinding).every((k) => ['bindingId', 'stateRevision', 'stateStatus', 'publishedAt', 'exportIdentity'].includes(k))))));
        if (e.configRedaction) {
            const rows = json && Array.isArray(json.servers) ? json.servers : null;
            check('config-redaction', rows && rows.length === 2 && rows.every((row) => !('ftpPass' in row) && !('httpFeedCode' in row)) && rows[0].ftpPassSet === true && rows[0].httpFeedCodeSet === true);
        }
        if (e.waitingData) check('waiting-data', json && json.error === 'Waiting for data...'
            && Object.keys(json).every((k) => k === 'error' || k === 'timestamp' || k === 'sourceBinding')
            && (!('sourceBinding' in json) || json.sourceBinding === null));
        if (e.location) check('location=' + e.location, res.headers.location === e.location);
        if (e.locationNot) check('location-not-' + e.locationNot, !!res.headers.location && res.headers.location !== e.locationNot);
        if (e.allowIncludes) check('allow-includes-' + e.allowIncludes, String(res.headers.allow || '').split(/\s*,\s*/).includes(e.allowIncludes));
        if (e.emptyBody) check('empty-body', res.body.length === 0);
        if (e.hasToken) check('has-token', json && typeof json.token === 'string' && json.token.length >= 16);
        if (e.setupInjected) check('setup-token-injected', text.includes('__FARMDASH_SETUP_TOKEN'));
        if (e.noWwwAuthenticate) check('no-www-authenticate', !res.headers['www-authenticate']);
        if (e.errorCode) check('error-code=' + e.errorCode, json && json.errorCode === e.errorCode && json.error !== undefined && !/[\\/]/.test(String(json.error)));
        if (e.genericBody) {
            const genericJson = json && typeof json === 'object' && Object.keys(json).every((k) => ['ok', 'error', 'errorCode'].includes(k)) && /^[a-z_]+$/.test(String(json.error));
            check('generic-body', genericJson || GENERIC_TEXT.has(text.trim()));
        }
        const leakFound = leakMarkers.some((m) => m && text.includes(m)) || stackRe.test(text) || absPathRe.test(text);
        if (e.noLeak) check('no-stack-path-or-exception-text', !leakFound);
        if (e.leaks) check('leaks-stack-path-or-exception-text', leakFound);
        check('no-fixture-credentials', !allowedSecretsFor(e).some((s) => text.includes(s) || JSON.stringify(res.headers).includes(s)));
        const passed = checks.every((x) => x.ok);
        assertions += checks.length;
        assertionsPassed += checks.filter((x) => x.ok).length;
        results.push({ c, res, checks, passed, bodySha256: sha256(res.body), bodyBytes: res.body.length });
    }

    await server.stop();
    const label = (s) => {
        let out = String(s);
        for (const [secret, name] of [[S.lanWsSecret, '<ws-token>'], [S.setupToken, '<setup-token>'], [S.lanPassword, '<lan-password>']]) out = out.split(secret).join(name);
        if (NIC) out = out.split(NIC).join('<nic-ipv4>');
        if (MACHINE) out = out.split(MACHINE).join('<machine-name>');
        return out;
    };
    const summary = {
        cases: results.length,
        passed: results.filter((x) => x.passed).length,
        failed: results.filter((x) => !x.passed).length,
        assertions,
        assertionsPassed,
    };
    const serverLog = server.log.join('\n');
    const serverLogSecretHits = [S.ftpPass, S.httpFeedCode, S.lanPassword, S.lanWsSecret, S.setupToken].filter((s) => serverLog.includes(s)).length;
    const receipt = {
        test: 'installedApi099',
        mode,
        appTree: process.env.F099_APP_LABEL || 'unlabelled',
        node: process.version,
        listener: { address: server.ready.address, family: server.ready.family, portIsRandomNonLive: !LIVE_PORTS.has(P), setupWindowLoads: server.ready.loaded.map(label) },
        nicHostControl: NIC ? 'present (redacted)' : 'NOT TESTED (no non-internal IPv4)',
        summary,
        failures: results.filter((x) => !x.passed).map((x) => ({ id: label(x.c.id), status: x.res.status, failed: x.checks.filter((k) => !k.ok).map((k) => k.name) })),
        cases: results.map((x) => ({
            id: label(x.c.id),
            group: x.c.group,
            request: x.c.req.ws ? 'WS ' + label(x.c.req.path || '/') : `${x.c.req.method || 'GET'} ${label(x.c.req.path)}`,
            host: x.c.req.noHost ? '(none, ' + x.c.req.noHost + ')' : label((x.c.req.headers && x.c.req.headers.Host) || `127.0.0.1:${P} (default)`),
            headerNames: Object.keys(x.c.req.headers || {}),
            client: x.c.req.localAddress || '127.0.0.1',
            status: x.res.status,
            passed: x.passed,
            checks: x.checks.map((k) => (k.ok ? '' : 'FAIL ') + k.name),
            bodyBytes: x.bodyBytes,
            bodySha256: x.bodySha256,
        })),
        serverLogSecretHits,
    };
    let receiptText = JSON.stringify(receipt, null, 2) + '\n';
    const receiptSecretHits = [S.ftpPass, S.httpFeedCode, S.lanPassword, S.lanWsSecret, S.setupToken, NIC, MACHINE].filter((s) => s && receiptText.includes(s)).length;
    receipt.receiptSecretHits = receiptSecretHits;
    receiptText = JSON.stringify(receipt, null, 2) + '\n';
    if (process.env.F099_RECEIPT) fs.writeFileSync(process.env.F099_RECEIPT, receiptText);
    if (process.env.F099_SERVER_LOG) {
        const redacted = label(serverLog.split(tmp).join('<tmp>'))
            .replace(/[A-Za-z]:(\\{1,2}|\/)Users\1[^\\/\s'"]+/g, '<user-home>')
            .replace(/file:\/\/\/[A-Za-z]:\/Users\/[^/\s'"]+/g, '<user-home>');
        fs.writeFileSync(process.env.F099_SERVER_LOG, redacted + '\n');
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(JSON.stringify({ mode, appTree: receipt.appTree, summary, failures: receipt.failures, serverLogSecretHits, receiptSecretHits }, null, 1));
    process.exitCode = summary.failed === 0 && serverLogSecretHits === 0 && receiptSecretHits === 0 ? 0 : 1;
}

/** HTTP/1.1 without Host: Node's HTTP server rejects this itself (requireHostHeader). */
function rawHttp11NoHost(port, p) {
    return new Promise((resolve) => {
        const sock = net.connect({ host: '127.0.0.1', port });
        const chunks = [];
        sock.setTimeout(10000, () => sock.destroy());
        sock.on('connect', () => sock.write(`GET ${p} HTTP/1.1\r\nConnection: close\r\n\r\n`));
        sock.on('data', (c) => chunks.push(c));
        sock.on('close', () => {
            const raw = Buffer.concat(chunks);
            const status = Number((/^HTTP\/1\.[01] (\d{3})/.exec(raw.toString('latin1')) || [])[1]) || 'error:no-status';
            const sep = raw.indexOf('\r\n\r\n');
            resolve({ status, headers: {}, body: sep >= 0 ? raw.subarray(sep + 4) : Buffer.alloc(0) });
        });
        sock.on('error', () => {});
    });
}

if (process.argv.includes('--serve')) {
    await serve();
} else {
    await main();
}
