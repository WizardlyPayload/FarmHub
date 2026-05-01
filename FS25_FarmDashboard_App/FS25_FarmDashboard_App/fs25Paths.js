// FS25 FarmDashboard — locate FS25 “user data” roots (saves, mods, modSettings).
//
// Covers:
// - Classic: Documents/My Games/FarmingSimulator2025 (+ OneDrive redirects)
// - Microsoft Store / Xbox app on PC: AppData/Local/Packages/GIANTSSoftware.FarmingSimulator25PC_*/LocalCache/Local
// - Same package layout on a secondary drive under WpSystem/<SID>/AppData/Local/Packages/...

const fs = require('fs');
const path = require('path');
const os = require('os');

/** MS Store family folder prefix (publisher id suffix may change between builds). */
const GIANTS_FS25_PACKAGE_RE = /^GIANTSSoftware\.FarmingSimulator25PC_/i;

function pathKey(p) {
    try {
        const n = path.normalize(p);
        return process.platform === 'win32' ? n.toLowerCase() : n;
    } catch (_) {
        return p;
    }
}

/**
 * Ordered list of unique FS25 user-data roots (folders that contain mods / savegames / modSettings).
 * @param {() => string | null | undefined} [getDocumentsPath]  e.g. () => app.getPath('documents')
 */
function collectFs25DocumentRoots(getDocumentsPath) {
    const seen = new Set();
    const out = [];
    const add = (p) => {
        if (!p || typeof p !== 'string') return;
        try {
            const k = pathKey(p);
            if (seen.has(k)) return;
            seen.add(k);
            out.push(path.normalize(p));
        } catch (_) { /* ignore */ }
    };

    if (typeof getDocumentsPath === 'function') {
        try {
            const d = getDocumentsPath();
            if (d) add(path.join(d, 'My Games', 'FarmingSimulator2025'));
        } catch (_) { /* ignore */ }
    }

    add(path.join(os.homedir(), 'Documents', 'My Games', 'FarmingSimulator2025'));

    const up = process.env.USERPROFILE;
    if (up) {
        add(path.join(up, 'Documents', 'My Games', 'FarmingSimulator2025'));
        add(path.join(up, 'OneDrive', 'Documents', 'My Games', 'FarmingSimulator2025'));
        add(path.join(up, 'OneDrive - Personal', 'Documents', 'My Games', 'FarmingSimulator2025'));

        try {
            const entries = fs.readdirSync(up, { withFileTypes: true });
            for (const ent of entries) {
                if (!ent.isDirectory()) continue;
                if (/^OneDrive/i.test(ent.name)) {
                    add(path.join(up, ent.name, 'Documents', 'My Games', 'FarmingSimulator2025'));
                }
            }
        } catch (_) { /* ignore */ }
    }

    if (process.platform === 'win32') {
        for (const p of collectMsStoreLocalCacheRoots()) {
            add(p);
        }
    }

    try {
        const derived = [];
        const seenDerive = new Set(out.map(pathKey));
        for (const root of out) {
            appendRootsFromGameSettingsXml(root, derived, seenDerive);
        }
        for (const d of derived) {
            add(d);
        }
    } catch (_) { /* ignore */ }

    return out;
}

/**
 * If gameSettings.xml points mods elsewhere (modsDirectoryOverride), include that FS25 root too.
 */
function appendRootsFromGameSettingsXml(fs25Root, derivedOut, seenKeys) {
    const gs = path.join(fs25Root, 'gameSettings.xml');
    if (!fs.existsSync(gs)) return;
    let raw;
    try {
        raw = fs.readFileSync(gs, 'utf8');
    } catch (_) {
        return;
    }
    const attr = raw.match(/\bmodsDirectoryOverride\s*=\s*"([^"]*)"/i);
    const inner = raw.match(/<modsDirectoryOverride[^>]*>([^<]*)<\/modsDirectoryOverride>/is);
    const val = (attr && attr[1]) || (inner && inner[1]);
    if (!val || !String(val).trim()) return;
    let p = String(val).trim().replace(/\//g, path.sep);
    try {
        if (!path.isAbsolute(p)) {
            p = path.resolve(fs25Root, p);
        }
        let candidate = p;
        const base = path.basename(candidate);
        if (base.toLowerCase() === 'mods') {
            candidate = path.dirname(candidate);
        }
        const k = pathKey(candidate);
        if (seenKeys.has(k)) return;
        if (!fs.existsSync(candidate)) return;
        seenKeys.add(k);
        derivedOut.push(candidate);
    } catch (_) { /* ignore */ }
}

/**
 * Microsoft Store / Xbox app: .../Packages/GIANTSSoftware.FarmingSimulator25PC_<token>/LocalCache/Local
 */
function collectMsStoreLocalCacheRoots() {
    const out = [];
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) return out;

    const packagesDir = path.join(localAppData, 'Packages');
    collectGiantsFs25FromPackagesDir(packagesDir, out);

    for (let i = 0; i < 26; i++) {
        const letter = String.fromCharCode(65 + i);
        const wpRoot = `${letter}:\\WpSystem`;
        if (!fs.existsSync(wpRoot)) continue;
        let sids;
        try {
            sids = fs.readdirSync(wpRoot, { withFileTypes: true });
        } catch (_) {
            continue;
        }
        for (const sid of sids) {
            if (!sid.isDirectory()) continue;
            const nested = path.join(wpRoot, sid.name, 'AppData', 'Local', 'Packages');
            collectGiantsFs25FromPackagesDir(nested, out);
        }
    }

    return out;
}

function collectGiantsFs25FromPackagesDir(packagesDir, outArray) {
    if (!packagesDir || !fs.existsSync(packagesDir)) return;
    let entries;
    try {
        entries = fs.readdirSync(packagesDir, { withFileTypes: true });
    } catch (_) {
        return;
    }
    const seen = new Set(outArray.map(pathKey));
    for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        if (!GIANTS_FS25_PACKAGE_RE.test(ent.name)) continue;
        const localRoot = path.join(packagesDir, ent.name, 'LocalCache', 'Local');
        if (!fs.existsSync(localRoot)) continue;
        const k = pathKey(localRoot);
        if (seen.has(k)) continue;
        seen.add(k);
        outArray.push(localRoot);
    }
}

/**
 * Higher score = more likely the live FS25 data directory (avoids picking an empty Documents tree
 * when the real install is under the Store package path or vice versa).
 * @param {string} root
 * @returns {number}
 */
function scoreFs25UserDataRoot(root) {
    if (!root || typeof root !== 'string') return 0;
    let score = 0;
    try {
        if (!fs.existsSync(root)) return 0;
        score = 1;
    } catch (_) {
        return 0;
    }
    try {
        if (fs.existsSync(path.join(root, 'modSettings', 'FS25_FarmDashboard'))) score += 100;
    } catch (_) { /* ignore */ }
    try {
        if (fs.existsSync(path.join(root, 'mods'))) score += 20;
    } catch (_) { /* ignore */ }
    try {
        const subs = fs.readdirSync(root, { withFileTypes: true });
        for (const d of subs) {
            if (!d.isDirectory()) continue;
            const name = d.name;
            if (/^savegame\d+/i.test(name) || name === 'save') {
                if (fs.existsSync(path.join(root, name, 'careerSavegame.xml'))) {
                    score += 50;
                    break;
                }
            }
        }
    } catch (_) { /* ignore */ }
    return score;
}

/**
 * Pick the best candidate root for defaults (config export path, “primary” folder). Falls back to first path with score &gt; 0, then first in list.
 * @param {string[]} candidates
 * @param {string} [fallback]
 */
function selectPreferredFs25UserDataRoot(candidates, fallback) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
        return fallback || null;
    }
    let best = null;
    let bestScore = -1;
    for (const c of candidates) {
        const s = scoreFs25UserDataRoot(c);
        if (s > bestScore) {
            bestScore = s;
            best = c;
        }
    }
    if (best && bestScore > 0) return best;
    for (const c of candidates) {
        try {
            if (fs.existsSync(c)) return c;
        } catch (_) { /* ignore */ }
    }
    return candidates[0] || fallback || null;
}

/**
 * All plausible modSettings/FS25_FarmDashboard parent folders (deduped).
 * @param {() => string | null | undefined} [getDocumentsPath]
 */
function collectFarmDashboardModSettingsRoots(getDocumentsPath) {
    const roots = new Set();
    const add = (p) => {
        if (!p || typeof p !== 'string') return;
        try {
            roots.add(path.normalize(p));
        } catch (_) { /* ignore */ }
    };
    for (const fs25 of collectFs25DocumentRoots(getDocumentsPath)) {
        add(path.join(fs25, 'modSettings', 'FS25_FarmDashboard'));
    }
    return [...roots];
}

module.exports = {
    collectFs25DocumentRoots,
    collectFarmDashboardModSettingsRoots,
    collectMsStoreLocalCacheRoots,
    scoreFs25UserDataRoot,
    selectPreferredFs25UserDataRoot,
};
