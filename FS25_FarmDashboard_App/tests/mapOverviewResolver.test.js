// FS25 FarmDashboard | tests/mapOverviewResolver.test.js

const {
  normalizeMapSlug,
  scoreOverviewPath,
  titleTokensFromMapTitle,
  distinctiveTitleTokens,
  pathMatchesMapIdentity,
  scoreZipArchiveName,
  findOverviewSourceFile,
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
});
