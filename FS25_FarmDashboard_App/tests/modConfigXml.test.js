const {
    parseModConfigXml,
    buildModConfigXml,
    patchModConfigAttr,
    MOD_CONFIG_MODULE_KEYS,
} = require('../modConfigXml');

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

    test('falls back to template when existing text is garbage', () => {
        const out = buildModConfigXml({ modules: {} }, 'not xml at all');
        expect(out).toMatch(/<farmDashboard>/);
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
