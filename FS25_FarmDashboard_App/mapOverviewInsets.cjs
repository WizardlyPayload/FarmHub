// FS25 FarmDashboard | mapOverviewInsets.cjs
// Optional manual terrain insets when auto-detection is uncertain (fractions 0–1).

const { roundInset } = require('./mapOverviewTerrainInset.cjs');

/**
 * Curated overrides keyed by map slug fragment (lowercase).
 * Add entries only after verifying pins on a real save — auto-detect handles most maps.
 */
const TERRAIN_INSET_OVERRIDES = {
  // Auto-detect handles Witcombe; add overrides here only when a map still misaligns after testing.
};

function slugKeys(mapSlug, mapId) {
  const keys = new Set();
  for (const raw of [mapSlug, mapId]) {
    const s = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/\.[^.\\/]+$/, '');
    if (!s) continue;
    keys.add(s);
    keys.add(s.replace(/^fs25_/, ''));
    keys.add(s.replace(/^map/, ''));
    if (s.includes('.')) keys.add(s.split('.')[0]);
  }
  return [...keys];
}

function lookupTerrainInsetOverride(mapSlug, mapId) {
  for (const key of slugKeys(mapSlug, mapId)) {
    const hit = TERRAIN_INSET_OVERRIDES[key];
    if (hit && Number(hit.width) > 0 && Number(hit.height) > 0) {
      return { inset: roundInset(hit), force: !!hit.force };
    }
  }
  return null;
}

module.exports = {
  TERRAIN_INSET_OVERRIDES,
  lookupTerrainInsetOverride,
};
