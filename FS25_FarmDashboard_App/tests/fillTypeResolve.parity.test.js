const cjs = require('../fillTypeResolve.cjs');
const { buildFillTypeCatalog } = require('../dataMerger.js');

describe('fillTypeResolve parity (cjs vs browser module contract)', () => {
  test('inferFillTypeFromLocations resolves liquid fertilizer from tank name', () => {
    const hit = cjs.inferFillTypeFromLocations([{ name: 'Herbicide Tank' }]);
    expect(hit?.name).toBe('LIQUID_FERTILIZER');
  });

  test('enrichStockFillTypes maps catalog index to fill type name', () => {
    const stock = {
      byFarm: {
        1: {
          items: [{ fillTypeIndex: 42, fillType: '42', locations: [{ name: 'Silo' }] }],
        },
      },
    };
    const catalog = { 42: 'WHEAT' };
    const out = cjs.enrichStockFillTypes(stock, catalog);
    expect(out.stock.byFarm['1'].items[0].fillType).toBe('WHEAT');
    expect(out.catalog['42']).toBe('WHEAT');
  });

  test('mergeFillTypeCatalog merges without numeric-only labels', () => {
    const merged = cjs.mergeFillTypeCatalog({ 1: 'WHEAT' }, { 2: '42', 3: 'BARLEY' });
    expect(merged).toEqual({ 1: 'WHEAT', 3: 'BARLEY', 2: '42' });
  });

  test('mergeFillTypeCatalog keeps engine names over sell-point titles', () => {
    const merged = cjs.mergeFillTypeCatalog(
      { 190: 'SOYBEAN2' },
      { 190: 'American Soybean' }
    );
    expect(merged['190']).toBe('SOYBEAN2');
  });

  test('applyFillTypeTitles fills sparse catalog gaps from localized titles', () => {
    const catalog = { 42: 'WHEAT' };
    const titles = { 147: 'Pig Food' };
    const merged = cjs.applyFillTypeTitles(catalog, titles);
    expect(merged['42']).toBe('WHEAT');
    expect(merged['147']).toBe('Pig Food');
  });

  test('enrichStockFillTypes resolves index 147 from titles when catalog is sparse', () => {
    const stock = {
      byFarm: {
        3: {
          items: [{
            fillTypeIndex: 147,
            fillType: '',
            totalLiters: 40000,
            locations: [{ name: 'Silo for Pigfood' }],
          }],
        },
      },
    };
    const titles = { 147: 'Pig Food' };
    const out = cjs.enrichStockFillTypes(stock, {}, titles);
    expect(out.stock.byFarm['3'].items[0].fillType).toBe('Pig Food');
    expect(out.catalog['147']).toBe('Pig Food');
  });

  test('buildFillTypeCatalog merges game-exported fillTypeTitles before heuristics', () => {
    const lua = {
      fillTypeCatalog: { 42: 'WHEAT' },
      fillTypeTitles: { 147: 'Pig Food' },
      stock: {
        byFarm: {
          3: {
            items: [{ fillTypeIndex: 147, fillType: '', totalLiters: 40000 }],
          },
        },
      },
      fields: [],
    };
    const catalog = buildFillTypeCatalog(lua, {});
    expect(catalog['42']).toBe('WHEAT');
    expect(catalog['147']).toBe('Pig Food');
  });

  test('buildFillTypeCatalog fills map extras without replacing lua names', () => {
    const lua = {
      fillTypeCatalog: { 6: 'CUSTOM_CROP' },
      stock: { byFarm: {} },
      fields: [],
    };
    const catalog = buildFillTypeCatalog(lua, {}, { 6: 'SORGHUM', 190: 'LINSEED', 30: 'DRYGRASS_WINDROW' });
    expect(catalog['6']).toBe('CUSTOM_CROP');
    expect(catalog['190']).toBe('LINSEED');
    expect(catalog['30']).toBe('DRYGRASS_WINDROW');
  });

  test('enrichStockFillTypesFromPlaceables resolves index from savegame silo fill types', () => {
    const stock = {
      byFarm: {
        3: {
          farmId: 3,
          items: [{
            fillTypeIndex: 147,
            fillType: '',
            totalLiters: 14800,
            locations: [{ name: 'Silo for Pigfood' }],
          }],
        },
      },
    };
    const placeables = [{
      farmId: 3,
      name: '',
      displayName: 'pigfood Silo',
      basename: 'pigfoodSilo',
      filename: '$pdlcdir$highlandsFishingPack/placeables/brandless/pigfoodSilo/pigfoodSilo.xml',
      siloFillTypes: ['PIGFOOD'],
      storageFillLevels: { PIGFOOD: 14800 },
    }];
    const out = cjs.enrichStockFillTypesFromPlaceables(stock, placeables, {});
    expect(out.stock.byFarm['3'].items[0].fillType).toBe('PIGFOOD');
    expect(out.catalog['147']).toBe('PIGFOOD');
  });
});
