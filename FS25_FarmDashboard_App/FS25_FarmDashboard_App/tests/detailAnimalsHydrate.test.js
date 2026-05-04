// FS25 FarmDashboard | tests/detailAnimalsHydrate.test.js
const path = require('path');
const {
    getFtpCachedDetailsDir,
    getDetailsDirForHydration,
} = require('../detailAnimalsHydrate');

describe('detailAnimalsHydrate FTP paths', () => {
    test('getFtpCachedDetailsDir uses serverState.lastSaveSlot', () => {
        const ud = '/appdata';
        const srv = { id: 'srv1', mode: 'ftp', localSubFolder: 'savegame1' };
        const st = { lastSaveSlot: 'savegame11' };
        expect(getFtpCachedDetailsDir(srv, ud, st)).toBe(
            path.join(ud, 'ftpDetailsCache', 'srv1', 'savegame11', 'details')
        );
    });

    test('getDetailsDirForHydration ftp falls back to localSubFolder', () => {
        const ud = '/appdata';
        const srv = { id: 'x', mode: 'ftp', localSubFolder: 'savegame3' };
        const dir = getDetailsDirForHydration(srv, () => '/noop', {
            userDataPath: ud,
            serverState: {},
        });
        expect(dir).toBe(path.join(ud, 'ftpDetailsCache', 'x', 'savegame3', 'details'));
    });
});
