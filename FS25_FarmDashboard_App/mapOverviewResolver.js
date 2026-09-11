// FS25 FarmDashboard | mapOverviewResolver.js
// Locates the in-game PDA overview texture (overview.dds / overview.png) and caches a web PNG.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const {
  FULL_TERRAIN_INSET,
  analyzeOverviewTerrain,
  isFullBleedInset,
  roundInset,
  squareizeTerrainInset,
} = require('./mapOverviewTerrainInset.cjs');
const { lookupTerrainInsetOverride } = require('./mapOverviewInsets.cjs');
const { collectFs25DocumentRoots } = require('./fs25Paths');
const { sanitizeMapSlug, joinContained } = require('./safeFsIdentity.cjs');

// v17: never crop overview — IngameMap Overlay 0–1 is map.xml imageFilename (game hotspot UV).
const OVERVIEW_CACHE_VERSION = 17;

/** Official DLC map packs (folder name under `<game>/pdlc/`, without `.dlc`). */
const MAP_DLC_PACKAGE_HINTS = [
  {
    packages: ['highlandsFishingPack'],
    match(slug, title, tokens) {
      if (tokens.includes('kinlaig')) return true;
      if (slug && slug.includes('kinlaig')) return true;
      return /kinlaig/i.test(title || '');
    },
  },
  {
    packages: ['plainsAndPrairiesPack'],
    match(slug, title, tokens) {
      if (tokens.includes('prairie') || tokens.includes('prairies')) return true;
      if (slug && (slug.includes('prairie') || slug.includes('plains'))) return true;
      return /prairie|plains/i.test(title || '');
    },
  },
];
const TERRAIN_INSET_SAMPLE_SIZE = 512;

const OVERVIEW_NAMES = new Set([
  'overview.dds',
  'overview.png',
  'mapoverview.dds',
  'mapoverview.png',
]);
const OVERVIEW_ENTRY_RE = /(?:^|\/)(?:textures\/ui\/|maps\/ui\/)(?:overview|mapoverview)\.(dds|png)$/i;
const OVERVIEW_ENTRY_FALLBACK_RE = /(?:^|\/)(?:map)?overview\.(dds|png)$/i;

/** Giants map.xml `<map width height imageFilename>` — overlay UV 0–1 of that image. */
function parseMapXmlMeta(xmlText) {
  const head = String(xmlText || '').slice(0, 8000);
  const tag = /<map\b([^>]*)>/i.exec(head);
  if (!tag) return null;
  const attrs = tag[1];
  const width = Number((/\bwidth\s*=\s*"([^"]+)"/i.exec(attrs) || [])[1]);
  const height = Number((/\bheight\s*=\s*"([^"]+)"/i.exec(attrs) || [])[1]);
  const imageFilename = String((/\bimageFilename\s*=\s*"([^"]+)"/i.exec(attrs) || [])[1] || '').trim();
  return {
    width: Number.isFinite(width) && width >= 128 ? width : null,
    height: Number.isFinite(height) && height >= 128 ? height : null,
    imageFilename,
  };
}

function isOfficialMapUiOverviewPath(filePath) {
  return OVERVIEW_ENTRY_RE.test(String(filePath || '').replace(/\\/g, '/'));
}

function normalizeMapSlug(mapId, mapTitle) {
  const raw = String(mapId || mapTitle || '').trim();
  if (!raw) return '';
  const cleaned = raw.replace(/\.[^.\\/]+$/, '').replace(/[\s'"]+/g, '');
  let slug = cleaned.toLowerCase();
  if (/^map[a-z0-9]+$/i.test(cleaned)) slug = cleaned.toLowerCase();
  if (/^[a-z]{2,3}$/i.test(cleaned) && mapTitle) {
    const t = String(mapTitle).toLowerCase();
    if (t.includes('us') || t.includes('america')) slug = 'mapus';
    else if (t.includes('eu') || t.includes('europe')) slug = 'mapeu';
  }
  return sanitizeMapSlug(slug) || '';
}

function compactAlnum(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const MAP_SIZE_SUFFIX_RE = /^(xl|xxl|2x|4x|16x)$/;

function keepTitleToken(tok) {
  if (!tok) return false;
  if (MAP_SIZE_SUFFIX_RE.test(tok)) return true;
  return tok.length >= 4;
}

/** Split CamelCase and size suffixes so SaxlinghamXL → saxlingham, xl. */
function splitMapTitlePieces(mapTitle) {
  const out = [];
  for (const chunk of String(mapTitle || '').split(/[^A-Za-z0-9]+/)) {
    if (!chunk) continue;
    const camel = chunk.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+[xX]?|\d+/g);
    const parts = camel && camel.length ? camel : [chunk];
    for (const part of parts) {
      const low = part.toLowerCase();
      const sized = low.match(/^(.*?)(xl|xxl|2x|4x|16x)$/);
      if (sized && sized[1].length >= 4) {
        out.push(sized[1], sized[2]);
      } else {
        out.push(low);
      }
    }
  }
  return out;
}

/** Distinct tokens from a display title — used to rank mod zips (e.g. Witcombe Valley → witcombe). */
function titleTokensFromMapTitle(mapTitle) {
  if (!mapTitle) return [];
  const seen = new Set();
  const out = [];
  for (const tok of splitMapTitlePieces(mapTitle)) {
    if (!keepTitleToken(tok) || seen.has(tok)) continue;
    seen.add(tok);
    out.push(tok);
  }
  return out;
}

const GENERIC_MAP_TITLE_TOKENS = new Set([
  'valley', 'farming', 'farm', 'road', 'roads', 'dairy', 'map', 'simulator',
  'fs25', 'fs22', 'mod', 'the', 'and', 'for', 'edition', 'main', 'hills',
]);

function distinctiveTitleTokens(mapTitle) {
  return titleTokensFromMapTitle(mapTitle).filter((t) => !GENERIC_MAP_TITLE_TOKENS.has(t));
}

function pathIncludesToken(filePath, token) {
  const tok = String(token || '').toLowerCase();
  if (!tok) return false;
  const lower = String(filePath || '').toLowerCase().replace(/\\/g, '/');
  if (lower.includes(tok)) return true;
  const compactTok = compactAlnum(tok);
  return compactTok.length >= 2 && compactAlnum(lower).includes(compactTok);
}

function pathMatchesMapIdentity(filePath, mapSlug, mapTitle) {
  const lower = String(filePath || '').toLowerCase().replace(/\\/g, '/');
  const distinctive = distinctiveTitleTokens(mapTitle);
  if (distinctive.length > 0) {
    return distinctive.some((tok) => pathIncludesToken(lower, tok));
  }
  if (mapSlug && pathIncludesToken(lower, mapSlug)) return true;
  return !mapTitle && !mapSlug;
}

function archiveMatchesMapIdentity(zipPath, mapSlug, mapTitle) {
  return pathMatchesMapIdentity(path.basename(zipPath), mapSlug, mapTitle);
}

function scoreZipArchiveName(zipPath, mapSlug, titleTokens) {
  const base = path.basename(zipPath).toLowerCase();
  let score = 0;
  if (mapSlug && pathIncludesToken(base, mapSlug)) score += 60;
  for (const tok of titleTokens || []) {
    if (pathIncludesToken(base, tok)) score += 40;
  }
  return score;
}

function getMapOverviewCacheDir() {
  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), 'map_overviews');
    }
  } catch (_) {
    /* not in Electron main process */
  }
  return path.join(
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
    'fs25-farm-dashboard',
    'map_overviews'
  );
}

function getFs25GameInstallRoots() {
  const roots = [];
  const push = (p) => {
    if (!p || typeof p !== 'string') return;
    try {
      if (fs.existsSync(p)) roots.push(path.normalize(p));
    } catch (_) {
      /* ignore */
    }
  };
  const env = process.env.FS25_GAME_PATH || process.env.FARMING_SIMULATOR_2025_PATH;
  if (env) push(env);
  const steamCommon = path.join(
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    'Steam',
    'steamapps',
    'common'
  );
  push(path.join(steamCommon, 'Farming Simulator 25'));
  push(path.join(steamCommon, 'Farming Simulator 2025'));
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  push(path.join(pf, 'Farming Simulator 25'));
  push(path.join(pf, 'Farming Simulator 2025'));
  push(path.join(pf, 'Epic Games', 'FarmingSimulator25'));
  push(path.join(pf, 'Epic Games', 'FarmingSimulator2025'));
  push(path.join(pf, 'XboxGames', 'Farming Simulator 25', 'Content'));
  push(path.join(pf, 'XboxGames', 'Farming Simulator 2025', 'Content'));
  return [...new Set(roots)];
}

function getFs25GameDataRoots() {
  const roots = [];
  for (const installRoot of getFs25GameInstallRoots()) {
    const data = path.join(installRoot, 'data');
    const maps = path.join(data, 'maps');
    if (fs.existsSync(maps)) roots.push(data);
  }
  return [...new Set(roots)];
}

function getFs25PdlcRoots() {
  const roots = [];
  const add = (p) => {
    if (!p) return;
    try {
      if (fs.existsSync(p)) roots.push(path.normalize(p));
    } catch (_) {
      /* ignore */
    }
  };
  for (const installRoot of getFs25GameInstallRoots()) {
    add(path.join(installRoot, 'pdlc'));
  }
  for (const docRoot of collectFs25DocumentRoots()) {
    add(path.join(docRoot, 'pdlc'));
  }
  return [...new Set(roots)];
}

function resolveDlcPackages(mapSlug, mapTitle, titleTokens) {
  const tokens = titleTokens || titleTokensFromMapTitle(mapTitle);
  const out = new Set();
  for (const hint of MAP_DLC_PACKAGE_HINTS) {
    if (hint.match(mapSlug, mapTitle, tokens)) {
      for (const pkg of hint.packages) out.add(pkg);
    }
  }
  return [...out];
}

function isLikelyDlcMap(mapSlug, mapTitle, titleTokens) {
  return resolveDlcPackages(mapSlug, mapTitle, titleTokens).length > 0;
}

function pdlcPackageOverviewCandidates(packageDir, mapSlug) {
  const bases = [path.join(packageDir, 'map')];
  if (mapSlug) bases.push(path.join(packageDir, 'maps', mapSlug));
  const names = ['overview.dds', 'overview.png'];
  const out = [];
  for (const base of bases) {
    out.push(path.join(base, 'textures', 'ui', 'overview.dds'));
    out.push(path.join(base, 'textures', 'ui', 'overview.png'));
    for (const name of names) out.push(path.join(base, name));
  }
  return out;
}

async function findOverviewInPdlcPackages(pdlcRoots, packages, mapSlug, mapTitle, titleTokens) {
  if (!packages || packages.length === 0) return null;
  for (const pdlcRoot of pdlcRoots || []) {
    if (!(await pathExists(pdlcRoot))) continue;
    for (const pkg of packages) {
      const pkgDir = path.join(pdlcRoot, pkg);
      const hit = await findFirstExisting(pdlcPackageOverviewCandidates(pkgDir, mapSlug));
      if (hit) return { sourcePath: hit, mapSlug, sourceKind: 'file', dlcPackage: pkg };
      const walked = await walkForOverview(pkgDir, mapSlug, mapTitle, titleTokens, 8, 8000);
      if (walked) return { sourcePath: walked, mapSlug, sourceKind: 'file', dlcPackage: pkg };
    }
  }
  return null;
}

async function findOverviewInModSettingsExport(mapId, mapTitle, mapSlug) {
  const docRoots = collectFs25DocumentRoots();
  const keys = new Set();
  if (mapId) keys.add(String(mapId));
  if (mapSlug) keys.add(String(mapSlug));
  const slugFromTitle = normalizeMapSlug(null, mapTitle);
  if (slugFromTitle) keys.add(slugFromTitle);

  for (const docRoot of docRoots) {
    const base = path.join(docRoot, 'modSettings', 'FS25_FarmDashboard', 'mapOverview');
    if (!(await pathExists(base))) continue;

    for (const key of keys) {
      for (const name of ['overview.dds', 'overview.png']) {
        const candidate = path.join(base, key, name);
        if (await pathExists(candidate)) return candidate;
      }
    }

    let entries;
    try {
      entries = await fs.promises.readdir(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const dir = path.join(base, ent.name);
      for (const name of ['overview.dds', 'overview.png']) {
        const candidate = path.join(dir, name);
        if (!(await pathExists(candidate))) continue;
        const metaPath = path.join(dir, 'meta.json');
        try {
          const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf8'));
          const metaTitle = String(meta.mapTitle || '').toLowerCase();
          const metaId = String(meta.mapId || '').toLowerCase();
          const wantTitle = String(mapTitle || '').toLowerCase();
          const wantId = String(mapId || '').toLowerCase();
          if (
            (wantId && metaId === wantId) ||
            (wantTitle && metaTitle && metaTitle === wantTitle) ||
            (mapSlug && ent.name.toLowerCase() === mapSlug.toLowerCase())
          ) {
            return candidate;
          }
        } catch {
          if (mapSlug && ent.name.toLowerCase() === mapSlug.toLowerCase()) return candidate;
        }
      }
    }
  }
  return null;
}

function vanillaOverviewCandidates(gameDataRoot, mapSlug) {
  if (!gameDataRoot || !mapSlug) return [];
  const base = path.join(gameDataRoot, 'maps', mapSlug);
  return [
    path.join(base, 'textures', 'ui', 'overview.dds'),
    path.join(base, 'textures', 'ui', 'overview.png'),
    path.join(base, 'overview.dds'),
    path.join(base, 'overview.png'),
  ];
}

function scoreOverviewPath(filePath, mapSlug, titleTokens) {
  const lower = filePath.toLowerCase().replace(/\\/g, '/');
  let score = 0;
  if (lower.endsWith('/textures/ui/overview.dds') || lower.endsWith('/textures/ui/overview.png')) {
    score += 40;
  } else if (/\/(?:maps\/)?ui\/(?:map)?overview\.(dds|png)$/.test(lower)) {
    score += 32;
  } else if (/(?:^|\/)(?:map)?overview\.(dds|png)$/.test(lower)) {
    score += 25;
  }
  if (mapSlug && lower.includes(`/maps/${mapSlug}/`)) score += 80;
  if (mapSlug && lower.includes(`/${mapSlug}/`)) score += 35;
  if (mapSlug && pathIncludesToken(lower, mapSlug)) score += 15;
  for (const tok of titleTokens || []) {
    if (pathIncludesToken(lower, tok)) score += 25;
  }
  return score;
}

async function pathExists(p) {
  try {
    await fs.promises.access(p, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function findFirstExisting(paths) {
  for (const p of paths) {
    if (await pathExists(p)) return p;
  }
  return null;
}

async function walkForOverview(rootDir, mapSlug, mapTitle, titleTokens, maxDepth = 9, maxFiles = 12000) {
  let best = null;
  let bestScore = -1;
  let seen = 0;
  const stack = [{ dir: rootDir, depth: 0 }];

  while (stack.length > 0 && seen < maxFiles) {
    const { dir, depth } = stack.pop();
    if (depth > maxDepth) continue;
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      seen += 1;
      if (seen >= maxFiles) break;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        const skip = /^\.|node_modules$/i.test(ent.name);
        if (!skip) stack.push({ dir: full, depth: depth + 1 });
        continue;
      }
      if (!ent.isFile()) continue;
      const low = ent.name.toLowerCase();
      if (!OVERVIEW_NAMES.has(low)) continue;
      if (!pathMatchesMapIdentity(full, mapSlug, mapTitle)) continue;
      const sc = scoreOverviewPath(full, mapSlug, titleTokens);
      if (sc > bestScore) {
        bestScore = sc;
        best = full;
      }
    }
  }
  return best;
}

function loadYauzl() {
  try {
    return require('yauzl');
  } catch {
    return null;
  }
}

function openZip(yauzl, zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) reject(err);
      else resolve(zipfile);
    });
  });
}

function readZipEntryStream(yauzl, zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err) reject(err);
      else resolve(stream);
    });
  });
}

async function findOverviewInZip(yauzl, zipPath, mapSlug, titleTokens) {
  const zipfile = await openZip(yauzl, zipPath);
  return new Promise((resolve, reject) => {
    let best = null;
    let bestScore = -1;
    zipfile.on('entry', (entry) => {
      const name = entry.fileName.replace(/\\/g, '/');
      const low = name.toLowerCase();
      if (low.includes('__macosx') || /(^|\/)\._/.test(low)) {
        zipfile.readEntry();
        return;
      }
      const isOverview =
        OVERVIEW_ENTRY_RE.test(low) ||
        OVERVIEW_ENTRY_FALLBACK_RE.test(low) ||
        OVERVIEW_NAMES.has(path.basename(low));
      if (!isOverview) {
        zipfile.readEntry();
        return;
      }
      const sc =
        scoreOverviewPath(name, mapSlug, titleTokens) +
        scoreZipArchiveName(zipPath, mapSlug, titleTokens);
      if (sc > bestScore) {
        bestScore = sc;
        best = { zipPath, entryName: entry.fileName, entrySize: entry.uncompressedSize };
      }
      zipfile.readEntry();
    });
    zipfile.on('end', () => resolve(best));
    zipfile.on('error', reject);
    zipfile.readEntry();
  });
}

async function listZipArchives(modsRoot, maxZips = 400) {
  let entries;
  try {
    entries = await fs.promises.readdir(modsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const zips = entries
    .filter((e) => e.isFile() && /\.zip$/i.test(e.name))
    .map((e) => path.join(modsRoot, e.name));
  return zips.slice(0, maxZips);
}

async function listMatchingMapZipPaths(modsRoot, mapSlug, mapTitle) {
  let entries;
  try {
    entries = await fs.promises.readdir(modsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const hints = new Set();
  for (const tok of distinctiveTitleTokens(mapTitle)) hints.add(tok);
  if (mapSlug) {
    hints.add(mapSlug);
    const stripped = mapSlug.replace(/^map/, '');
    if (stripped) hints.add(stripped);
  }
  const out = [];
  for (const ent of entries) {
    if (!ent.isFile() || !/\.zip$/i.test(ent.name)) continue;
    const low = ent.name.toLowerCase();
    for (const hint of hints) {
      if (hint && low.includes(String(hint).toLowerCase())) {
        out.push(path.join(modsRoot, ent.name));
        break;
      }
    }
  }
  return out;
}

async function findOverviewInZipArchives(modsRoots, mapSlug, mapTitle, titleTokens) {
  const yauzl = loadYauzl();
  if (!yauzl) return null;

  const archives = [];
  const priority = [];
  for (const root of modsRoots || []) {
    if (!(await pathExists(root))) continue;
    for (const z of await listMatchingMapZipPaths(root, mapSlug, mapTitle)) {
      priority.push(z);
    }
    const zips = await listZipArchives(root);
    for (const z of zips) archives.push(z);
  }
  if (archives.length === 0 && priority.length === 0) return null;

  const distinctive = distinctiveTitleTokens(mapTitle);
  let candidates = [...new Set([...priority, ...archives])];
  if (distinctive.length > 0) {
    const matched = candidates.filter((z) => archiveMatchesMapIdentity(z, mapSlug, mapTitle));
    if (matched.length > 0) {
      candidates = matched;
    } else {
      // e.g. Riverbend Springs (MapUS) — never use another mod's mapUS overview texture
      return null;
    }
  }

  candidates.sort(
    (a, b) =>
      scoreZipArchiveName(b, mapSlug, titleTokens) -
      scoreZipArchiveName(a, mapSlug, titleTokens)
  );

  let best = null;
  let bestScore = -1;
  const limit = Math.min(candidates.length, 80);
  for (let i = 0; i < limit; i += 1) {
    const zipPath = candidates[i];
    let hit;
    try {
      hit = await findOverviewInZip(yauzl, zipPath, mapSlug, titleTokens);
    } catch {
      continue;
    }
    if (!hit) continue;
    const sc =
      scoreOverviewPath(hit.entryName, mapSlug, titleTokens) +
      scoreZipArchiveName(zipPath, mapSlug, titleTokens);
    if (sc > bestScore) {
      bestScore = sc;
      best = hit;
    }
    if (bestScore >= 120) break;
  }
  const minScore = distinctive.length > 0 ? 55 : mapSlug ? 40 : 30;
  if (!best || bestScore < minScore) return null;
  return best;
}

async function extractZipOverviewToTemp(zipHit) {
  const yauzl = loadYauzl();
  if (!yauzl) throw new Error('yauzl unavailable');

  const zipStat = await fs.promises.stat(zipHit.zipPath);
  const key = crypto
    .createHash('sha1')
    .update(`${zipHit.zipPath}|${zipHit.entryName}|${zipStat.mtimeMs}|${zipStat.size}`)
    .digest('hex')
    .slice(0, 16);
  const tempDir = path.join(os.tmpdir(), 'farmdash_map_overviews');
  await fs.promises.mkdir(tempDir, { recursive: true });
  const ext = path.extname(zipHit.entryName) || '.dds';
  const dest = path.join(tempDir, `${key}${ext.toLowerCase()}`);
  if (await pathExists(dest)) return dest;

  const zipfile = await openZip(yauzl, zipHit.zipPath);
  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      fn();
    };
    zipfile.on('entry', (entry) => {
      if (entry.fileName !== zipHit.entryName) {
        zipfile.readEntry();
        return;
      }
      readZipEntryStream(yauzl, zipfile, entry)
        .then(async (stream) => {
          await fs.promises.mkdir(path.dirname(dest), { recursive: true });
          const out = fs.createWriteStream(dest);
          stream.pipe(out);
          out.on('close', () => finish(resolve));
          out.on('error', (e) => finish(() => reject(e)));
          stream.on('error', (e) => finish(() => reject(e)));
        })
        .catch((e) => finish(() => reject(e)));
    });
    zipfile.on('end', () => finish(() => reject(new Error('zip entry not found'))));
    zipfile.on('error', (e) => finish(() => reject(e)));
    zipfile.readEntry();
  });
  return dest;
}

function normalizeModsRoots(modsRoot, modsRoots) {
  const out = [];
  const seen = new Set();
  const add = (p) => {
    if (!p || typeof p !== 'string') return;
    const k = p.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(p);
  };
  if (Array.isArray(modsRoots)) modsRoots.forEach(add);
  if (modsRoot) add(modsRoot);
  return out;
}

async function findOverviewSourceFile({ mapId, mapTitle, modsRoot, modsRoots }) {
  const mapSlug = normalizeMapSlug(mapId, mapTitle);
  const titleTokens = titleTokensFromMapTitle(mapTitle);
  const roots = normalizeModsRoots(modsRoot, modsRoots);
  const dlcPackages = resolveDlcPackages(mapSlug, mapTitle, titleTokens);

  const modSettingsHit = await findOverviewInModSettingsExport(mapId, mapTitle, mapSlug);
  if (modSettingsHit) {
    return { sourcePath: modSettingsHit, mapSlug, sourceKind: 'file', sourceOrigin: 'modSettings' };
  }

  if (dlcPackages.length > 0) {
    const pdlcHit = await findOverviewInPdlcPackages(
      getFs25PdlcRoots(),
      dlcPackages,
      mapSlug,
      mapTitle,
      titleTokens
    );
    if (pdlcHit) return { ...pdlcHit, sourceOrigin: 'pdlc' };
  }

  const candidates = [];

  for (const dataRoot of getFs25GameDataRoots()) {
    if (mapSlug) {
      for (const p of vanillaOverviewCandidates(dataRoot, mapSlug)) {
        candidates.push(p);
      }
    }
  }
  const direct = await findFirstExisting(candidates);
  if (direct) return { sourcePath: direct, mapSlug, sourceKind: 'file' };

  for (const modsDir of roots) {
    if (!mapSlug) continue;
    const modDirect = path.join(modsDir, 'maps', mapSlug, 'textures', 'ui', 'overview.dds');
    const modDirectPng = path.join(modsDir, 'maps', mapSlug, 'textures', 'ui', 'overview.png');
    const modHit = await findFirstExisting([modDirect, modDirectPng]);
    if (modHit) return { sourcePath: modHit, mapSlug, sourceKind: 'file' };
  }

  const zipHit = await findOverviewInZipArchives(roots, mapSlug, mapTitle, titleTokens);
  if (zipHit) {
    return {
      sourcePath: `${zipHit.zipPath}::${zipHit.entryName}`,
      mapSlug,
      sourceKind: 'zip',
      zipHit,
    };
  }

  for (const modsDir of roots) {
    if (!(await pathExists(modsDir))) continue;
    const walked = await walkForOverview(modsDir, mapSlug, mapTitle, titleTokens);
    if (walked) return { sourcePath: walked, mapSlug, sourceKind: 'file' };
  }

  if (dlcPackages.length > 0) {
    return {
      sourcePath: null,
      mapSlug,
      likelyDlc: true,
      dlcPackages,
    };
  }

  return { sourcePath: null, mapSlug };
}

async function findMagickInProgramFiles() {
  const roots = [
    process.env.ProgramFiles || 'C:\\Program Files',
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
  ];
  for (const root of roots) {
    if (!root) continue;
    let entries = [];
    try {
      entries = await fs.promises.readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isDirectory() || !/^ImageMagick/i.test(ent.name)) continue;
      const exe = path.join(root, ent.name, 'magick.exe');
      if (await pathExists(exe)) return exe;
    }
  }
  return null;
}

async function resolveMagickExe() {
  const names = ['magick.exe', 'magick'];
  for (const name of names) {
    try {
      const { execFileSync } = require('child_process');
      const out = execFileSync('where.exe', [name], { encoding: 'utf8', windowsHide: true });
      const line = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
      if (line && (await pathExists(line))) return line;
    } catch {
      /* next */
    }
  }
  const fromPf = await findMagickInProgramFiles();
  if (fromPf) return fromPf;
  const bundledDirs = [
    path.join(__dirname, 'resources', 'imagemagick'),
    path.join(process.resourcesPath || '', 'imagemagick'),
  ];
  for (const dir of bundledDirs) {
    const exe = path.join(dir, 'magick.exe');
    if (await pathExists(exe)) return exe;
  }
  return null;
}

async function resolveTexconvExe() {
  const candidates = [
    path.join(__dirname, 'resources', 'texconv', 'texconv.exe'),
    path.join(process.resourcesPath || '', 'texconv', 'texconv.exe'),
  ];
  for (const p of candidates) {
    if (await pathExists(p)) return p;
  }
  try {
    const { execFileSync } = require('child_process');
    const out = execFileSync('where.exe', ['texconv'], { encoding: 'utf8', windowsHide: true });
    const line = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    if (line && (await pathExists(line))) return line;
  } catch {
    /* ignore */
  }
  return null;
}

function spawnAsync(file, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, ...opts });
    let err = '';
    child.stderr?.on('data', (d) => { err += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(err || `${path.basename(file)} exited ${code}`));
    });
  });
}

async function convertDdsToPng(sourcePath, destPng) {
  const magick = await resolveMagickExe();
  if (magick) {
    await spawnAsync(magick, [sourcePath, destPng]);
    if (await pathExists(destPng)) return;
    throw new Error('ImageMagick did not produce PNG output');
  }
  const texconv = await resolveTexconvExe();
  if (!texconv) {
    throw new Error('No DDS converter (install ImageMagick or add texconv.exe to resources/texconv)');
  }
  const tempOut = path.join(os.tmpdir(), `fd_map_texconv_${crypto.randomBytes(6).toString('hex')}`);
  await fs.promises.mkdir(tempOut, { recursive: true });
  try {
    await spawnAsync(texconv, ['-nologo', '-y', '-ft', 'png', '-o', tempOut, sourcePath]);
    const base = path.basename(sourcePath, path.extname(sourcePath));
    let candidate = path.join(tempOut, `${base}.png`);
    if (!(await pathExists(candidate))) {
      const files = await fs.promises.readdir(tempOut);
      const png = files.find((f) => f.toLowerCase().endsWith('.png'));
      if (png) candidate = path.join(tempOut, png);
    }
    if (!(await pathExists(candidate))) {
      throw new Error('texconv did not produce PNG output');
    }
    await fs.promises.copyFile(candidate, destPng);
  } finally {
    await fs.promises.rm(tempOut, { recursive: true, force: true }).catch(() => {});
  }
}

function cacheKeyForMap(mapSlug, mapId, mapTitle) {
  const identity = `${mapSlug || ''}|${mapId || ''}|${mapTitle || ''}`.toLowerCase();
  const h = crypto.createHash('sha1').update(identity).digest('hex').slice(0, 12);
  const slug = sanitizeMapSlug(mapSlug) || sanitizeMapSlug(String(mapTitle || mapId || 'map').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40)) || 'map';
  return `${slug}_${h}`;
}

async function readPngRgbDownsampled(pngPath, sampleSize = TERRAIN_INSET_SAMPLE_SIZE) {
  const magick = await resolveMagickExe();
  if (!magick) return null;
  const r = spawnSync(
    magick,
    [pngPath, '-resize', `${sampleSize}x${sampleSize}!`, '-depth', '8', 'rgb:-'],
    { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024, windowsHide: true }
  );
  if (r.status !== 0 || !r.stdout || r.stdout.length < sampleSize * sampleSize * 3) return null;
  return { buf: r.stdout, size: sampleSize };
}

async function analyzeTerrainInsetFromPng(pngPath, mapSlug, mapId, sourcePath) {
  const sample = await readPngRgbDownsampled(pngPath);
  if (!sample) {
    return {
      pinInset: { ...FULL_TERRAIN_INSET },
      rawInset: { ...FULL_TERRAIN_INSET },
      shouldCrop: false,
      confidence: 0,
      mode: 'unknown',
      methods: {},
    };
  }

  let analysis = analyzeOverviewTerrain(sample.buf, sample.size);
  const override = lookupTerrainInsetOverride(mapSlug, mapId);
  if (override?.inset && (override.force || analysis.confidence < 0.55)) {
    const rawInset = roundInset(override.inset);
    // Override supplies true UV; do not bake DISPLAY_LEFT_PAD into the crop.
    const pinInset = roundInset(squareizeTerrainInset(rawInset, "center"));
    analysis = {
      ...analysis,
      pinInset,
      rawInset,
      confidence: override.force ? 1 : analysis.confidence,
      shouldCrop: !isFullBleedInset(rawInset),
      mode: 'override',
    };
  }
  return analysis;
}

async function detectTerrainInsetFromPng(pngPath, mapSlug, mapId, sourcePath) {
  const analysis = await analyzeTerrainInsetFromPng(pngPath, mapSlug, mapId, sourcePath);
  return analysis.pinInset;
}

async function cropPngToInset(pngPath, inset) {
  const magick = await resolveMagickExe();
  if (!magick) return false;
  const id = spawnSync(magick, [pngPath, '-format', '%w %h', 'info:'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const parts = String(id.stdout || '')
    .trim()
    .split(/\s+/);
  const nw = Number(parts[0]);
  const nh = Number(parts[1]);
  if (!nw || !nh) return false;

  const x = Math.max(0, Math.round(Number(inset.left) * nw));
  const y = Math.max(0, Math.round(Number(inset.top) * nh));
  let w = Math.min(nw - x, Math.round(Number(inset.width) * nw));
  let h = Math.min(nh - y, Math.round(Number(inset.height) * nh));
  // World terrain is square — keep the crop square after pixel rounding.
  if (Math.abs(w - h) > 0 && Math.abs(w - h) <= 3) {
    const side = Math.min(w, h);
    w = side;
    h = side;
  }
  if (w < 32 || h < 32) return false;

  const tmp = `${pngPath}.crop_${crypto.randomBytes(4).toString('hex')}.png`;
  try {
    await spawnAsync(magick, [pngPath, '-crop', `${w}x${h}+${x}+${y}`, '+repage', tmp]);
    if (!(await pathExists(tmp))) return false;
    await fs.promises.rename(tmp, pngPath);
    return true;
  } catch {
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
    return false;
  }
}

async function postProcessOverviewPng(pngPath, mapSlug, mapId, sourcePath) {
  // Keep the whole overview.dds. Playable world is the centre 50%
  // (IngameMap mapExtension). Overlay UV is remapped in fleetMapGeo; cropping
  // the PNG would hide the authored scenery and double-shift pins.
  const full = { ...FULL_TERRAIN_INSET };
  return {
    terrainInset: full,
    clipTerrainInset: full,
    imageCropped: false,
    detectedInset: full,
    analysis: {
      mode: 'ingame-map',
      shouldCrop: false,
      confidence: 1,
      pinInset: full,
      rawInset: full,
      mapXml: null,
    },
  };
}

async function ensureCachedPng(sourceDescriptor, mapSlug, mapId, mapTitle) {
  let sourcePath = sourceDescriptor;
  let stat;
  if (typeof sourceDescriptor === 'object' && sourceDescriptor?.sourceKind === 'zip') {
    sourcePath = await extractZipOverviewToTemp(sourceDescriptor.zipHit);
    stat = await fs.promises.stat(sourcePath);
  } else {
    stat = await fs.promises.stat(sourcePath);
  }

  const cacheDir = getMapOverviewCacheDir();
  await fs.promises.mkdir(cacheDir, { recursive: true });
  const cacheSourceKey =
    typeof sourceDescriptor === 'object' && sourceDescriptor?.sourcePath
      ? sourceDescriptor.sourcePath
      : sourcePath;
  const key = cacheKeyForMap(mapSlug, mapId, mapTitle);
  const metaPath = path.join(cacheDir, `${key}.json`);
  const pngPath = path.join(cacheDir, `${key}.png`);

  try {
    const metaRaw = await fs.promises.readFile(metaPath, 'utf8');
    const meta = JSON.parse(metaRaw);
    const cacheFresh =
      meta.cacheVersion === OVERVIEW_CACHE_VERSION &&
      meta.sourcePath === cacheSourceKey &&
      meta.mtimeMs === stat.mtimeMs &&
      meta.size === stat.size &&
      meta.terrainInset &&
      (await pathExists(pngPath));
    if (cacheFresh) {
      return {
        pngPath,
        key,
        mapTitle: meta.mapTitle || mapTitle || null,
        terrainInset: meta.terrainInset,
        clipTerrainInset: meta.clipTerrainInset || meta.terrainInset,
        imageCropped: !!meta.imageCropped,
      };
    }
  } catch {
    /* rebuild */
  }

  const ext = path.extname(sourcePath).toLowerCase();
  if (ext === '.png') {
    await fs.promises.copyFile(sourcePath, pngPath);
  } else if (ext === '.dds') {
    await convertDdsToPng(sourcePath, pngPath);
  } else {
    throw new Error(`Unsupported overview format: ${ext}`);
  }

  const processed = await postProcessOverviewPng(pngPath, mapSlug, mapId, cacheSourceKey);

  await fs.promises.writeFile(
    metaPath,
    JSON.stringify({
      cacheVersion: OVERVIEW_CACHE_VERSION,
      sourcePath: cacheSourceKey,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      mapSlug,
      mapId: mapId || null,
      mapTitle: mapTitle || null,
      terrainInset: processed.terrainInset,
      clipTerrainInset: processed.clipTerrainInset,
      imageCropped: processed.imageCropped,
      detectedInset: processed.detectedInset,
      terrainAnalysis: processed.analysis
        ? {
            mode: processed.analysis.mode,
            confidence: processed.analysis.confidence,
            pinInset: processed.analysis.pinInset,
            rawInset: processed.analysis.rawInset,
          }
        : null,
      cachedAt: new Date().toISOString(),
    }),
    'utf8'
  );
  return {
    pngPath,
    key,
    mapTitle: mapTitle || null,
    terrainInset: processed.terrainInset,
    clipTerrainInset: processed.clipTerrainInset,
    imageCropped: processed.imageCropped,
  };
}

/**
 * @returns {Promise<{ ok: boolean, url?: string, sourcePath?: string, mapSlug?: string, mapTitle?: string, error?: string }>}
 */
async function resolveMapOverviewImage({ mapId, mapTitle, modsRoot, modsRoots }) {
  try {
    const found = await findOverviewSourceFile({ mapId, mapTitle, modsRoot, modsRoots });
    const { sourcePath, mapSlug, sourceKind, zipHit } = found;
    if (!sourcePath) {
      return {
        ok: false,
        error: 'overview_not_found',
        hintKind: found.likelyDlc ? 'dlc' : 'mod',
        mapTitle: mapTitle || null,
        mapId: mapId || null,
        mapSlug: found.mapSlug || null,
        dlcPackages: found.dlcPackages || null,
      };
    }
    const descriptor =
      sourceKind === 'zip'
        ? { sourceKind: 'zip', zipHit, sourcePath }
        : sourcePath;
    const cached = await ensureCachedPng(descriptor, mapSlug, mapId, mapTitle);
    return {
      ok: true,
      url: `/map-overview-cache/${cached.key}.png`,
      sourcePath,
      mapSlug,
      mapTitle: mapTitle || null,
      // After v9 crop these are full-bleed; otherwise raw/clip UV for remapping / legacy clip.
      terrainInset: cached.terrainInset || { ...FULL_TERRAIN_INSET },
      clipTerrainInset: cached.clipTerrainInset || cached.terrainInset || { ...FULL_TERRAIN_INSET },
      imageCropped: !!cached.imageCropped,
      cacheVersion: OVERVIEW_CACHE_VERSION,
    };
  } catch (e) {
    return {
      ok: false,
      error: e && e.message ? e.message : String(e),
    };
  }
}

module.exports = {
  normalizeMapSlug,
  titleTokensFromMapTitle,
  distinctiveTitleTokens,
  pathMatchesMapIdentity,
  scoreZipArchiveName,
  getMapOverviewCacheDir,
  getFs25GameInstallRoots,
  getFs25PdlcRoots,
  resolveDlcPackages,
  isLikelyDlcMap,
  findOverviewInModSettingsExport,
  findOverviewInPdlcPackages,
  pdlcPackageOverviewCandidates,
  findOverviewSourceFile,
  resolveMagickExe,
  resolveMapOverviewImage,
  scoreOverviewPath,
  analyzeTerrainInsetFromPng,
  detectTerrainInsetFromPng,
  postProcessOverviewPng,
  convertDdsToPng,
  isOfficialMapUiOverviewPath,
  parseMapXmlMeta,
  OVERVIEW_CACHE_VERSION,
  MAP_DLC_PACKAGE_HINTS,
};
