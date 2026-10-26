const { productionTs } = require('./helpers/production-source.cjs');

const demo = productionTs('NEW APP/src/platform/demo-source.ts');
const registry = productionTs('NEW APP/src/sections/mods/registry.ts', {
    '@/platform/demo-source': demo,
});

test('recorded sidebar opens only a populated admitted companion page', () => {
    const payload = {
        dataSource: 'recorded-demo',
        companionMods: { mods: [
            { id: 'betterContracts', detected: true },
            { id: 'everythingConstructable', detected: true },
        ] },
        companionPages: { pages: {} },
    };
    expect(registry.visibleCompanionPages(payload)).toEqual([]);
    payload.companionPages.pages.everythingConstructable = {
        key: 'everythingConstructable', detected: true, readState: 'ok',
        projects: [{ farmId: 1, phase: 2, materials: [] }],
    };
    expect(registry.visibleCompanionPages(payload).map((page) => page.key))
        .toEqual(['everythingConstructable']);
    payload.companionPages.pages.everythingConstructable.projects = [];
    expect(registry.visibleCompanionPages(payload)).toEqual([]);
    delete payload.dataSource;
    expect(registry.visibleCompanionPages(payload).map((page) => page.key))
        .toEqual(expect.arrayContaining(['betterContracts', 'everythingConstructable']));
});
