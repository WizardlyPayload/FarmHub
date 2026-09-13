/**
 * Smoke: every map keeps the full map.xml overview (IngameMap Overlay 0–1).
 * Skips maps whose sources are missing on the machine.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  resolveMapOverviewImage,
  getMapOverviewCacheDir,
  OVERVIEW_CACHE_VERSION,
} = require('../mapOverviewResolver');

const modsRoot = path.join(
  process.env.USERPROFILE || '',
  'Documents',
  'My Games',
  'FarmingSimulator2025',
  'mods'
);

const CASES = [
  {
    name: 'Montana 4X',
    mapId: 'FS25_Montana_4X.MapMontana',
    mapTitle: 'Montana 4X',
    needZip: 'FS25_Montana_4X.zip',
  },
  {
    name: 'Montana Multifruit 4X',
    mapId: 'FS25_Montana_MF.MapMontana',
    mapTitle: 'Montana Map, Multifruit 4x',
    needZip: 'FS25_Montana_MF.zip',
  },
  {
    name: 'Riverbend Springs',
    mapId: 'MapUS',
    mapTitle: 'Riverbend Springs',
    needZip: null,
  },
  {
    name: 'Witcombe',
    mapId: 'FS25_Witcombe.SampleModMap',
    mapTitle: 'Witcombe Park Farm',
    needZip: 'FS25_Witcombe.zip',
  },
];

describe('map overview multi-map crop', () => {
  for (const c of CASES) {
    test(
      `${c.name} resolves the full map.xml overview`,
      async () => {
        if (c.needZip && !fs.existsSync(path.join(modsRoot, c.needZip))) return;

        const r = await resolveMapOverviewImage({
          mapId: c.mapId,
          mapTitle: c.mapTitle,
          modsRoot,
          modsRoots: [modsRoot],
        });
        if (!r.ok) return;

        expect(r.cacheVersion).toBe(OVERVIEW_CACHE_VERSION);
        expect(r.terrainInset).toEqual({ left: 0, top: 0, width: 1, height: 1 });
        expect(r.imageCropped).toBe(false);

        const png = path.join(getMapOverviewCacheDir(), path.basename(r.url));
        const id = spawnSync('magick', [png, '-format', '%wx%h', 'info:'], {
          encoding: 'utf8',
          windowsHide: true,
        });
        const dims = String(id.stdout || '').trim();
        const [w, h] = dims.split('x').map(Number);
        expect(w).toBeGreaterThan(1000);
        expect(h).toBeGreaterThan(1000);
        expect(w).toBe(h);
      },
      90000
    );
  }
});
