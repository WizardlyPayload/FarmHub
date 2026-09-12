const path = require('path');
const fs = require('fs');
const os = require('os');
const {
    hasHttpFeed,
    buildSavegameFeedUrl,
    buildStatsFeedUrl,
    normalizeFeedCacheSlot,
    getHttpXmlCacheDir,
    downloadHttpFeedSavegameXml,
    looksLikeXml,
} = require('../httpFeedXml');
const { parseEconomyXml, parseVehiclesXml, parseCareerSavegame } = require('../xmlCollector');

describe('Giants HTTP feed helpers', () => {
    const srv = {
        id: 'srv_test',
        httpFeedHost: 'synthetic.invalid',
        httpFeedPort: 8490,
        httpFeedCode: 'SYNTHETIC_TEST_CODE',
        localSubFolder: 'mirror_savegame6',
    };

    test('hasHttpFeed requires host + code', () => {
        expect(hasHttpFeed(srv)).toBe(true);
        expect(hasHttpFeed({ httpFeedHost: 'x' })).toBe(false);
        expect(hasHttpFeed({ httpFeedCode: 'SYNTHETIC_TEST_CODE' })).toBe(false);
    });

    test('buildSavegameFeedUrl matches Giants dedicated pattern', () => {
        const u = buildSavegameFeedUrl(srv, 'vehicles');
        expect(u).toBe(
            'http://synthetic.invalid:8490/feed/dedicated-server-savegame.html?code=SYNTHETIC_TEST_CODE&file=vehicles'
        );
        expect(buildStatsFeedUrl(srv)).toContain('/feed/dedicated-server-stats.xml?code=');
    });

    test('normalizeFeedCacheSlot strips mirror_ prefix', () => {
        expect(normalizeFeedCacheSlot(srv, 'mirror_savegame6')).toBe('savegame6');
        expect(getHttpXmlCacheDir('/tmp/ud', srv, 'mirror_savegame6')).toMatch(
            /httpXmlCache[/\\]srv_test[/\\]savegame6$/
        );
    });

    test('looksLikeXml', () => {
        expect(looksLikeXml(Buffer.from('<?xml version="1.0"?><a/>'))).toBe(true);
        expect(looksLikeXml(Buffer.from('html'))).toBe(false);
    });
});

describe('HTTP feed live download (optional network)', () => {
    const canLive = process.env.FARMDASH_LIVE_HTTP_FEED === '1';
    const srv = {
        id: 'srv_live_feed',
        httpFeedHost: process.env.FARMDASH_TEST_FEED_HOST || '',
        httpFeedPort: Number(process.env.FARMDASH_TEST_FEED_PORT || 8080),
        httpFeedCode: process.env.FARMDASH_TEST_FEED_CODE || '',
        localSubFolder: 'mirror_savegame6',
    };

    (canLive ? test : test.skip)('downloads career/vehicles/economy and parsers accept them', async () => {
        expect(srv.httpFeedHost).toBeTruthy();
        expect(srv.httpFeedCode).toBeTruthy();
        const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-http-feed-'));
        const result = await downloadHttpFeedSavegameXml(srv, 'mirror_savegame6', ud);
        expect(result.ok).toBe(true);
        expect(result.saved).toEqual(
            expect.arrayContaining(['careerSavegame.xml', 'vehicles.xml', 'economy.xml'])
        );

        const career = fs.readFileSync(path.join(result.dir, 'careerSavegame.xml'), 'utf8');
        const vehicles = fs.readFileSync(path.join(result.dir, 'vehicles.xml'), 'utf8');
        const economy = fs.readFileSync(path.join(result.dir, 'economy.xml'), 'utf8');
        expect(parseCareerSavegame(career).mapTitle || parseCareerSavegame(career).settings).toBeTruthy();
        expect(parseVehiclesXml(vehicles).length).toBeGreaterThan(10);
        expect(Object.keys(parseEconomyXml(economy)).length).toBeGreaterThan(5);
    }, 60000);
});
