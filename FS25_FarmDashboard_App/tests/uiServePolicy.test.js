'use strict';

const {
    shouldServeNewUi,
    isClassicDashboardShellPath,
    missingNewUiPageHtml,
} = require('../uiServePolicy.cjs');

describe('shouldServeNewUi', () => {
    test('V5 is locked to NEW APP even when FARMDASH_UI_V2=0', () => {
        expect(shouldServeNewUi({
            productLine: 'v5',
            env: { FARMDASH_UI_V2: '0' },
            useNewUiPref: false,
        })).toBe(true);
        expect(shouldServeNewUi({
            productLine: 'rf',
            env: { FARMDASH_UI_V2: 'false' },
        })).toBe(true);
    });

    test('V4 stays classic unless opted in', () => {
        expect(shouldServeNewUi({ productLine: 'classic', env: {}, useNewUiPref: false })).toBe(false);
        expect(shouldServeNewUi({ productLine: 'classic', env: { FARMDASH_UI_V2: '0' } })).toBe(false);
        expect(shouldServeNewUi({ productLine: 'classic', env: { FARMDASH_UI_V2: '1' } })).toBe(true);
        expect(shouldServeNewUi({ productLine: 'classic', env: {}, useNewUiPref: true })).toBe(true);
    });
});

describe('classic dashboard shells', () => {
    test('identifies HTML the V5 app must not serve from web/', () => {
        expect(isClassicDashboardShellPath('/')).toBe(true);
        expect(isClassicDashboardShellPath('/index.html')).toBe(true);
        expect(isClassicDashboardShellPath('/simhub.html')).toBe(true);
        expect(isClassicDashboardShellPath('/web/index.html')).toBe(true);
        expect(isClassicDashboardShellPath('/assests/img/logo.png')).toBe(false);
    });

    test('missing-ui page does not mention the classic layout as a fallback', () => {
        const html = missingNewUiPageHtml();
        expect(html).toContain('Farm Dashboard V5');
        expect(html.toLowerCase()).not.toContain('classic');
        expect(html.toLowerCase()).not.toContain('old layout is still');
    });
});
