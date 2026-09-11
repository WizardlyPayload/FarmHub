'use strict';
/**
 * Giants dedicated-server HTTP XML feed (often :8080 / remapped ports).
 * Example:
 *   http://HOST:PORT/feed/dedicated-server-savegame.html?code=CODE&file=vehicles
 *   http://HOST:PORT/feed/dedicated-server-stats.xml?code=CODE
 *
 * Not a substitute for data.json — enrich merge when FTP is unavailable
 * (join-as-client Local + feed). Many hosts only expose a subset of save XMLs.
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const http = require('http');
const https = require('https');
const { sanitizeSaveSlot, joinContained } = require('./safeFsIdentity.cjs');

const HTTP_FEED_MAX_BYTES = 8 * 1024 * 1024;
const HTTP_FEED_MAX_HOPS = 5;
const HTTP_FEED_DEADLINE_MS = 45000;

/** Query `file=` value → on-disk name used by xmlCollector. */
const HTTP_FEED_SAVEGAME_FILES = [
    { query: 'careerSavegame', fileName: 'careerSavegame.xml' },
    { query: 'vehicles', fileName: 'vehicles.xml' },
    { query: 'economy', fileName: 'economy.xml' },
    { query: 'farms', fileName: 'farms.xml' },
    { query: 'farmland', fileName: 'farmland.xml' },
    { query: 'fields', fileName: 'fields.xml' },
    { query: 'environment', fileName: 'environment.xml' },
    { query: 'missions', fileName: 'missions.xml' },
    { query: 'placeables', fileName: 'placeables.xml' },
    { query: 'precisionFarming', fileName: 'precisionFarming.xml' },
];

function hasHttpFeed(srv) {
    if (!srv || typeof srv !== 'object') return false;
    const host = String(srv.httpFeedHost || '').trim();
    const code = String(srv.httpFeedCode || '').trim();
    return Boolean(host && code);
}

/** mirror_savegame6 → savegame6 for cache folder naming. Never used to open a local SP folder. */
function normalizeFeedCacheSlot(srv, saveSlot) {
    const slot = sanitizeSaveSlot(saveSlot || srv?.localSubFolder, 'savegame1');
    return slot.replace(/^mirror_/i, '') || 'savegame1';
}

function getHttpXmlCacheDir(userDataPath, srv, saveSlot) {
    const slot = normalizeFeedCacheSlot(srv, saveSlot);
    return joinContained(userDataPath, 'httpXmlCache', String(srv.id), slot);
}

function buildSavegameFeedUrl(srv, fileQuery) {
    const host = String(srv.httpFeedHost || '').trim();
    const port = parseInt(srv.httpFeedPort, 10) || 8080;
    const code = String(srv.httpFeedCode || '').trim();
    const scheme = srv.httpFeedSecure === true ? 'https' : 'http';
    const base = `${scheme}://${host}:${port}/feed/dedicated-server-savegame.html`;
    const u = new URL(base);
    u.searchParams.set('code', code);
    u.searchParams.set('file', fileQuery);
    return u.toString();
}

function buildStatsFeedUrl(srv) {
    const host = String(srv.httpFeedHost || '').trim();
    const port = parseInt(srv.httpFeedPort, 10) || 8080;
    const code = String(srv.httpFeedCode || '').trim();
    const scheme = srv.httpFeedSecure === true ? 'https' : 'http';
    const u = new URL(`${scheme}://${host}:${port}/feed/dedicated-server-stats.xml`);
    u.searchParams.set('code', code);
    return u.toString();
}

function looksLikeXml(buf) {
    if (!buf || buf.length < 20) return false;
    const head = buf.slice(0, 200).toString('utf8').replace(/^\uFEFF/, '').trimStart();
    return head.startsWith('<?xml') || head.startsWith('<');
}

function httpGetBuffer(urlStr, timeoutMs = 25000, hopsLeft = HTTP_FEED_MAX_HOPS, deadlineAt = 0) {
    const deadline = deadlineAt || Date.now() + HTTP_FEED_DEADLINE_MS;
    return new Promise((resolve, reject) => {
        let parsed;
        try {
            parsed = new URL(urlStr);
            if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('HTTP feed protocol not allowed');
        } catch (error) { reject(error); return; }
        const remaining = deadline - Date.now();
        if (remaining <= 0) { reject(new Error('HTTP feed total deadline exceeded')); return; }
        const lib = parsed.protocol === 'https:' ? https : http;
        let req;
        let response;
        let settled = false;
        const finish = (error, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (error) {
                if (response && typeof response.destroy === 'function') response.destroy();
                if (req && typeof req.destroy === 'function') req.destroy();
                reject(error);
            } else resolve(value);
        };
        const timer = setTimeout(() => finish(new Error('HTTP feed total deadline exceeded')), remaining);
        try {
            req = lib.get(urlStr, {
                timeout: Math.max(1, Math.min(timeoutMs, remaining)),
                headers: { Accept: 'application/xml,text/xml,*/*' },
            }, res => {
                response = res;
                if (settled) { res.destroy(); return; }
                res.on('error', error => finish(error));
                res.on('aborted', () => finish(new Error('HTTP feed response aborted')));
                res.on('close', () => {
                    if (!settled && !res.complete) finish(new Error('HTTP feed response closed before completion'));
                });
                const status = res.statusCode || 0;
                if (status >= 300 && status < 400 && res.headers.location) {
                    let next;
                    try {
                        if (hopsLeft <= 0) throw new Error('HTTP feed redirect limit');
                        next = new URL(res.headers.location, parsed);
                        if (next.origin !== parsed.origin) throw new Error('HTTP feed cross-origin redirect not allowed');
                    } catch (error) { finish(error); return; }
                    settled = true;
                    clearTimeout(timer);
                    res.destroy();
                    httpGetBuffer(next.toString(), timeoutMs, hopsLeft - 1, deadline).then(resolve, reject);
                    return;
                }
                const chunks = [];
                let bytes = 0;
                res.on('data', chunk => {
                    if (settled) return;
                    if (Date.now() >= deadline) { finish(new Error('HTTP feed total deadline exceeded')); return; }
                    bytes += chunk.length;
                    if (bytes > HTTP_FEED_MAX_BYTES) { finish(new Error('HTTP feed response too large')); return; }
                    chunks.push(chunk);
                });
                res.on('end', () => {
                    if (Date.now() >= deadline) { finish(new Error('HTTP feed total deadline exceeded')); return; }
                    finish(null, { status, buf: Buffer.concat(chunks), contentType: String(res.headers['content-type'] || '') });
                });
            });
            req.on('timeout', () => finish(new Error('HTTP feed request timed out')));
            req.on('error', error => finish(error));
        } catch (error) { finish(error); }
    });
}

/**
 * Download available Giants savegame XML into userData/httpXmlCache/<serverId>/<slot>/.
 * Returns { ok, dir, saved, skipped, failed }.
 */
async function downloadHttpFeedSavegameXml(srv, saveSlot, userDataPath) {
    if (!hasHttpFeed(srv)) {
        return { ok: false, reason: 'no_feed', saved: [], skipped: [], failed: [] };
    }
    if (!userDataPath) {
        return { ok: false, reason: 'no_userData', saved: [], skipped: [], failed: [] };
    }
    const dir = getHttpXmlCacheDir(userDataPath, srv, saveSlot);
    await fsp.mkdir(dir, { recursive: true });

    const saved = [];
    const skipped = [];
    const failed = [];

    for (const { query, fileName } of HTTP_FEED_SAVEGAME_FILES) {
        const url = buildSavegameFeedUrl(srv, query);
        try {
            const { status, buf } = await httpGetBuffer(url);
            if (status === 204 || !buf || buf.length === 0) {
                skipped.push(fileName);
                continue;
            }
            if (status !== 200 || !looksLikeXml(buf)) {
                skipped.push(fileName);
                continue;
            }
            const tmp = path.join(dir, `${fileName}.tmp`);
            const finalPath = path.join(dir, fileName);
            await fsp.writeFile(tmp, buf);
            await fsp.rename(tmp, finalPath);
            saved.push(fileName);
        } catch (e) {
            failed.push({ fileName, error: e && e.message ? e.message : String(e) });
        }
    }

    // Optional live player list — not required by collectXmlData.
    try {
        const { status, buf } = await httpGetBuffer(buildStatsFeedUrl(srv));
        if (status === 200 && looksLikeXml(buf)) {
            const finalPath = path.join(dir, 'dedicated-server-stats.xml');
            const tmp = `${finalPath}.tmp`;
            await fsp.writeFile(tmp, buf);
            await fsp.rename(tmp, finalPath);
            saved.push('dedicated-server-stats.xml');
        }
    } catch (_) {
        /* optional */
    }

    return {
        ok: saved.length > 0,
        dir,
        saved,
        skipped,
        failed,
    };
}

module.exports = {
    HTTP_FEED_SAVEGAME_FILES,
    hasHttpFeed,
    normalizeFeedCacheSlot,
    getHttpXmlCacheDir,
    buildSavegameFeedUrl,
    buildStatsFeedUrl,
    downloadHttpFeedSavegameXml,
    looksLikeXml,
};
