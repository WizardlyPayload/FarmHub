const fs = require('fs');
const path = require('path');

const collectorPath = path.resolve(
  __dirname,
  '../../../FS25_FarmDashboard_Mod/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua'
);

describe('FieldDataCollector bale scan performance guards', () => {
  let source;

  beforeAll(() => {
    source = fs.readFileSync(collectorPath, 'utf8');
  });

  test('default fields path uses cooperative coroutine work', () => {
    expect(source).toMatch(/FieldDataCollector\._fdCo\s*=\s*coroutine\.create/);
    expect(source).toMatch(/FieldDataCollector\._smState\s*=\s*\{\s*stage\s*=\s*"COOPERATIVE"\s*\}/);
    expect(source).not.toMatch(/if FieldDataCollector\._smState ~= nil then[\s\S]{0,400}FieldDataCollector:_collectImpl\(\)/);
  });

  test('bale scan work is capped by the configured bale budget', () => {
    expect(source).toMatch(/FieldDataCollector\._baleYieldStride\s*=\s*math\.max\(4,\s*tonumber\(opts\.baleBudget\)/);
    expect(source).toMatch(/FieldDataCollector\._yieldBaleCounter % stride == 0/);
  });

  test('bale-to-field matching uses parcel-indexed field geometry', () => {
    expect(source).toMatch(/local fieldGeometriesByParcel = \{\}/);
    expect(source).toMatch(/local parcelFields = fieldGeometriesByParcel\[parcel\]/);
    expect(source).toMatch(/local ownedFieldParcels = \{\}/);
  });
});
