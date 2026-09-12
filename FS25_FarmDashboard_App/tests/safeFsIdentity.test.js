const path = require('path');
const os = require('os');
const {
  sanitizeSaveSlot,
  isMirrorSaveSlot,
  sanitizeIdScheme,
  sanitizeMapSlug,
  joinContained,
} = require('../safeFsIdentity.cjs');

describe('safeFsIdentity', () => {
  test('rejects traversal save slots', () => {
    expect(sanitizeSaveSlot('../etc', 'savegame1')).toBe('savegame1');
    expect(sanitizeSaveSlot('savegame1/../x', 'savegame1')).toBe('savegame1');
    expect(sanitizeSaveSlot('mirror_savegame2', 'savegame1')).toBe('mirror_savegame2');
    expect(isMirrorSaveSlot('mirror_savegame2')).toBe(true);
  });

  test('idScheme allowlist', () => {
    expect(sanitizeIdScheme('composite-v1')).toBe('composite-v1');
    expect(sanitizeIdScheme('../x')).toBe('integer-v1');
  });

  test('map slug rejects separators', () => {
    expect(sanitizeMapSlug('mapUS')).toBe('mapUS');
    expect(sanitizeMapSlug('../secret')).toBe(null);
    expect(sanitizeMapSlug('a/b')).toBe(null);
  });

  test('joinContained stays inside root', () => {
    const root = path.join(os.tmpdir(), 'farmdash-identity');
    expect(() => joinContained(root, '..', 'outside')).toThrow(/path_outside_root/);
    const inside = joinContained(root, 'savegame1', 'careerSavegame.xml');
    expect(inside.startsWith(path.resolve(root))).toBe(true);
  });
});
