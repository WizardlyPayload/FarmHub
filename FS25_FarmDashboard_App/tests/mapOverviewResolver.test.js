// FS25 FarmDashboard | tests/mapOverviewResolver.test.js

const {
  normalizeMapSlug,
  scoreOverviewPath,
  titleTokensFromMapTitle,
  distinctiveTitleTokens,
  pathMatchesMapIdentity,
  scoreZipArchiveName,
} = require('../mapOverviewResolver');

describe('mapOverviewResolver', () => {
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

  test('scoreZipArchiveName ranks matching mod archives', () => {
    const tokens = titleTokensFromMapTitle('Witcombe Valley');
    expect(
      scoreZipArchiveName('C:/mods/FS25_Witcombe_Valley.zip', 'mapwitcombe', tokens)
    ).toBeGreaterThan(scoreZipArchiveName('C:/mods/FS25_Ballam_Road.zip', 'mapwitcombe', tokens));
  });

  test('scoreOverviewPath ranks vanilla ui path highest', () => {
    const vanilla =
      'C:/Game/data/maps/mapus/textures/ui/overview.dds'.replace(/\\/g, '/');
    const random = 'C:/mods/SomeMod/textures/overview.dds'.replace(/\\/g, '/');
    expect(scoreOverviewPath(vanilla, 'mapus')).toBeGreaterThan(
      scoreOverviewPath(random, 'mapus')
    );
  });
});
