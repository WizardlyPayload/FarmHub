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
    expect(analysis.pinInset.width).toBeCloseTo(analysis.pinInset.height, 2);
    expect(analysis.pinInset.width).toBeGreaterThan(0.45);
    expect(analysis.shouldCrop).toBe(true);
    expect(analysis.mode).toBe("framed-square");
    expect(analysis.methods.satellite).not.toBeNull();
  });

  test('resolvePinTerrainInset applies left display pad and keeps rect', () => {
    const {
      resolvePinTerrainInset,
      DISPLAY_LEFT_PAD,
    } = require('../mapOverviewTerrainInset.cjs');
    const inset = resolvePinTerrainInset({
      left: 0.115,
      top: 0.25,
      width: 0.636,
      height: 0.5,
    });
    expect(inset.left).toBeCloseTo(0.115 + DISPLAY_LEFT_PAD, 3);
    expect(inset.top).toBeCloseTo(0.25, 2);
    expect(inset.width).toBeCloseTo(0.636 - DISPLAY_LEFT_PAD, 3);
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

  test('refineInsetTrimFrameEdges trims leather desk left of satellite', () => {
    const { refineInsetTrimFrameEdges } = require('../mapOverviewTerrainInset.cjs');
    const size = 256;
    const buf = fillRgb(size, (x, y) => {
      const inTerrain = x >= 64 && x < 208 && y >= 64 && y < 192;
      if (inTerrain) return [90, 110, 50];
      return [95, 55, 28];
    });
    const loose = { left: 0.1, top: 0.25, width: 0.75, height: 0.5 };
    const refined = refineInsetTrimFrameEdges(buf, size, loose);
    expect(refined.left).toBeGreaterThan(0.2);
    expect(refined.left + refined.width).toBeLessThan(0.85);
  });

  test("largest mapish blob ignores promo sidebar thumbnails", () => {
    const { scanLargestMapishBlob, squareizeTerrainInset } = require("../mapOverviewTerrainInset.cjs");
    const size = 256;
    const buf = fillRgb(size, (x, y) => {
      const inMain = x >= 64 && x < 192 && y >= 64 && y < 192;
      const inThumb = x < 36 && y >= 48 && y < 200;
      if (inMain || inThumb) return [90, 110, 50];
      return [90, 55, 25];
    });
    const blob = scanLargestMapishBlob(buf, size);
    expect(blob.left).toBeGreaterThan(0.2);
    expect(blob.width).toBeLessThan(0.6);
    const square = squareizeTerrainInset(blob, "start");
    expect(square.width).toBeCloseTo(square.height, 2);
    expect(square.left).toBeGreaterThan(0.2);
  });

  test('near-full map with thin edge pixels is treated as the terrain square', () => {
    const size = 256;
    const buf = fillRgb(size, (x, y) => {
      const inTerrain = x >= 8 && x < 248 && y >= 8 && y < 248;
      if (inTerrain) return [90, 110, 50];
      return [20, 18, 14];
    });
    const analysis = analyzeOverviewTerrain(buf, size);
    expect(analysis.shouldCrop).toBe(false);
    expect(analysis.pinInset).toEqual({ left: 0, top: 0, width: 1, height: 1 });
    expect(analysis.mode).toBe("full-bleed");
  });

  test('dark forest rim is terrain, not a frame (any-map Riverbend shape)', () => {
    const {
      isFramePixel,
      isVoidPixel,
      isTerrainContentPixel,
      classifyOverviewChrome,
    } = require('../mapOverviewTerrainInset.cjs');
    expect(isVoidPixel(2, 1, 2)).toBe(true);
    expect(isFramePixel(27, 36, 22)).toBe(false);
    expect(isTerrainContentPixel(27, 36, 22)).toBe(true);
    expect(isFramePixel(90, 55, 25)).toBe(true);

    const size = 256;
    const buf = fillRgb(size, (x, y) => {
      if (x < 2 || y < 2 || x > size - 3 || y > size - 3) return [2, 1, 2];
      const inFields = x >= 24 && x < 232 && y >= 24 && y < 232;
      if (inFields) return [90, 110, 50];
      return [27, 36, 22];
    });
    const chrome = classifyOverviewChrome(buf, size);
    expect(chrome.kind).toBe('full-photograph');
    const analysis = analyzeOverviewTerrain(buf, size);
    expect(analysis.shouldCrop).toBe(false);
    expect(analysis.pinInset).toEqual({ left: 0, top: 0, width: 1, height: 1 });
    expect(analysis.methods.chromeKind).toBe('full-photograph');
  });

  test('empty letterbox around a square photograph is cropped', () => {
    const size = 256;
    const buf = fillRgb(size, (x, y) => {
      const inMap = x >= 48 && x < 208 && y >= 48 && y < 208;
      if (inMap) return [90, 110, 50];
      return [2, 2, 2];
    });
    const analysis = analyzeOverviewTerrain(buf, size);
    expect(analysis.shouldCrop).toBe(true);
    expect(analysis.pinInset.left).toBeGreaterThan(0.12);
    expect(analysis.pinInset.width).toBeLessThan(0.75);
    expect(analysis.pinInset.width).toBeCloseTo(analysis.pinInset.height, 2);
  });

  test('sunset poster around a square satellite is cropped to the photograph', () => {
    const size = 256;
    const buf = fillRgb(size, (x, y) => {
      const inMap = x >= 64 && x < 192 && y >= 64 && y < 192;
      if (inMap) return [90, 110, 50];
      return [200, 90, 40];
    });
    const analysis = analyzeOverviewTerrain(buf, size);
    expect(analysis.shouldCrop).toBe(true);
    expect(analysis.pinInset.left).toBeGreaterThan(0.18);
    expect(analysis.pinInset.left + analysis.pinInset.width).toBeLessThan(0.82);
    expect(analysis.pinInset.width).toBeCloseTo(analysis.pinInset.height, 2);
  });
});
