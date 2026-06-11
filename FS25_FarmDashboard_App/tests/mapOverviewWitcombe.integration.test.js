const fs = require('fs');
const path = require('path');
const { findOverviewSourceFile } = require('../mapOverviewResolver');

const WITCOMBE_ZIP = path.join(
  process.env.USERPROFILE || '',
  'Documents',
  'My Games',
  'FarmingSimulator2025',
  'mods',
  'FS25_Witcombe.zip'
);

describe('mapOverviewResolver Witcombe zip', () => {
  test('FS25_Witcombe.zip overview resolves when present on this PC', async () => {
    if (!fs.existsSync(WITCOMBE_ZIP)) {
      return;
    }
    const modsRoot = path.dirname(WITCOMBE_ZIP);
    const result = await findOverviewSourceFile({
      mapId: '',
      mapTitle: 'Witcombe Valley',
      modsRoot,
      modsRoots: [modsRoot],
    });
    expect(result.sourcePath).toContain('FS25_Witcombe.zip');
    expect(result.sourcePath).toContain('overview.dds');
    expect(result.sourceKind).toBe('zip');
  });
});
