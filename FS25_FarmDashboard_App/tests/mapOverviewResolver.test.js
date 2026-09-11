// FS25 FarmDashboard | tests/mapOverviewResolver.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  normalizeMapSlug,
  scoreOverviewPath,
  titleTokensFromMapTitle,
  distinctiveTitleTokens,
  pathMatchesMapIdentity,
  scoreZipArchiveName,
  findOverviewSourceFile,
  resolveMapOverviewImage,
  findOverviewInModSettingsExport,
  isOfficialMapUiOverviewPath,
} = require('../mapOverviewResolver');

describe('mapOverviewResolver', () => {
  test('parseMapXmlMeta reads width and imageFilename', () => {
    const { parseMapXmlMeta } = require('../mapOverviewResolver');
    const meta = parseMapXmlMeta(
      '<map width="2048" height="2048" imageFilename="$data/maps/mapUS/textures/ui/overview.png">'
    );
    expect(meta.width).toBe(2048);
    expect(meta.height).toBe(2048);
    expect(meta.imageFilename).toContain('overview.png');
  });

  test('official map.xml overview path is the terrain image, not a PDA crop', () => {
    expect(
      isOfficialMapUiOverviewPath('C:/game/data/maps/mapUS/textures/ui/overview.png')
    ).toBe(true);
    expect(
      isOfficialMapUiOverviewPath('C:/mods/FS25_Carpathian/maps/ui/mapOverview.dds')
    ).toBe(true);
    expect(
      isOfficialMapUiOverviewPath('C:/modSettings/FS25_FarmDashboard/mapOverview/MapUS/overview.dds')
    ).toBe(false);
  });

  test('normalizeMapSlug prefers mapId', () => {
    expect(normalizeMapSlug('mapUS', 'Riverside')).toBe('mapus');
    expect(normalizeMapSlug('MapEU', '')).toBe('mapeu');
    expect(normalizeMapSlug('mapWitcombeValley', 'Witcombe Valley')).toBe('mapwitcombevalley');
  });

  test('distinctiveTitleTokens drops generic words', () => {
    expect(distinctiveTitleTokens('Witcombe Valley')).toEqual(['witcombe']);
    expect(distinctiveTitleTokens('Ballam Road Dairy Farming')).toEqual(['ballam']);
  });

  test('pathMatchesMapIdentity requires distinctive map name in path', () => {
    expect(pathMatchesMapIdentity('C:/mods/FS25_Witcombe_Valley.zip', 'mapwitcombe', 'Witcombe Valley')).toBe(true);
    expect(pathMatchesMapIdentity('C:/mods/FS25_Ballam_Road.zip', 'mapwitcombe', 'Witcombe Valley')).toBe(false);
    expect(pathMatchesMapIdentity('C:/mods/FS25_Ballam_Road.zip', 'mapballam', 'Ballam Road Dairy Farming')).toBe(true);
  });

  test('SaxlinghamXL title matches FS25_Saxlingham_XL.zip despite underscore', () => {
    expect(titleTokensFromMapTitle('SaxlinghamXL')).toEqual(['saxlingham', 'xl']);
    expect(distinctiveTitleTokens('SaxlinghamXL')).toEqual(['saxlingham', 'xl']);
    expect(
      pathMatchesMapIdentity(
        'C:/mods/FS25_Saxlingham_XL.zip',
        'fs25_saxlingham_xl',
        'SaxlinghamXL'
      )
    ).toBe(true);
    expect(
      scoreZipArchiveName(
        'C:/mods/FS25_Saxlingham_XL.zip',
        'fs25_saxlingham_xl',
        titleTokensFromMapTitle('SaxlinghamXL')
      )
    ).toBeGreaterThan(
      scoreZipArchiveName(
        'C:/mods/FS25_Saxlingham_crossplay.zip',
        'fs25_saxlingham_xl',
        titleTokensFromMapTitle('SaxlinghamXL')
      )
    );
  });

  test('scoreZipArchiveName ranks matching mod archives', () => {
    const tokens = titleTokensFromMapTitle('Witcombe Valley');
    expect(
      scoreZipArchiveName('C:/mods/FS25_Witcombe_Valley.zip', 'mapwitcombe', tokens)
    ).toBeGreaterThan(scoreZipArchiveName('C:/mods/FS25_Ballam_Road.zip', 'mapwitcombe', tokens));
  });

  test('findOverviewSourceFile prefers vanilla mapUS over unrelated mod zips', async () => {
    const modsRoot = `${process.env.USERPROFILE || ''}/Documents/My Games/FarmingSimulator2025/mods`;
    const result = await findOverviewSourceFile({
      mapId: 'MapUS',
      mapTitle: 'Riverbend Springs',
      modsRoot,
    });
    if (!result?.sourcePath) return;
    const low = result.sourcePath.toLowerCase().replace(/\\/g, '/');
    expect(low).toContain('/data/maps/mapus/');
    expect(low).not.toContain('willowriver');
  });

  test('scoreOverviewPath ranks vanilla ui path highest', () => {
    const vanilla =
      'C:/Game/data/maps/mapus/textures/ui/overview.dds'.replace(/\\/g, '/');
    const random = 'C:/mods/SomeMod/textures/overview.dds'.replace(/\\/g, '/');
    expect(scoreOverviewPath(vanilla, 'mapus')).toBeGreaterThan(
      scoreOverviewPath(random, 'mapus')
    );
  });

  test('scoreOverviewPath accepts mapOverview.dds and maps/overview.dds', () => {
    expect(scoreOverviewPath('maps/ui/mapOverview.dds', 'mapeu')).toBeGreaterThan(0);
    expect(scoreOverviewPath('maps/overview.dds', 'mapalma')).toBeGreaterThan(0);
    expect(scoreOverviewPath('map/overview.dds', 'mapbackroads')).toBeGreaterThan(0);
  });

  test('resolveDlcPackages matches Kinlaig to highlandsFishingPack', () => {
    const { resolveDlcPackages, isLikelyDlcMap } = require('../mapOverviewResolver');
    expect(resolveDlcPackages('mapkinlaig', 'Kinlaig', ['kinlaig'])).toEqual([
      'highlandsFishingPack',
    ]);
    expect(isLikelyDlcMap('mapkinlaig', 'Kinlaig', ['kinlaig'])).toBe(true);
    expect(resolveDlcPackages('mapus', 'Riverbend Springs', ['riverbend'])).toEqual([]);
  });

  test('pdlcPackageOverviewCandidates includes map/textures/ui path', () => {
    const { pdlcPackageOverviewCandidates } = require('../mapOverviewResolver');
    const paths = pdlcPackageOverviewCandidates('C:/pdlc/highlandsFishingPack', 'mapkinlaig');
    expect(paths.some((p) => p.replace(/\\/g, '/').includes('map/textures/ui/overview.dds'))).toBe(
      true
    );
  });

  test('mapIdTailSlug extracts the map id from dotted pdlc/mod ids', () => {
    const { mapIdTailSlug } = require('../mapOverviewResolver');
    expect(mapIdTailSlug('pdlc_highlandsFishingPack.mapKinlaig')).toBe('mapkinlaig');
    expect(mapIdTailSlug('FS25_SomeMap.someMap01')).toBe('somemap01');
    expect(mapIdTailSlug('MapUS')).toBe('');
    expect(mapIdTailSlug('')).toBe('');
  });

  test('resolveDlcPackagesForMap recognises every known Kinlaig id/title shape', () => {
    const { resolveDlcPackagesForMap } = require('../mapOverviewResolver');
    expect(resolveDlcPackagesForMap('mapKinlaig', '')).toEqual(['highlandsFishingPack']);
    expect(resolveDlcPackagesForMap('', 'Kinlaig')).toEqual(['highlandsFishingPack']);
    expect(resolveDlcPackagesForMap('pdlc_highlandsFishingPack.mapKinlaig', '')).toEqual([
      'highlandsFishingPack',
    ]);
    expect(resolveDlcPackagesForMap('', 'Highlands Fishing')).toEqual(['highlandsFishingPack']);
  });

  test('resolveDlcPackagesForMap does not flag ordinary mod maps as DLC', () => {
    const { resolveDlcPackagesForMap } = require('../mapOverviewResolver');
    expect(resolveDlcPackagesForMap('MapUS', 'Riverbend Springs')).toEqual([]);
    expect(resolveDlcPackagesForMap('mapWitcombeValley', 'Witcombe Valley')).toEqual([]);
    expect(resolveDlcPackagesForMap('FS25_LakesideFishing.map01', 'Lakeside Fishing Village')).toEqual([]);
  });
});

describe('mapOverviewResolver DLC hint + modSettings export', () => {
  let tmpRoot;
  let savedEnv;
  const KINLAIG_MAP_ID = 'pdlc_highlandsFishingPack.mapKinlaig';

  const modSettingsMapOverviewDir = () =>
    path.join(
      tmpRoot,
      'Documents',
      'My Games',
      'FarmingSimulator2025',
      'modSettings',
      'FS25_FarmDashboard',
      'mapOverview'
    );

  beforeAll(() => {
    savedEnv = {
      USERPROFILE: process.env.USERPROFILE,
      APPDATA: process.env.APPDATA,
      FS25_GAME_PATH: process.env.FS25_GAME_PATH,
      FARMING_SIMULATOR_2025_PATH: process.env.FARMING_SIMULATOR_2025_PATH,
    };
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'farmdash-overview-test-'));
    process.env.USERPROFILE = tmpRoot;
    process.env.APPDATA = path.join(tmpRoot, 'AppData', 'Roaming');
    delete process.env.FS25_GAME_PATH;
    delete process.env.FARMING_SIMULATOR_2025_PATH;
  });

  afterAll(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('missing overview on Kinlaig (dotted pdlc mapId, no title) reports the DLC hint', async () => {
    const result = await resolveMapOverviewImage({
      mapId: KINLAIG_MAP_ID,
      mapTitle: '',
      modsRoots: [path.join(tmpRoot, 'no-such-mods')],
    });
    expect(result.ok).toBe(false);
    expect(result.hintKind).toBe('dlc');
    expect(result.dlcPackages).toEqual(['highlandsFishingPack']);
  });

  test('missing overview on a mod map still reports the mods-zip hint', async () => {
    const result = await resolveMapOverviewImage({
      mapId: 'mapWitcombeValley',
      mapTitle: 'Witcombe Valley',
      modsRoots: [path.join(tmpRoot, 'no-such-mods')],
    });
    expect(result.ok).toBe(false);
    expect(result.hintKind).toBe('mod');
  });

  test('unexpected resolver failure on a DLC map keeps hintKind dlc (never mods-zip hint)', async () => {
    // The mod exported an overview.dds, but this machine has no DDS converter → the
    // conversion throws. The catch path must still identify the map as DLC.
    const exportDir = path.join(modSettingsMapOverviewDir(), KINLAIG_MAP_ID);
    fs.mkdirSync(exportDir, { recursive: true });
    fs.writeFileSync(path.join(exportDir, 'overview.dds'), Buffer.from('not-a-real-dds'));
    try {
      const result = await resolveMapOverviewImage({
        mapId: KINLAIG_MAP_ID,
        mapTitle: 'Kinlaig',
        modsRoots: [],
      });
      expect(result.ok).toBe(false);
      expect(result.hintKind).toBe('dlc');
    } finally {
      fs.rmSync(exportDir, { recursive: true, force: true });
    }
  }, 20000);

  test('findOverviewInModSettingsExport matches the exact exported mapId folder', async () => {
    const exportDir = path.join(modSettingsMapOverviewDir(), KINLAIG_MAP_ID);
    fs.mkdirSync(exportDir, { recursive: true });
    const overviewPath = path.join(exportDir, 'overview.png');
    fs.writeFileSync(overviewPath, Buffer.from('png-bytes'));
    try {
      const hit = await findOverviewInModSettingsExport(KINLAIG_MAP_ID, 'Kinlaig', '');
      expect(String(hit).toLowerCase()).toBe(overviewPath.toLowerCase());
    } finally {
      fs.rmSync(exportDir, { recursive: true, force: true });
    }
  });

  test('findOverviewInModSettingsExport matches a tail-slug folder for dotted mapIds', async () => {
    const exportDir = path.join(modSettingsMapOverviewDir(), 'mapKinlaig');
    fs.mkdirSync(exportDir, { recursive: true });
    const overviewPath = path.join(exportDir, 'overview.png');
    fs.writeFileSync(overviewPath, Buffer.from('png-bytes'));
    try {
      const hit = await findOverviewInModSettingsExport(KINLAIG_MAP_ID, '', '');
      expect(String(hit).toLowerCase()).toBe(overviewPath.toLowerCase());
    } finally {
      fs.rmSync(exportDir, { recursive: true, force: true });
    }
  });

  test('mod-exported overview.png resolves end-to-end without touching .dlc archives', async () => {
    const exportDir = path.join(modSettingsMapOverviewDir(), KINLAIG_MAP_ID);
    fs.mkdirSync(exportDir, { recursive: true });
    // Tiny valid 1x1 PNG so the copy path succeeds (terrain analysis degrades gracefully
    // without ImageMagick and keeps the full-bleed inset).
    const png1x1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    fs.writeFileSync(path.join(exportDir, 'overview.png'), png1x1);
    fs.writeFileSync(
      path.join(exportDir, 'meta.json'),
      JSON.stringify({ mapId: KINLAIG_MAP_ID, mapTitle: 'Kinlaig' })
    );
    try {
      const result = await resolveMapOverviewImage({
        mapId: KINLAIG_MAP_ID,
        mapTitle: 'Kinlaig',
        modsRoots: [],
      });
      expect(result.ok).toBe(true);
      expect(String(result.url || '')).toMatch(/^\/map-overview-cache\/.+\.png$/);
      expect(String(result.sourcePath).toLowerCase()).toContain('modsettings');
    } finally {
      fs.rmSync(exportDir, { recursive: true, force: true });
    }
  });
});
