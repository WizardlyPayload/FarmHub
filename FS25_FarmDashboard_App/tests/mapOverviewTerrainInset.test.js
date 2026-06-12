const {
  analyzeOverviewTerrain,
  detectTerrainInsetFromRgb,
  shouldCropOverviewToTerrain,
  isMapishPixel,
  normalizeToSquareTerrainInset,
} = require('../mapOverviewTerrainInset.cjs');

function fillRgb(size, paint) {
  const buf = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = paint(x, y);
      const i = (y * size + x) * 3;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
    }
  }
  return buf;
}

describe('mapOverviewTerrainInset', () => {
  test('isMapishPixel distinguishes field green from leather brown', () => {
    expect(isMapishPixel(102, 132, 93)).toBe(true);
    expect(isMapishPixel(107, 64, 29)).toBe(false);
  });

  test('analyzeOverviewTerrain finds centred PDA desk frame', () => {
    const size = 256;
    const buf = fillRgb(size, (x, y) => {
      const inTerrain = x >= 48 && x < 208 && y >= 64 && y < 192;
      if (inTerrain) return [90, 110, 50];
      return [90, 55, 25];
    });
    const analysis = analyzeOverviewTerrain(buf, size);
    expect(analysis.pinInset.left).toBeGreaterThan(0.1);
    expect(analysis.pinInset.top).toBeGreaterThan(0.2);
    expect(analysis.pinInset.width).toBeGreaterThan(0.55);
    expect(analysis.pinInset.height).toBeGreaterThan(0.4);
    expect(analysis.shouldCrop).toBe(true);
    expect(analysis.methods.satellite).not.toBeNull();
  });

  test('resolvePinTerrainInset keeps rectangular satellite bounds', () => {
    const { resolvePinTerrainInset } = require('../mapOverviewTerrainInset.cjs');
    const inset = resolvePinTerrainInset({
      left: 0.115,
      top: 0.25,
      width: 0.636,
      height: 0.5,
    });
    expect(inset.left).toBeCloseTo(0.115, 2);
    expect(inset.top).toBeCloseTo(0.25, 2);
    expect(inset.width).toBeCloseTo(0.636, 2);
    expect(inset.height).toBeCloseTo(0.5, 2);
  });

  test('full-bleed terrain returns near-full inset and no crop', () => {
    const size = 128;
    const buf = fillRgb(size, () => [95, 120, 55]);
    const analysis = analyzeOverviewTerrain(buf, size);
    expect(analysis.pinInset.width).toBeGreaterThan(0.95);
    expect(analysis.pinInset.height).toBeGreaterThan(0.95);
    expect(analysis.shouldCrop).toBe(false);
  });

  test('detectTerrainInsetFromRgb exposes raw satellite bounds', () => {
    const size = 256;
    const buf = fillRgb(size, (x, y) => {
      const inTerrain = x >= 32 && x < 224 && y >= 64 && y < 192;
      if (inTerrain) return [90, 110, 50];
      return [90, 55, 25];
    });
    const raw = detectTerrainInsetFromRgb(buf, size);
    expect(shouldCropOverviewToTerrain(raw)).toBe(true);
    expect(raw.width).toBeGreaterThan(0.6);
    expect(raw.height).toBeGreaterThan(0.4);
  });
});
