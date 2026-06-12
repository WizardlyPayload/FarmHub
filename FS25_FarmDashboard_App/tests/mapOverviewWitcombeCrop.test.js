const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  detectTerrainInsetFromPng,
  getMapOverviewCacheDir,
  postProcessOverviewPng,
  OVERVIEW_CACHE_VERSION,
} = require('../mapOverviewResolver');
const { shouldCropOverviewToTerrain } = require('../mapOverviewTerrainInset.cjs');
const { terrainClipPixelSize } = require('../fleetMapGeo.cjs');

const WITCOMBE_CACHED = path.join(
  getMapOverviewCacheDir(),
  'fs25_witcombe_74f4b1414801.png'
);

describe('Witcombe overview terrain clip', () => {
  test('cached Witcombe PNG has detectable desk border when present', async () => {
    if (!fs.existsSync(WITCOMBE_CACHED)) return;

    const inset = await detectTerrainInsetFromPng(
      WITCOMBE_CACHED,
      'fs25_witcombe',
      'FS25_Witcombe.SampleModMap'
    );
    expect(shouldCropOverviewToTerrain(inset)).toBe(true);
    expect(inset.top).toBeGreaterThan(0.2);
    expect(inset.top).toBeLessThan(0.3);
    expect(inset.width).toBeGreaterThan(0.55);
    expect(inset.width).toBeLessThan(0.7);
    expect(inset.height).toBeGreaterThan(0.45);
    expect(inset.height).toBeLessThan(0.55);
  });

  test('postProcess keeps full PNG and returns terrainInset for client clip', async () => {
    if (!fs.existsSync(WITCOMBE_CACHED)) return;

    const tmp = WITCOMBE_CACHED.replace('.png', '_clip_test.png');
    fs.copyFileSync(WITCOMBE_CACHED, tmp);
    try {
      const result = await postProcessOverviewPng(tmp, 'fs25_witcombe', 'FS25_Witcombe.SampleModMap');
      expect(result.imageCropped).toBe(false);
      expect(result.terrainInset.width).toBeGreaterThan(0.5);

      const id = spawnSync('magick', [tmp, '-format', '%wx%h', 'info:'], {
        encoding: 'utf8',
        windowsHide: true,
      });
      expect(id.stdout.trim()).toBe('4096x4096');

      const clip = terrainClipPixelSize(4096, 4096, result.terrainInset);
      expect(clip.w).toBeGreaterThan(2300);
      expect(clip.h).toBeGreaterThan(1900);
      expect(clip.w / clip.h).toBeGreaterThan(1.1);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  test('v6 cache meta includes terrainInset without server crop', () => {
    const metaPath = path.join(
      getMapOverviewCacheDir(),
      'fs25_witcombe_74f4b1414801.json'
    );
    if (!fs.existsSync(WITCOMBE_CACHED) || !fs.existsSync(metaPath)) return;

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (meta.cacheVersion !== OVERVIEW_CACHE_VERSION) return;

    expect(meta.imageCropped).toBe(false);
    expect(meta.terrainInset).toBeTruthy();
    const id = spawnSync('magick', [WITCOMBE_CACHED, '-format', '%wx%h', 'info:'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    expect(id.stdout.trim()).toBe('4096x4096');
  });
});
