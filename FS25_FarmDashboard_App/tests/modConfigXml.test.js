const {
    parseModConfigXml,
    buildModConfigXml,
    patchModConfigAttr,
    planModConfigWrite,
    classifyModConfigText,
    commitModConfig,
    handleGetModConfig,
    handleSaveModConfig,
    modConfigRevision,
    MOD_CONFIG_MODULE_KEYS,
} = require('../modConfigXml');
const fs = require('fs');
const os = require('os');
const path = require('path');

// A realistic config.xml as the FS25 mod actually writes it (rich settings + stock/redTape).
const MOD_WRITTEN_XML = `<?xml version="1.0" encoding="utf-8"?>
<farmDashboard>
    <settings updateInterval="10000" collectionCycleMs="60000" debugBaleScan="false" diagnostics="true" animalRowsPerSlice="256" sliceBudgetMs="4" detailMaxAgeSec="60" detailFileCapBase="512" stockPlaceablesPerFrame="3" baleWorldEntitiesPerFrame="8" financeVehiclesPerFrame="4" redTapeFarmsPerFrame="1" fieldsPerFrame="1" baleEntitiesBudget="8" vehiclesPerFrame="2" husbandryPlaceablesPerFrame="1" jsonTopLevelKeysPerFrame="1" economyYieldStride="20" economyRowsPerSlice="64" postLoadCollectionGraceSec="30" collectionSafetyV5Applied="true"/>
    <modules animals="true" vehicles="true" weather="true" fields="true" finance="true" economy="true" production="true" stock="false" redTape="false"/>
</farmDashboard>
`;

describe('modConfigXml.parseModConfigXml', () => {
    test('reads stock and redTape module flags', () => {
        const cfg = parseModConfigXml(MOD_WRITTEN_XML);
        expect(cfg.modules.stock).toBe(false);
        expect(cfg.modules.redTape).toBe(false);
        expect(cfg.modules.animals).toBe(true);
    });

    test('useStateMachine_* false does not flip modules fields/economy/production', () => {
        const xml = `<?xml version="1.0" encoding="utf-8"?>
<farmDashboard>
    <settings useStateMachine_economy="false" useStateMachine_fields="false" useStateMachine_production="false"/>
    <modules animals="true" vehicles="true" weather="true" fields="true" finance="true" economy="true" production="true" stock="true" redTape="true"/>
</farmDashboard>`;
        const cfg = parseModConfigXml(xml);
        expect(cfg.modules.fields).toBe(true);
        expect(cfg.modules.economy).toBe(true);
        expect(cfg.modules.production).toBe(true);
    });

    test('defaults include stock/redTape when file is empty', () => {
        const cfg = parseModConfigXml('');
        expect(cfg.modules.stock).toBe(true);
        expect(cfg.modules.redTape).toBe(true);
    });
});

describe('modConfigXml.buildModConfigXml (read-modify-write)', () => {
    test('preserves mod-owned settings the editor does not manage', () => {
        const editor = parseModConfigXml(MOD_WRITTEN_XML);
        editor.collectionCycleMs = 90000; // user changes one managed value
        const out = buildModConfigXml(editor, MOD_WRITTEN_XML);

        // Managed value updated
        expect(out).toMatch(/collectionCycleMs="90000"/);
        // Unmanaged settings preserved verbatim
        expect(out).toMatch(/diagnostics="true"/);
        expect(out).toMatch(/animalRowsPerSlice="256"/);
        expect(out).toMatch(/stockPlaceablesPerFrame="3"/);
        expect(out).toMatch(/redTapeFarmsPerFrame="1"/);
        expect(out).toMatch(/collectionSafetyV5Applied="true"/);
        expect(out).toMatch(/economyRowsPerSlice="64"/);
    });

    test('does not drop stock/redTape module flags on save', () => {
        const editor = parseModConfigXml(MOD_WRITTEN_XML);
        const out = buildModConfigXml(editor, MOD_WRITTEN_XML);
        expect(out).toMatch(/stock="false"/);
        expect(out).toMatch(/redTape="false"/);
    });

    test('round-trips a toggled module flag', () => {
        const editor = parseModConfigXml(MOD_WRITTEN_XML);
        editor.modules.stock = true; // user re-enables stock in the editor
        const out = buildModConfigXml(editor, MOD_WRITTEN_XML);
        expect(out).toMatch(/stock="true"/);
        // and other unmanaged keys still survive
        expect(out).toMatch(/diagnostics="true"/);
        expect(parseModConfigXml(out).modules.stock).toBe(true);
    });

    test('falls back to a full template when no existing file', () => {
        const out = buildModConfigXml({ modules: {} }, null);
        expect(out).toMatch(/<farmDashboard>/);
        expect(out).toMatch(/<settings /);
        expect(out).toMatch(/<modules /);
        for (const k of MOD_CONFIG_MODULE_KEYS) {
            expect(out).toMatch(new RegExp(`${k}="(true|false)"`));
        }
    });

    test('refuses to replace malformed existing config', () => {
        const out = buildModConfigXml({ modules: {} }, 'not xml at all');
        expect(out).toBeNull();
    });

    test('clamps managed numeric values', () => {
        const out = buildModConfigXml({ updateInterval: 50, collectionCycleMs: 9999999 }, null);
        expect(out).toMatch(/updateInterval="1000"/); // floored
        expect(out).toMatch(/collectionCycleMs="1800000"/); // ceiled
    });
});

describe('modConfigXml.patchModConfigAttr', () => {
    test('adds an attribute that was missing', () => {
        const out = patchModConfigAttr('<settings updateInterval="10000"/>', 'settings', 'newKey', 5);
        expect(out).toMatch(/newKey="5"/);
        expect(out).toMatch(/updateInterval="10000"/);
    });

    test('replaces only the targeted attribute', () => {
        const out = patchModConfigAttr('<modules animals="true" stock="false"/>', 'modules', 'animals', 'false');
        expect(out).toMatch(/animals="false"/);
        expect(out).toMatch(/stock="false"/);
    });
});

describe('modConfigXml.planModConfigWrite', () => {
    test('a missing file may be initialized', () => {
        const built = buildModConfigXml({ modules: {} }, null);
        expect(planModConfigWrite(false, null, built)).toEqual({ ok: true, xml: built });
    });

    test('an unreadable present file is not treated as missing', () => {
        const plan = planModConfigWrite(true, null, buildModConfigXml({ modules: {} }, null));
        expect(plan).toEqual({ ok: false, error: 'unreadable', preserved: true });
    });

    test('a malformed present file is preserved', () => {
        const plan = planModConfigWrite(true, 'not xml at all', null);
        expect(plan).toEqual({ ok: false, error: 'malformed-config', preserved: true });
    });

    test('a concurrent game edit is a conflict and is not overwritten', () => {
        const plan = planModConfigWrite(true, '<farmDashboard/>', '<rewritten/>', '<original/>');
        expect(plan).toEqual({ ok: false, error: 'conflict', preserved: true });
    });
});

describe('mod config read and commit', () => {
    test('an unreadable present file is not reported as missing', () => {
        const state = classifyModConfigText(true, null);
        expect(state.exists).toBe(true);
        expect(state.presence).toBe('unreadable');
        expect(state.revision).toBeNull();
    });

    test('a duplicate modules block is refused and the original bytes stay', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farmhub-modcfg-'));
        const file = path.join(dir, 'config.xml');
        const original = '<farmDashboard><settings updateInterval="10000"/><modules fields="false"/><modules fields="true"/></farmDashboard>';
        fs.writeFileSync(file, original);
        const revision = modConfigRevision(original);
        const result = commitModConfig(file, { expectedRevision: revision, modules: { fields: true } });
        expect(result).toMatchObject({ ok: false, error: 'duplicate-structure', preserved: true });
        expect(fs.readFileSync(file, 'utf8')).toBe(original);
    });

    test('missing initialization requires the missing revision, and a file that appears is a conflict', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farmhub-modcfg-miss-'));
        const file = path.join(dir, 'config.xml');
        expect(commitModConfig(file, { modules: { fields: false } })).toMatchObject({ ok: false, error: 'revision-required' });
        const created = commitModConfig(file, { expectedRevision: 'missing', modules: { fields: false } });
        expect(created.ok).toBe(true);
        expect(fs.readFileSync(file, 'utf8')).toMatch(/fields="false"/);
        fs.writeFileSync(file, fs.readFileSync(file, 'utf8') + '\n');
        const stale = commitModConfig(file, { expectedRevision: 'missing', modules: {} });
        expect(stale).toMatchObject({ ok: false, error: 'conflict', preserved: true });
    });

    test('a changed-on-disk revision is a conflict and a failed write leaves the original', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farmhub-modcfg-rev-'));
        const file = path.join(dir, 'config.xml');
        const original = MOD_WRITTEN_XML;
        fs.writeFileSync(file, original);
        const revision = modConfigRevision(original);
        fs.writeFileSync(file, original.replace('fields="true"', 'fields="false"'));
        const conflict = commitModConfig(file, { expectedRevision: revision, modules: { fields: true } });
        expect(conflict).toMatchObject({ ok: false, error: 'conflict', preserved: true });
        expect(fs.readFileSync(file, 'utf8')).toContain('fields="false"');
        const current = modConfigRevision(fs.readFileSync(file, 'utf8'));
        const real = fs.writeFileSync;
        fs.writeFileSync = () => { throw new Error('disk full'); };
        try {
            const failed = commitModConfig(file, { expectedRevision: current, updateInterval: 20000 });
            expect(failed).toMatchObject({ ok: false, error: 'write-failed', preserved: true });
            expect(fs.readFileSync(file, 'utf8')).toContain('fields="false"');
        } finally {
            fs.writeFileSync = real;
        }
    });
});

describe('registered mod-config handlers', () => {
    const mainSrc = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');

    test('main.js registers the production get and save handlers', () => {
        expect(mainSrc).toMatch(/registerTrustedHandle\('get-mod-config'/);
        expect(mainSrc).toMatch(/handleGetModConfig\(getModConfigPath\(\)/);
        expect(mainSrc).toMatch(/registerTrustedHandle\('save-mod-config'/);
        expect(mainSrc).toMatch(/handleSaveModConfig\(getModConfigPath\(\)/);
    });

    test('the save handler feeds the loaded revision and refuses a stale one', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farmhub-modcfg-ipc-'));
        const file = path.join(dir, 'config.xml');
        const io = {
            pathExists: async (p) => fs.existsSync(p),
            readFile: async (p) => fs.readFileSync(p, 'utf8'),
            assertGameWritesAllowed: async () => ({ ok: true }),
        };
        const missing = await handleGetModConfig(file, io);
        expect(missing.presence).toBe('missing');
        expect(missing.revision).toBe('missing');
        const created = await handleSaveModConfig(file, {
            expectedRevision: missing.revision,
            modules: { fields: false },
        }, io);
        expect(created.ok).toBe(true);
        const loaded = await handleGetModConfig(file, io);
        expect(loaded.presence).toBe('ok');
        expect(loaded.modules.fields).toBe(false);
        const second = await handleSaveModConfig(file, {
            expectedRevision: loaded.revision,
            modules: { fields: true },
        }, io);
        expect(second.ok).toBe(true);
        const stale = await handleSaveModConfig(file, {
            expectedRevision: loaded.revision,
            modules: { fields: false },
        }, io);
        expect(stale).toMatchObject({ ok: false, error: 'conflict', preserved: true });
        expect(fs.readFileSync(file, 'utf8')).toMatch(/fields="true"/);
    });

    test('two source config paths do not overwrite each other', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farmhub-modcfg-src-'));
        const fileA = path.join(dir, 'source-a', 'config.xml');
        const fileB = path.join(dir, 'source-b', 'config.xml');
        fs.mkdirSync(path.dirname(fileA), { recursive: true });
        fs.mkdirSync(path.dirname(fileB), { recursive: true });
        const io = {
            pathExists: async (p) => fs.existsSync(p),
            readFile: async (p) => fs.readFileSync(p, 'utf8'),
            assertGameWritesAllowed: async () => ({ ok: true }),
        };
        const missingA = await handleGetModConfig(fileA, io);
        await handleSaveModConfig(fileA, { expectedRevision: missingA.revision, modules: { fields: false } }, io);
        const missingB = await handleGetModConfig(fileB, io);
        await handleSaveModConfig(fileB, { expectedRevision: missingB.revision, modules: { fields: true } }, io);
        expect(fs.readFileSync(fileA, 'utf8')).toMatch(/fields="false"/);
        expect(fs.readFileSync(fileB, 'utf8')).toMatch(/fields="true"/);
        expect(fs.readFileSync(fileA, 'utf8')).not.toMatch(/fields="true"/);
    });

    test('an unreadable present file stays present through the get handler', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farmhub-modcfg-unread-'));
        const file = path.join(dir, 'config.xml');
        fs.writeFileSync(file, 'present');
        const loaded = await handleGetModConfig(file, {
            pathExists: async () => true,
            readFile: async () => { throw new Error('EACCES'); },
        });
        expect(loaded.exists).toBe(true);
        expect(loaded.presence).toBe('unreadable');
    });
});
