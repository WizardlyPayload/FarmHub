"use strict";

/**
 * Dedicated companion-mod pages: carries `companionPages.pages[<modKey>]` from the Lua export to the UI.
 * Every page is generically pruned (plain data, bounded arrays/strings/depth). Per-mod modules in
 * `./companionPages/<modKey>.js` are auto-discovered and may coerce array paths and normalize further.
 */

const fs = require("fs");
const path = require("path");

const MAX_ARRAY = 200;
const MAX_STRING = 400;
const MAX_DEPTH = 8;
const MAX_PAGES = 80;
const MODULE_DIR = path.join(__dirname, "companionPages");
const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

function prune(value, depth) {
    if (value == null) return undefined;
    const kind = typeof value;
    if (kind === "number") return Number.isFinite(value) ? value : undefined;
    if (kind === "boolean") return value;
    if (kind === "string") return value.length > MAX_STRING ? value.slice(0, MAX_STRING) : value;
    if (kind !== "object" || depth >= MAX_DEPTH) return undefined;
    if (Array.isArray(value)) {
        const out = [];
        for (const item of value.slice(0, MAX_ARRAY)) {
            const next = prune(item, depth + 1);
            if (next !== undefined) out.push(next);
        }
        return out;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return undefined;
    const out = {};
    for (const [key, item] of Object.entries(value)) {
        const next = prune(item, depth + 1);
        if (next !== undefined) out[key] = next;
    }
    return out;
}

/** Lua empty tables arrive as `{}`; object-shaped lists with numeric keys become arrays. */
function toArray(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "object") return [];
    const keys = Object.keys(value);
    if (keys.length === 0) return [];
    if (keys.every((k) => /^\d+$/.test(k))) {
        return keys.sort((a, b) => Number(a) - Number(b)).map((k) => value[k]).slice(0, MAX_ARRAY);
    }
    return [];
}

function coercePath(target, parts) {
    if (!target || typeof target !== "object" || parts.length === 0) return;
    const [head, ...rest] = parts;
    const keys = head === "*" ? Object.keys(target) : [head];
    for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(target, key)) {
            if (rest.length === 0 && head !== "*") target[key] = [];
            continue;
        }
        if (rest.length === 0) target[key] = toArray(target[key]);
        else coercePath(target[key], rest);
    }
}

function coerceArrays(page, paths) {
    if (!Array.isArray(paths)) return;
    for (const dotted of paths) {
        if (typeof dotted !== "string" || dotted === "") continue;
        coercePath(page, dotted.split("."));
    }
}

let cachedModules = null;

/** Auto-discover `companionPages/<modKey>.js`. A module that fails to load is skipped. */
function loadModules(dir = MODULE_DIR) {
    const found = new Map();
    let files = [];
    try {
        files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
    } catch {
        return found;
    }
    for (const file of files.sort()) {
        try {
            const mod = require(path.join(dir, file));
            if (mod && typeof mod.key === "string" && KEY_PATTERN.test(mod.key)) found.set(mod.key, mod);
        } catch (err) {
            console.warn(`[companionPages] skipped ${file}: ${err && err.message}`);
        }
    }
    return found;
}

function companionPageModules() {
    if (!cachedModules) cachedModules = loadModules();
    return cachedModules;
}

function normalizePage(key, raw, modules, merged) {
    const page = prune(raw, 0);
    if (!page || typeof page !== "object" || Array.isArray(page)) return null;
    page.key = key;
    page.detected = page.detected === true;
    if (typeof page.readState !== "string") page.readState = page.detected ? "ok" : "unknown";
    if (page.byFarm !== undefined && (typeof page.byFarm !== "object" || Array.isArray(page.byFarm))) {
        page.byFarm = {};
    }
    const mod = modules.get(key);
    if (!mod) return page;
    try {
        coerceArrays(page, mod.arrays);
        if (typeof mod.normalize === "function") {
            const next = mod.normalize(page, { merged });
            if (next && typeof next === "object" && !Array.isArray(next)) return next;
        }
    } catch (err) {
        console.warn(`[companionPages] normalize ${key} failed: ${err && err.message}`);
    }
    return page;
}

/**
 * @param {unknown} raw  `luaData.companionPages`
 * @param {{ merged?: object, modules?: Map<string, object> }} [opts]
 * @returns {{ enabled: boolean, schema: number, pages: Record<string, object> }}
 */
function normalizeCompanionPages(raw, opts = {}) {
    const empty = { enabled: false, schema: 1, pages: {} };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;
    const modules = opts.modules || companionPageModules();
    const src = raw.pages && typeof raw.pages === "object" && !Array.isArray(raw.pages) ? raw.pages : {};
    const pages = {};
    let count = 0;
    for (const [key, value] of Object.entries(src)) {
        if (!KEY_PATTERN.test(key) || count >= MAX_PAGES) continue;
        const page = normalizePage(key, value, modules, opts.merged);
        if (page) {
            pages[key] = page;
            count += 1;
        }
    }
    const enabled = Object.values(pages).some((p) => p.detected === true);
    return { enabled, schema: Number.isFinite(raw.schema) ? raw.schema : 1, pages };
}

function isOtherFarmRow(row, playerIds) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    const id = Number(row.farmId);
    return Number.isFinite(id) && id > 0 && !playerIds.has(id);
}

/**
 * Keep only player farms (mirrors farmScope for other mod sections): `byFarm` keys, plus rows of top-level
 * arrays that carry a positive `farmId`. Rows without one are shared data and stay.
 */
function pruneCompanionPagesToFarms(companionPages, playerIds) {
    if (!companionPages || typeof companionPages !== "object" || !companionPages.pages) return companionPages;
    const pages = {};
    for (const [key, page] of Object.entries(companionPages.pages)) {
        if (!page || typeof page !== "object") {
            pages[key] = page;
            continue;
        }
        const next = { ...page };
        if (page.byFarm && typeof page.byFarm === "object") {
            const byFarm = {};
            for (const [fid, row] of Object.entries(page.byFarm)) {
                const id = Number(fid);
                if (Number.isFinite(id) && id > 0 && playerIds.has(id)) byFarm[String(id)] = row;
            }
            next.byFarm = byFarm;
        }
        for (const [field, value] of Object.entries(page)) {
            if (Array.isArray(value) && value.some((row) => isOtherFarmRow(row, playerIds))) {
                next[field] = value.filter((row) => !isOtherFarmRow(row, playerIds));
            }
        }
        pages[key] = next;
    }
    return { ...companionPages, pages };
}

module.exports = {
    normalizeCompanionPages,
    pruneCompanionPagesToFarms,
    companionPageModules,
    loadModules,
    toArray,
    prune,
};
