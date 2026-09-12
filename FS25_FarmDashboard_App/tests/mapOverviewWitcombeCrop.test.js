const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  getMapOverviewCacheDir,
  resolveMapOverviewImage,
  OVERVIEW_CACHE_VERSION,
} = require('../mapOverviewResolver');

const modsRoot = path.join(
  process.env.USERPROFILE || '',
  'Documents',
  'My Games',
  'FarmingSimulator2025',
  'mods'
);

describe('Witcombe overview (IngameMap Overlay 0–1, no pixel crop)', () => {
  test('resolve keeps the full map.xml overview image', async () => {
    const zip = path.join(modsRoot, 'FS25_Witcombe.zip');
    if (!fs.existsSync(zip)) return;

    const dir = getMapOverviewCacheDir();
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith('fs25_witcombe_')) fs.rmSync(path.join(dir, f), { force: true });
    }

    const r = await resolveMapOverviewImage({
      mapId: 'FS25_Witcombe.SampleModMap',
      mapTitle: 'Witcombe Park Farm',
      modsRoot,
      modsRoots: [modsRoot],
    });
    expect(r.ok).toBe(true);
    expect(r.imageCropped).toBe(false);
    expect(r.terrainInset).toEqual({ left: 0, top: 0, width: 1, height: 1 });
    expect(r.cacheVersion).toBe(OVERVIEW_CACHE_VERSION);

    const png = path.join(dir, path.basename(r.url));
    const id = spawnSync('magick', [png, '-format', '%wx%h', 'info:'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    const dims = String(id.stdout || '').trim();
    const [w, h] = dims.split('x').map(Number);
    expect(w).toBeGreaterThan(1000);
    expect(h).toBeGreaterThan(1000);
    expect(w).toBe(h);
  }, 60000);
});
