'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('../../NEW APP/node_modules/typescript');

const filename = process.env.FARMDASH_SETUP_TEST_SOURCE
    || path.join(__dirname, '..', '..', 'NEW APP', 'src', 'setup', 'main.tsx');
const source = fs.readFileSync(filename, 'utf8');
const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const loader = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'loadConfig');
if (!loader) throw new Error('Actual setup loadConfig function not found');
const script = ts.transpileModule(loader.getText(parsed), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function runtime(api, fetch = jest.fn()) {
    const context = vm.createContext({
        getFarmDashApi: () => api,
        window: { __FARMDASH_SETUP_TOKEN: 'test-only-token' },
        fetch,
    });
    vm.runInContext(script, context);
    return { load: () => context.loadConfig(), fetch };
}

test.each([undefined, null])('missing desktop config (%s) is a valid empty first-run profile', async (value) => {
    const { load, fetch } = runtime({ getCurrentConfig: jest.fn().mockResolvedValue(value) });
    await expect(load()).resolves.toEqual({});
    expect(fetch).not.toHaveBeenCalled();
});

test('existing desktop server settings are returned without replacement or mutation', async () => {
    const config = { isConfigured: true, servers: [{ id: 'existing-save', localSubFolder: 'savegame2' }] };
    const { load } = runtime({ getCurrentConfig: jest.fn().mockResolvedValue(config) });
    expect(await load()).toBe(config);
    expect(config.servers).toHaveLength(1);
});

test('desktop read failures are not turned into an empty profile or an HTTP fallback', async () => {
    const failure = new Error('configuration_read_failed');
    const { load, fetch } = runtime({ getCurrentConfig: jest.fn().mockRejectedValue(failure) });
    await expect(load()).rejects.toBe(failure);
    expect(fetch).not.toHaveBeenCalled();
});

test('IPC access rejection remains an error', async () => {
    const { load } = runtime({ getCurrentConfig: jest.fn().mockRejectedValue(new Error('untrusted_sender')) });
    await expect(load()).rejects.toThrow('untrusted_sender');
});

test('browser first-run configuration keeps its authenticated local HTTP path', async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const { load } = runtime(null, fetch);
    await expect(load()).resolves.toEqual({});
    expect(fetch).toHaveBeenCalledWith('/api/setup-config', {
        cache: 'no-store', headers: { 'X-Setup-Token': 'test-only-token' },
    });
});

test('HTTP access errors are not mistaken for an unconfigured profile', async () => {
    const fetch = jest.fn().mockResolvedValue({
        ok: false, status: 403, json: async () => ({ errorCode: 'E_SETUP_LOCAL_ONLY' }),
    });
    await expect(runtime(null, fetch).load()).rejects.toThrow('E_SETUP_LOCAL_ONLY');
});
