const cjs = require('../fleetMapGeo.cjs');
const fs = require('fs');
const path = require('path');

describe('fleetMapGeo browser/cjs parity', () => {
  const browserSrc = fs.readFileSync(
    path.join(__dirname, '../web/assests/js/modules/fleetMapGeo.js'),
    'utf8'
  );

  test('browser module exports core geo helpers present in fleetMapGeo.cjs', () => {
    const required = [
      'worldToMapPercent',
      'applyOverviewCropPercent',
      'resolveTerrainBounds',
      'resolveOverviewTerrainBounds',
      'terrainClipPixelSize',
      'isFullBleedTerrainInset',
    ];
    for (const name of required) {
      expect(typeof cjs[name]).toBe('function');
      expect(browserSrc).toMatch(new RegExp(`export function ${name}\\(`));
    }
  });

  test('resolveOverviewTerrainBounds matches between cjs copies for 4 km save', () => {
    const dash = {
      serverInfo: {
        mapBounds: {
          halfSize: 2048,
          terrainSize: 4096,
          minX: -2048,
          maxX: 2048,
          minZ: -2048,
          maxZ: 2048,
        },
      },
    };
    expect(cjs.resolveOverviewTerrainBounds(dash).halfSize).toBe(1024);
  });
});
