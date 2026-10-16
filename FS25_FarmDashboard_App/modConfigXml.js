// FS25 FarmDashboard | modConfigXml.js
// Pure read/parse/merge helpers for the mod's modSettings/FS25_FarmDashboard/config.xml.
// Extracted from main.js so the round-trip (parse -> edit -> write) is unit-testable and,
// critically, so a desktop "Save mod config" never clobbers mod-owned keys (diagnostics,
// per-frame budgets, stock/redTape, safety-applied flags) that the editor does not manage.

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { XMLParser, XMLValidator } = require('fast-xml-parser');

const modConfigParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    allowBooleanAttributes: false,
    processEntities: false,
    parseTagValue: false,
    trimValues: false,
    isArray: (tagName) => tagName === 'settings' || tagName === 'modules' || tagName === 'farmDashboard',
});

/** Module flags the desktop editor manages; every other key in config.xml is preserved on save. */
const MOD_CONFIG_MODULE_KEYS = [
    'animals', 'vehicles', 'weather', 'fields', 'finance', 'economy', 'production', 'stock', 'redTape',
];

function finiteAttr(node, name) {
    if (!node || typeof node !== 'object') return null;
    const value = node['@_' + name];
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function booleanAttr(node, name) {
    if (!node || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, '@_' + name)) return undefined;
    const value = String(node['@_' + name]).toLowerCase();
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
}

function dangerousXmlDeclaration(text) {
    return /<!DOCTYPE/i.test(text) || /<!ENTITY/i.test(text) || /<!\[CDATA\[/i.test(text);
}

function tagEndIndex(xml, from) {
    let quote = null;
    for (let i = from; i < xml.length; i += 1) {
        const ch = xml[i];
        if (quote) {
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }
        if (ch === '>') return i;
    }
    return -1;
}

/** Open-tag span of the single direct farmDashboard child. Nested copies are ignored. */
function directChildOpenTag(xml, childName) {
    let i = 0;
    let depth = 0;
    let found = null;
    while (i < xml.length) {
        if (xml.startsWith('<!--', i)) {
            const end = xml.indexOf('-->', i + 4);
            if (end < 0) return { error: true };
            i = end + 3;
            continue;
        }
        if (xml.startsWith('<?', i)) {
            const end = xml.indexOf('?>', i + 2);
            if (end < 0) return { error: true };
            i = end + 2;
            continue;
        }
        if (xml[i] !== '<') {
            i += 1;
            continue;
        }
        if (xml.startsWith('</', i)) {
            const close = xml.slice(i).match(/^<\/([A-Za-z0-9_:-]+)\s*>/);
            if (!close) return { error: true };
            if (close[1] === 'farmDashboard') depth = 0;
            else if (depth > 0) depth -= 1;
            i += close[0].length;
            continue;
        }
        const open = xml.slice(i).match(/^<([A-Za-z0-9_:-]+)\b/);
        if (!open) {
            i += 1;
            continue;
        }
        const end = tagEndIndex(xml, i);
        if (end < 0) return { error: true };
        const selfClose = xml[end - 1] === '/';
        if (depth === 1 && open[1] === childName) {
            if (found) return { ambiguous: true };
            found = { start: i, end: end + 1 };
        }
        if (open[1] === 'farmDashboard') depth = 1;
        else if (!selfClose && depth >= 1) depth += 1;
        i = end + 1;
    }
    return found || { missing: true };
}

/** Exact attribute name span. Quoted values and hyphen/colon names are not substrings of this name. */
function replaceAttrOnTag(tag, attr, value) {
    const open = String(tag).match(/^<[A-Za-z_:][A-Za-z0-9_.:-]*/);
    if (!open) return null;
    let i = open[0].length;
    let out = tag.slice(0, i);
    let replaced = false;
    while (i < tag.length) {
        const ch = tag[i];
        if (ch === '/' || ch === '>') {
            out += tag.slice(i);
            break;
        }
        if (/\s/.test(ch)) {
            out += ch;
            i += 1;
            continue;
        }
        const nameMatch = tag.slice(i).match(/^[A-Za-z_:][A-Za-z0-9_.:-]*/);
        if (!nameMatch) return null;
        const name = nameMatch[0];
        let j = i + name.length;
        while (j < tag.length && /\s/.test(tag[j])) j += 1;
        if (tag[j] !== '=') return null;
        j += 1;
        while (j < tag.length && /\s/.test(tag[j])) j += 1;
        const quote = tag[j];
        if (quote !== '"' && quote !== "'") return null;
        const end = tag.indexOf(quote, j + 1);
        if (end < 0) return null;
        if (name === attr) {
            out += `${name}=${quote}${value}${quote}`;
            replaced = true;
        } else {
            out += tag.slice(i, end + 1);
        }
        i = end + 1;
    }
    if (!replaced) {
        return out.replace(/\s*\/?>$/, (tail) => ` ${attr}="${value}"${tail}`);
    }
    return out;
}

function readModConfigStructure(text) {
    if (typeof text !== 'string' || dangerousXmlDeclaration(text)) {
        return { ok: false, error: 'malformed-config' };
    }
    if (XMLValidator.validate(text, { allowBooleanAttributes: false, processEntities: false }) !== true) {
        return { ok: false, error: 'malformed-config' };
    }
    let parsed;
    try {
        parsed = modConfigParser.parse(text);
    } catch (err) {
        return { ok: false, error: 'malformed-config' };
    }
    const roots = parsed && parsed.farmDashboard;
    if (!Array.isArray(roots) || roots.length !== 1) return { ok: false, error: 'malformed-config' };
    const root = roots[0];
    if (!Array.isArray(root.settings) || root.settings.length !== 1) {
        return { ok: false, error: root.settings && root.settings.length > 1 ? 'duplicate-structure' : 'malformed-config' };
    }
    if (!Array.isArray(root.modules) || root.modules.length !== 1) {
        return { ok: false, error: root.modules && root.modules.length > 1 ? 'duplicate-structure' : 'malformed-config' };
    }
    return { ok: true, root: { settings: root.settings[0], modules: root.modules[0] } };
}

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
    const structure = readModConfigStructure(text);
    if (!structure.ok) return base;
    const settings = structure.root.settings || {};
    const modules = structure.root.modules || {};
    const ui = finiteAttr(settings, 'updateInterval');
    if (ui != null) base.updateInterval = Math.max(1000, ui);
    const cycle = finiteAttr(settings, 'collectionCycleMs');
    if (cycle != null) base.collectionCycleMs = Math.max(5000, cycle);
    const mwi = finiteAttr(settings, 'minWriteIntervalMs');
    if (mwi != null) base.minWriteIntervalMs = Math.max(2000, Math.min(60000, mwi));
    const bsc = finiteAttr(settings, 'baleScanIntervalCycles');
    if (bsc != null) base.baleScanIntervalCycles = Math.max(1, Math.min(20, bsc));
    for (const m of MOD_CONFIG_MODULE_KEYS) {
        const flag = booleanAttr(modules, m);
        if (flag != null) base.modules[m] = flag;
    }
    return base;
}

/** Patch one attribute on the direct farmDashboard child, never a nested tag of the same name. */
function patchModConfigAttr(xml, element, attr, value) {
    if (typeof xml === 'string' && /<farmDashboard\b/i.test(xml)) {
        const located = directChildOpenTag(xml, element);
        if (!located || located.error || located.ambiguous || located.missing) return null;
        const tag = xml.slice(located.start, located.end);
        const next = replaceAttrOnTag(tag, attr, value);
        if (next == null) return null;
        return xml.slice(0, located.start) + next + xml.slice(located.end);
    }
    const tagRe = new RegExp(`(<${element}\\b[^>]*?)(\\s*/?>)`, 'i');
    if (!tagRe.test(xml)) return xml;
    return xml.replace(tagRe, (_full, head, tail) => {
        const next = replaceAttrOnTag(head + tail, attr, value);
        return next == null ? head + tail : next;
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
    const supplied = (key) => (
        Object.prototype.hasOwnProperty.call(cfg, key) && cfg[key] != null && cfg[key] !== '' && Number.isFinite(Number(cfg[key]))
            ? Number(cfg[key]) : null
    );
    const u = supplied('updateInterval');
    const c = supplied('collectionCycleMs');
    const minW = supplied('minWriteIntervalMs');
    const baleN = supplied('baleScanIntervalCycles');
    const M = cfg.modules && typeof cfg.modules === 'object' ? cfg.modules : {};
    const b = (k) => (M[k] === false ? 'false' : 'true');
    const structure = typeof existingText === 'string' && existingText.trim() !== ''
        ? readModConfigStructure(existingText) : null;

    if (structure && structure.ok) {
        let xml = existingText;
        const patch = (element, attr, value) => {
            xml = patchModConfigAttr(xml, element, attr, value);
            return xml != null;
        };
        if (u != null && !patch('settings', 'updateInterval', Math.max(1000, Math.min(600000, u)))) return null;
        if (c != null && !patch('settings', 'collectionCycleMs', Math.max(5000, Math.min(1800000, c)))) return null;
        if (minW != null && !patch('settings', 'minWriteIntervalMs', Math.max(2000, Math.min(60000, minW)))) return null;
        if (baleN != null && !patch('settings', 'baleScanIntervalCycles', Math.max(1, Math.min(20, baleN)))) return null;
        for (const k of MOD_CONFIG_MODULE_KEYS) {
            if (M[k] !== true && M[k] !== false) continue;
            if (!patch('modules', k, b(k))) return null;
        }
        if (!readModConfigStructure(xml).ok) return null;
        const parsed = parseModConfigXml(xml);
        if (u != null && parsed.updateInterval !== Math.max(1000, Math.min(600000, u))) return null;
        if (c != null && parsed.collectionCycleMs !== Math.max(5000, Math.min(1800000, c))) return null;
        if (minW != null && parsed.minWriteIntervalMs !== Math.max(2000, Math.min(60000, minW))) return null;
        if (baleN != null && parsed.baleScanIntervalCycles !== Math.max(1, Math.min(20, baleN))) return null;
        for (const k of MOD_CONFIG_MODULE_KEYS) {
            if (M[k] !== true && M[k] !== false) continue;
            if (parsed.modules[k] !== (M[k] === true)) return null;
        }
        return xml;
    }

    const presentButUnusable = typeof existingText === 'string' && existingText.trim() !== '';
    if (presentButUnusable) {
        return null;
    }

    const initU = u != null ? Math.max(1000, Math.min(600000, u)) : 10000;
    const initC = c != null ? Math.max(5000, Math.min(1800000, c)) : 60000;
    const initMin = minW != null ? Math.max(2000, Math.min(60000, minW)) : 4000;
    const initBale = baleN != null ? Math.max(1, Math.min(20, baleN)) : 1;
    return `<?xml version="1.0" encoding="utf-8"?>
<farmDashboard>
    <settings updateInterval="${initU}" collectionCycleMs="${initC}" minWriteIntervalMs="${initMin}" baleScanIntervalCycles="${initBale}"/>
    <modules animals="${b('animals')}" vehicles="${b('vehicles')}" weather="${b('weather')}" fields="${b('fields')}" finance="${b('finance')}" economy="${b('economy')}" production="${b('production')}" stock="${b('stock')}" redTape="${b('redTape')}"/>
</farmDashboard>
`;
}

function modConfigRevision(text) {
    return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function countXmlTag(text, tag) {
    const found = String(text).match(new RegExp(`<${tag}\\b`, 'gi'));
    return found ? found.length : 0;
}

function classifyModConfigText(fileExists, text) {
    if (!fileExists) {
        return { presence: 'missing', revision: 'missing', exists: false, ...parseModConfigXml('') };
    }
    if (typeof text !== 'string') {
        return { presence: 'unreadable', exists: true, error: 'unreadable', preserved: true, revision: null };
    }
    const revision = modConfigRevision(text);
    const structure = readModConfigStructure(text);
    if (!structure.ok) {
        const duplicate = structure.error === 'duplicate-structure';
        return {
            presence: duplicate ? 'duplicate' : 'malformed',
            exists: true,
            error: structure.error,
            preserved: true,
            revision,
        };
    }
    for (const key of MOD_CONFIG_MODULE_KEYS) {
        if (booleanAttr(structure.root.modules, key) === null) {
            return { presence: 'malformed', exists: true, error: 'malformed-config', preserved: true, revision };
        }
    }
    return { presence: 'ok', exists: true, revision, ...parseModConfigXml(text) };
}

/**
 * Compare-and-write config.xml. expectedRevision 'missing' initializes only while the file
 * is still absent. Any other revision must match the bytes just read. This is not a
 * cross-process lock: a writer that lands between the read and the rename can still win.
 * A failed temp write leaves the original file in place.
 */
function commitModConfig(filePath, cfg) {
    let fileExists = false;
    let existing = null;
    try {
        fileExists = fs.existsSync(filePath);
    } catch (err) {
        return { ok: false, error: 'unreadable', preserved: true };
    }
    if (fileExists) {
        try {
            existing = fs.readFileSync(filePath, 'utf8');
        } catch (err) {
            return { ok: false, error: 'unreadable', preserved: true, exists: true };
        }
    }
    const expected = cfg && cfg.expectedRevision;
    if (expected === 'missing') {
        if (fileExists) return { ok: false, error: 'conflict', preserved: true };
    } else if (typeof expected === 'string' && expected.length > 0) {
        if (!fileExists || modConfigRevision(existing) !== expected) {
            return { ok: false, error: 'conflict', preserved: true };
        }
    } else {
        return { ok: false, error: 'revision-required', preserved: true };
    }
    const state = classifyModConfigText(fileExists, existing);
    if (state.presence === 'malformed' || state.presence === 'duplicate' || state.presence === 'unreadable') {
        return { ok: false, error: state.error, preserved: true };
    }
    const built = buildModConfigXml(cfg || {}, existing);
    const planned = planModConfigWrite(fileExists, existing, built);
    if (!planned.ok) return { ok: false, error: planned.error, preserved: true };
    const tmp = `${filePath}.tmp`;
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(tmp, planned.xml, 'utf8');
        fs.renameSync(tmp, filePath);
    } catch (err) {
        try { fs.unlinkSync(tmp); } catch (cleanup) { /* original bytes stay */ }
        return { ok: false, error: 'write-failed', preserved: true };
    }
    return { ok: true, revision: modConfigRevision(planned.xml), path: filePath };
}

function planModConfigWrite(fileExists, existingText, built, expectedText) {
    if (fileExists && typeof existingText !== 'string') {
        return { ok: false, error: 'unreadable', preserved: true };
    }
    if (typeof expectedText === 'string' && existingText !== expectedText) {
        return { ok: false, error: 'conflict', preserved: true };
    }
    if (built == null) {
        return { ok: false, error: 'malformed-config', preserved: true };
    }
    return { ok: true, xml: built };
}

async function handleGetModConfig(filePath, io) {
    const pathExists = io.pathExists;
    const readFile = io.readFile;
    let exists = false;
    try {
        exists = await pathExists(filePath);
    } catch (err) {
        return { path: filePath, presence: 'unreadable', exists: true, error: 'unreadable', preserved: true };
    }
    if (!exists) return { path: filePath, ...classifyModConfigText(false, null) };
    let text = null;
    try {
        text = await readFile(filePath);
    } catch (err) {
        text = null;
    }
    return { path: filePath, ...classifyModConfigText(true, text) };
}

async function handleSaveModConfig(filePath, cfg, io) {
    const blocked = await io.assertGameWritesAllowed();
    if (!blocked.ok) return blocked;
    return commitModConfig(filePath, cfg || {});
}

module.exports = {
    MOD_CONFIG_MODULE_KEYS,
    parseModConfigXml,
    patchModConfigAttr,
    buildModConfigXml,
    planModConfigWrite,
    modConfigRevision,
    classifyModConfigText,
    commitModConfig,
    handleGetModConfig,
    handleSaveModConfig,
};
