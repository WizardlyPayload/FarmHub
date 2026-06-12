const cjs = require('../fillTypeResolve.cjs');

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
});
