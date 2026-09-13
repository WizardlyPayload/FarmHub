'use strict';

/**
 * Which dashboard HTML V4 vs V5 may serve.
 * V5 is locked to NEW APP (ui-v2). Classic web/index.html is V4-only.
 */

const { isV5ProductLine } = require('./editionPolicy.cjs');

function envUiV2Token(env) {
    const src = env && typeof env === 'object' ? env : process.env;
    return String(src.FARMDASH_UI_V2 || '').trim().toLowerCase();
}

function shouldServeNewUi(opts) {
    const o = opts || {};
    if (isV5ProductLine(o.productLine)) return true;
    const token = envUiV2Token(o.env);
    if (token === '0' || token === 'false') return false;
    if (token === '1' || token === 'true') return true;
    if (o.useNewUiPref !== undefined) return o.useNewUiPref === true;
    return false;
}

function normalizeHttpPath(pathname) {
    let p = String(pathname || '').split('?')[0].replace(/\\/g, '/').toLowerCase();
    if (!p.startsWith('/')) p = `/${p}`;
    p = p.replace(/\/+$/, '') || '/';
    return p;
}

function isClassicDashboardShellPath(pathname) {
    const p = normalizeHttpPath(pathname);
    return (
        p === '/' ||
        p === '/index.html' ||
        p === '/simhub.html' ||
        p === '/web/index.html' ||
        p === '/web/simhub.html'
    );
}

function missingNewUiPageHtml() {
    return [
        '<!DOCTYPE html>',
        '<html lang="en"><head><meta charset="utf-8"><title>Farm Dashboard V5</title></head>',
        '<body style="font-family:Segoe UI,sans-serif;background:#0f172a;color:#e2e8f0;padding:2rem;max-width:40rem">',
        '<h1>Farm Dashboard V5</h1>',
        '<p>This install is missing the new dashboard screens. V5 does not use the old layout.</p>',
        '<p>Uninstall Farm Dashboard V5, then install the current V5 Setup again.</p>',
        '</body></html>',
    ].join('');
}

module.exports = {
    shouldServeNewUi,
    normalizeHttpPath,
    isClassicDashboardShellPath,
    missingNewUiPageHtml,
};
