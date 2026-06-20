// FS25 FarmDashboard | modConfigXml.js
// Pure read/parse/merge helpers for the mod's modSettings/FS25_FarmDashboard/config.xml.
// Extracted from main.js so the round-trip (parse -> edit -> write) is unit-testable and,
// critically, so a desktop "Save mod config" never clobbers mod-owned keys (diagnostics,
// per-frame budgets, stock/redTape, safety-applied flags) that the editor does not manage.

'use strict';

/** Module flags the desktop editor manages; every other key in config.xml is preserved on save. */
const MOD_CONFIG_MODULE_KEYS = [
    'animals', 'vehicles', 'weather', 'fields', 'finance', 'economy', 'production', 'stock', 'redTape',
];

function parseModConfigXml(text) {
    const base = {
        updateInterval: 10000,
        collectionCycleMs: 60000,
        minWriteIntervalMs: 4000,
        baleScanIntervalCycles: 1,
        modules: {
            animals: true,
            vehicles: true,
            weather: true,
            fields: true,
            finance: true,
            economy: true,
            production: true,
            stock: true,
            redTape: true,
        },
    };
    if (!text || typeof text !== 'string') return base;
    const ui = text.match(/updateInterval\s*=\s*"(\d+)"/i);
    const cc = text.match(/collectionCycleMs\s*=\s*"(\d+)"/i);
    if (ui) base.updateInterval = Math.max(1000, parseInt(ui[1], 10) || base.updateInterval);
    if (cc) base.collectionCycleMs = Math.max(5000, parseInt(cc[1], 10) || base.collectionCycleMs);
    const mwi = text.match(/minWriteIntervalMs\s*=\s*"(\d+)"/i);
    if (mwi) base.minWriteIntervalMs = Math.max(2000, Math.min(60000, parseInt(mwi[1], 10) || base.minWriteIntervalMs));
    const bsc = text.match(/baleScanIntervalCycles\s*=\s*"(\d+)"/i);
    if (bsc) base.baleScanIntervalCycles = Math.max(1, Math.min(20, parseInt(bsc[1], 10) || base.baleScanIntervalCycles));
    for (const m of MOD_CONFIG_MODULE_KEYS) {
        const re = new RegExp(`${m}\\s*=\\s*"(true|false)"`, 'i');
        const mm = text.match(re);
        if (mm) base.modules[m] = mm[1].toLowerCase() === 'true';
    }
    return base;
}

/** Set or replace one attribute on the first <element …> tag, leaving all its other attributes intact. */
function patchModConfigAttr(xml, element, attr, value) {
    const tagRe = new RegExp(`(<${element}\\b[^>]*?)(\\s*/?>)`, 'i');
    if (!tagRe.test(xml)) return xml;
    return xml.replace(tagRe, (_full, head, tail) => {
        const attrRe = new RegExp(`(\\b${attr}\\s*=\\s*")[^"]*(")`);
        if (attrRe.test(head)) return head.replace(attrRe, `$1${value}$2`) + tail;
        return `${head} ${attr}="${value}"${tail}`;
    });
}

/**
 * Patch the editor-managed keys into the EXISTING config.xml so mod-owned settings survive a save.
 * Falls back to a full default template only when no usable file exists.
 * @param {object} cfg editor payload ({ updateInterval, collectionCycleMs, minWriteIntervalMs, baleScanIntervalCycles, modules })
 * @param {string|null} [existingText] current config.xml contents, if any
 */
function buildModConfigXml(cfg, existingText) {
    cfg = cfg && typeof cfg === 'object' ? cfg : {};
    const u = Math.max(1000, Math.min(600000, Number(cfg.updateInterval) || 10000));
    const c = Math.max(5000, Math.min(1800000, Number(cfg.collectionCycleMs) || 60000));
    const minW = Math.max(2000, Math.min(60000, Number(cfg.minWriteIntervalMs) || 4000));
    const baleN = Math.max(1, Math.min(20, Number(cfg.baleScanIntervalCycles) || 1));
    const M = cfg.modules || {};
    const b = (k) => (M[k] === false ? 'false' : 'true');

    const usable =
        typeof existingText === 'string' &&
        /<farmDashboard\b/i.test(existingText) &&
        /<settings\b/i.test(existingText) &&
        /<modules\b/i.test(existingText);

    if (usable) {
        let xml = existingText;
        xml = patchModConfigAttr(xml, 'settings', 'updateInterval', u);
        xml = patchModConfigAttr(xml, 'settings', 'collectionCycleMs', c);
        xml = patchModConfigAttr(xml, 'settings', 'minWriteIntervalMs', minW);
        xml = patchModConfigAttr(xml, 'settings', 'baleScanIntervalCycles', baleN);
        for (const k of MOD_CONFIG_MODULE_KEYS) {
            xml = patchModConfigAttr(xml, 'modules', k, b(k));
        }
        return xml;
    }

    return `<?xml version="1.0" encoding="utf-8"?>
<farmDashboard>
    <settings updateInterval="${u}" collectionCycleMs="${c}" minWriteIntervalMs="${minW}" baleScanIntervalCycles="${baleN}"/>
    <modules animals="${b('animals')}" vehicles="${b('vehicles')}" weather="${b('weather')}" fields="${b('fields')}" finance="${b('finance')}" economy="${b('economy')}" production="${b('production')}" stock="${b('stock')}" redTape="${b('redTape')}"/>
</farmDashboard>
`;
}

module.exports = {
    MOD_CONFIG_MODULE_KEYS,
    parseModConfigXml,
    patchModConfigAttr,
    buildModConfigXml,
};
