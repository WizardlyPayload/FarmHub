/**
 * Fill-type index → name catalog from vanilla maps_fillTypes.xml plus the
 * active map only. Engine assignment: UNKNOWN = 1, then vanilla XML order,
 * then new names from that map XML. Never merge another map's titles, HUD
 * paths, or extra indices (Montana sitting in mods must not label Witcombe).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  findOverviewSourceFile,
  getFs25GameInstallRoots,
} = require("./mapOverviewResolver");

const FILL_TYPE_NAME_RE = /<fillType\b[^>]*\bname="([^"]+)"/gi;
const FILL_TYPES_FILENAME_RE = /<fillTypes\b[^>]*\bfilename="([^"]+)"/i;

const REFERENCE_MAPS = [
  {
    mapId: "FS25_Montana_MF.MapMontana",
    mapTitle: "Montana Map, Multifruit 4x",
    zipHints: ["montana_mf"],
  },
  {
    mapId: "FS25_Montana_4X.MapMontana",
    mapTitle: "Montana 4X",
    zipHints: ["montana_4x", "montana"],
  },
];

let vanillaCache = null;

function loadYauzl() {
  try {
    return require("yauzl");
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

function readZipEntryBuffer(zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err) return reject(err);
      const chunks = [];
      stream.on("data", (c) => chunks.push(c));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  });
}

function normalizeZipName(name) {
  return String(name || "").replace(/\\/g, "/");
}

function isBaleOrPickupFillTypesPath(name) {
  const n = normalizeZipName(name).toLowerCase();
  return /\/bales\//.test(n) || /\/pickup\//.test(n);
}

function scoreFillTypesXmlPath(name) {
  const n = normalizeZipName(name).toLowerCase();
  if (!/filltypes\.xml$/i.test(n) && !/maps_filltypes\.xml$/i.test(n)) return -1;
  if (isBaleOrPickupFillTypesPath(n)) return -1;
  let s = 10;
  if (/maps_filltypes\.xml$/i.test(n)) s += 40;
  if (/\/config\//.test(n)) s += 20;
  if (/^map\//.test(n) || /\/maps\//.test(n)) s += 10;
  return s;
}

function parseFillTypeNamesFromXml(xml) {
  const names = [];
  if (!xml) return names;
  FILL_TYPE_NAME_RE.lastIndex = 0;
  let m;
  while ((m = FILL_TYPE_NAME_RE.exec(xml))) {
    const name = String(m[1] || "")
      .trim()
      .toUpperCase();
    if (name) names.push(name);
  }
  return names;
}

function isWeakFillTypeLabel(value) {
  const t = String(value || "").trim();
  return !t || /^\d+$/.test(t) || /^\$l10n_/i.test(t);
}

function l10nKeyFromTitle(raw) {
  const t = String(raw || "").trim();
  const m = t.match(/^\$l10n_(.+)$/i);
  return m ? m[1] : "";
}

function parseFillTypeRecordsFromXml(xml) {
  const records = [];
  if (!xml) return records;
  const blockRe = /<fillType\b([^>]*)>([\s\S]*?)<\/fillType>/gi;
  let m;
  while ((m = blockRe.exec(xml))) {
    const attrs = m[1] || "";
    const body = m[2] || "";
    const nameM = /\bname\s*=\s*"([^"]+)"/i.exec(attrs);
    if (!nameM) continue;
    const name = String(nameM[1] || "")
      .trim()
      .toUpperCase();
    if (!name) continue;
    const titleM = /\btitle\s*=\s*"([^"]+)"/i.exec(attrs);
    const hudM = /<image\b[^>]*\bhud\s*=\s*"([^"]+)"/i.exec(body);
    records.push({
      name,
      titleRaw: titleM ? String(titleM[1] || "").trim() : "",
      hud: hudM ? String(hudM[1] || "").trim() : "",
    });
  }
  return records;
}

function parseFillTypeL10n(xml) {
  const out = {};
  if (!xml) return out;
  const add = (key, val) => {
    const k = String(key || "").trim();
    const v = String(val || "").trim();
    if (!k || !v || !/^fillType_/i.test(k)) return;
    out[k] = v;
  };
  const eRe = /<e\b[^>]*\bk="([^"]+)"[^>]*\bv="([^"]*)"/gi;
  let m;
  while ((m = eRe.exec(xml))) add(m[1], m[2]);
  const textRe = /<text\b([^>]*)\/?>/gi;
  while ((m = textRe.exec(xml))) {
    const attrs = m[1] || "";
    const nameM = /\bname\s*=\s*"([^"]+)"/i.exec(attrs);
    const valM = /\btext\s*=\s*"([^"]*)"/i.exec(attrs);
    if (nameM && valM) add(nameM[1], valM[1]);
  }
  return out;
}

function resolveFillTypeTitle(titleRaw, l10nMaps) {
  const raw = String(titleRaw || "").trim();
  if (!raw) return "";
  const key = l10nKeyFromTitle(raw);
  if (key) {
    for (const map of l10nMaps || []) {
      if (map && map[key]) return String(map[key]).trim();
    }
    return "";
  }
  return isWeakFillTypeLabel(raw) ? "" : raw;
}

function recordsToTitlesAndHud(records, l10nMaps, zipPath) {
  const titlesByName = {};
  const hudByName = {};
  for (const rec of records || []) {
    if (!rec || !rec.name) continue;
    const title = resolveFillTypeTitle(rec.titleRaw, l10nMaps);
    if (title) titlesByName[rec.name] = title;
    if (rec.hud) {
      hudByName[rec.name] = zipPath
        ? { kind: "zip", zipPath, entry: rec.hud }
        : { kind: "file", path: rec.hud };
    }
  }
  return { titlesByName, hudByName };
}

function mergeNamedMaps(...maps) {
  const out = {};
  for (const src of maps) {
    if (!src || typeof src !== "object") continue;
    for (const [key, val] of Object.entries(src)) {
      if (val == null || val === "") continue;
      out[key] = val;
    }
  }
  return out;
}

function titlesByIndexFromCatalog(catalog, titlesByName) {
  const out = {};
  for (const [idx, name] of Object.entries(catalog || {})) {
    const key = String(name || "")
      .trim()
      .toUpperCase();
    const title = titlesByName[key];
    if (title) out[String(idx)] = title;
  }
  return out;
}

function isL10nEnXmlPath(name) {
  const n = normalizeZipName(name).toLowerCase();
  if (/__macosx/.test(n)) return false;
  return /(^|\/)l10n_en\.xml$/i.test(n);
}

function vanillaL10nEnPath() {
  const extract = path.join(
    os.homedir(),
    "Documents",
    "FS25 Game Files",
    "extract",
    "dataS",
    "l10n",
    "l10n_en.xml"
  );
  try {
    if (fs.existsSync(extract)) return extract;
  } catch {
    /* ignore */
  }
  for (const root of getFs25GameInstallRoots()) {
    const p = path.join(root, "dataS", "l10n", "l10n_en.xml");
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function getVanillaFillTypeL10n() {
  if (vanillaCache && vanillaCache.l10n) return vanillaCache.l10n;
  const xmlPath = vanillaL10nEnPath();
  let l10n = {};
  if (xmlPath) {
    try {
      l10n = parseFillTypeL10n(fs.readFileSync(xmlPath, "utf8"));
    } catch {
      l10n = {};
    }
  }
  if (!vanillaCache) vanillaCache = { names: [] };
  vanillaCache.l10n = l10n;
  return l10n;
}

function getVanillaFillTypeRecords() {
  if (vanillaCache && vanillaCache.records) return vanillaCache.records;
  const xmlPath = vanillaFillTypesXmlPath();
  let records = [];
  if (xmlPath) {
    try {
      records = parseFillTypeRecordsFromXml(fs.readFileSync(xmlPath, "utf8"));
    } catch {
      records = [];
    }
  }
  if (!vanillaCache) vanillaCache = { names: [] };
  vanillaCache.records = records;
  return records;
}

function parseFillTypesFilenameFromMapXml(xml) {
  if (!xml) return null;
  const m = FILL_TYPES_FILENAME_RE.exec(xml);
  return m ? String(m[1] || "").replace(/\\/g, "/") : null;
}

function buildFillTypeIndexCatalog(vanillaNames, mapNames) {
  const indexToName = { 1: "UNKNOWN" };
  const nameToIndex = { UNKNOWN: 1 };
  let next = 2;
  const add = (raw) => {
    const name = String(raw || "")
      .trim()
      .toUpperCase();
    if (!name || nameToIndex[name]) return;
    indexToName[String(next)] = name;
    nameToIndex[name] = next;
    next += 1;
  };
  for (const name of vanillaNames || []) add(name);
  for (const name of mapNames || []) add(name);
  return { catalog: indexToName, nameToIndex };
}

function fillCatalogGaps(catalog, mapCatalog) {
  const out = { ...(catalog || {}) };
  for (const [key, val] of Object.entries(mapCatalog || {})) {
    const name = String(val || "").trim();
    if (!name || /^\d+$/.test(name)) continue;
    const cur = out[key];
    if (cur == null || String(cur).trim() === "" || /^\d+$/.test(String(cur).trim())) {
      out[String(key)] = name;
    }
  }
  return out;
}

function vanillaFillTypesXmlPath() {
  for (const root of getFs25GameInstallRoots()) {
    const p = path.join(root, "data", "maps", "maps_fillTypes.xml");
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function getVanillaFillTypeNames() {
  if (vanillaCache && Array.isArray(vanillaCache.names)) return vanillaCache.names;
  const xmlPath = vanillaFillTypesXmlPath();
  let names = [];
  if (xmlPath) {
    try {
      names = parseFillTypeNamesFromXml(fs.readFileSync(xmlPath, "utf8"));
    } catch {
      names = [];
    }
  }
  vanillaCache = { ...(vanillaCache || {}), names };
  return vanillaCache.names;
}

function getVanillaFillTypeCatalog() {
  return buildFillTypeIndexCatalog(getVanillaFillTypeNames(), []).catalog;
}

async function readMatchingZipTexts(zipPath, wantFn) {
  const yauzl = loadYauzl();
  if (!yauzl || !zipPath) return {};
  const zipfile = await openZip(yauzl, zipPath);
  const found = {};
  await new Promise((resolve, reject) => {
    let pending = 0;
    let listingDone = false;
    const finishIfIdle = () => {
      if (!listingDone || pending !== 0) return;
      try {
        zipfile.close();
      } catch {
        /* ignore */
      }
      resolve();
    };
    zipfile.on("entry", (entry) => {
      const name = normalizeZipName(entry.fileName);
      if (!wantFn(name)) {
        zipfile.readEntry();
        return;
      }
      pending += 1;
      readZipEntryBuffer(zipfile, entry)
        .then((buf) => {
          found[name] = buf.toString("utf8");
          pending -= 1;
          zipfile.readEntry();
          finishIfIdle();
        })
        .catch(reject);
    });
    zipfile.on("end", () => {
      listingDone = true;
      finishIfIdle();
    });
    zipfile.on("error", reject);
    zipfile.readEntry();
  });
  return found;
}

function pickFillTypesXmlFromZipFiles(files) {
  const names = Object.keys(files);
  let mapXmlName = names.find((n) => /(^|\/)map\.xml$/i.test(n)) || names.find((n) => /(^|\/)maps\.xml$/i.test(n));
  const mapXml = mapXmlName ? files[mapXmlName] : "";
  const fromMap = parseFillTypesFilenameFromMapXml(mapXml);
  if (fromMap) {
    const dir = mapXmlName ? path.posix.dirname(normalizeZipName(mapXmlName)) : "";
    const resolved = normalizeZipName(fromMap).replace(/^\.\//, "");
    const candidates = [resolved, dir && dir !== "." ? `${dir}/${resolved}` : resolved];
    for (const c of candidates) {
      if (files[c]) return files[c];
      const hit = names.find((n) => n.toLowerCase().endsWith(String(c).toLowerCase()));
      if (hit) return files[hit];
    }
  }
  let best = null;
  let bestScore = -1;
  for (const name of names) {
    const sc = scoreFillTypesXmlPath(name);
    if (sc > bestScore) {
      bestScore = sc;
      best = name;
    }
  }
  return best && bestScore > 0 ? files[best] : "";
}

async function loadFillTypeBundleFromZip(zipPath) {
  const files = await readMatchingZipTexts(zipPath, (name) => {
    const n = name.toLowerCase();
    if (/(^|\/)map\.xml$/.test(n) || /(^|\/)maps\.xml$/.test(n)) return true;
    if (isL10nEnXmlPath(name)) return true;
    return scoreFillTypesXmlPath(name) > 0;
  });
  const xml = pickFillTypesXmlFromZipFiles(files);
  const names = parseFillTypeNamesFromXml(xml);
  const l10nMaps = [];
  const records = [];
  for (const [fileName, text] of Object.entries(files)) {
    if (isL10nEnXmlPath(fileName)) l10nMaps.push(parseFillTypeL10n(text));
    if (scoreFillTypesXmlPath(fileName) > 0) {
      records.push(...parseFillTypeRecordsFromXml(text));
    }
  }
  const meta = recordsToTitlesAndHud(records, l10nMaps, zipPath);
  return {
    names,
    titlesByName: meta.titlesByName,
    hudByName: meta.hudByName,
    zipPath,
  };
}

async function loadFillTypeNamesFromZip(zipPath) {
  const bundle = await loadFillTypeBundleFromZip(zipPath);
  return bundle.names;
}

async function loadFillTypeNamesFromFolder(startPath) {
  let dir = path.dirname(startPath);
  for (let depth = 0; depth < 8; depth++) {
    let names = [];
    try {
      names = await fs.promises.readdir(dir);
    } catch {
      break;
    }
    const mapXmlName = names.find((n) => /^map\.xml$/i.test(n) || /^maps\.xml$/i.test(n));
    const fillXmlName = names
      .filter((n) => /filltypes\.xml$/i.test(n) && !isBaleOrPickupFillTypesPath(path.join(dir, n)))
      .sort((a, b) => scoreFillTypesXmlPath(b) - scoreFillTypesXmlPath(a))[0];
    let fillXml = "";
    if (mapXmlName) {
      try {
        const mapXml = await fs.promises.readFile(path.join(dir, mapXmlName), "utf8");
        const fn = parseFillTypesFilenameFromMapXml(mapXml);
        if (fn) {
          const resolved = path.normalize(path.join(dir, fn));
          if (fs.existsSync(resolved)) {
            fillXml = await fs.promises.readFile(resolved, "utf8");
          }
        }
      } catch {
        /* ignore */
      }
    }
    if (!fillXml && fillXmlName) {
      try {
        fillXml = await fs.promises.readFile(path.join(dir, fillXmlName), "utf8");
      } catch {
        /* ignore */
      }
    }
    if (fillXml) return parseFillTypeNamesFromXml(fillXml);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return [];
}

function emptyFillTypeBundle() {
  return { names: [], titlesByName: {}, hudByName: {}, zipPath: null };
}

/** Map zip names to search when the overview texture lives outside the archive. */
function zipHintsFromMapIdentity(mapId, mapTitle) {
  const hints = [];
  const slug = String(mapId || "").toLowerCase();
  const title = String(mapTitle || "").toLowerCase();
  if (slug.includes("montana_mf") || (title.includes("montana") && title.includes("multi"))) {
    hints.push("montana_mf");
  }
  if (slug.includes("montana_4x")) hints.push("montana_4x");
  if (slug.includes("montana") || title.includes("montana")) hints.push("montana");
  if (slug.includes("witcombe") || title.includes("witcombe")) hints.push("witcombe");
  return hints;
}

/** Overview.dds in modSettings is not a fill-type source — HUD pictures live in the map zip. */
function zipPathFromOverviewHit(found) {
  if (found?.sourceKind === "zip" && found.zipHit?.zipPath) return found.zipHit.zipPath;
  if (found?.sourcePath && String(found.sourcePath).includes("::")) {
    const zipPath = String(found.sourcePath).split("::")[0];
    return zipPath || null;
  }
  return null;
}

async function loadFillTypeBundleFromFolder(startPath) {
  let dir = path.dirname(startPath);
  for (let depth = 0; depth < 8; depth++) {
    let names = [];
    try {
      names = await fs.promises.readdir(dir);
    } catch {
      break;
    }
    const mapXmlName = names.find((n) => /^map\.xml$/i.test(n) || /^maps\.xml$/i.test(n));
    const fillXmlName = names
      .filter((n) => /filltypes\.xml$/i.test(n) && !isBaleOrPickupFillTypesPath(path.join(dir, n)))
      .sort((a, b) => scoreFillTypesXmlPath(b) - scoreFillTypesXmlPath(a))[0];
    let fillXml = "";
    if (mapXmlName) {
      try {
        const mapXml = await fs.promises.readFile(path.join(dir, mapXmlName), "utf8");
        const fn = parseFillTypesFilenameFromMapXml(mapXml);
        if (fn) {
          const resolved = path.normalize(path.join(dir, fn));
          if (fs.existsSync(resolved)) {
            fillXml = await fs.promises.readFile(resolved, "utf8");
          }
        }
      } catch {
        /* ignore */
      }
    }
    if (!fillXml && fillXmlName) {
      try {
        fillXml = await fs.promises.readFile(path.join(dir, fillXmlName), "utf8");
      } catch {
        /* ignore */
      }
    }
    if (fillXml) {
      let l10n = {};
      const l10nPath = path.join(dir, "l10n_en.xml");
      try {
        if (fs.existsSync(l10nPath)) {
          l10n = parseFillTypeL10n(fs.readFileSync(l10nPath, "utf8"));
        }
      } catch {
        l10n = {};
      }
      const records = parseFillTypeRecordsFromXml(fillXml);
      const meta = recordsToTitlesAndHud(records, [l10n], null);
      const hudByName = {};
      for (const [name, src] of Object.entries(meta.hudByName || {})) {
        const raw = src && src.path;
        if (!raw) continue;
        const stripped = String(raw)
          .replace(/\\/g, "/")
          .replace(/^\$moddir\$[^/]+\/?/i, "");
        const abs = path.isAbsolute(stripped)
          ? stripped
          : path.normalize(path.join(dir, stripped.replace(/\//g, path.sep)));
        hudByName[name] = fs.existsSync(abs) ? { kind: "file", path: abs } : src;
      }
      return {
        names: parseFillTypeNamesFromXml(fillXml),
        titlesByName: meta.titlesByName,
        hudByName,
        zipPath: null,
      };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return emptyFillTypeBundle();
}

async function loadMapFillTypeBundle({ mapId, mapTitle, modsRoot, modsRoots }) {
  const roots = [];
  if (Array.isArray(modsRoots)) roots.push(...modsRoots);
  if (modsRoot) roots.push(modsRoot);
  const fromZip = async (zipPath) => {
    if (!zipPath) return emptyFillTypeBundle();
    try {
      return await loadFillTypeBundleFromZip(zipPath);
    } catch {
      return emptyFillTypeBundle();
    }
  };
  let found = null;
  try {
    found = await findOverviewSourceFile({ mapId, mapTitle, modsRoot, modsRoots: roots });
  } catch {
    found = null;
  }
  const fromOverview = zipPathFromOverviewHit(found);
  if (fromOverview) return fromZip(fromOverview);
  // Fleet-map copies overview.dds into modSettings. That file has no HUD overlays —
  // keep scanning the actual map zip in the mods folder for fill-type pictures.
  const hinted = await findZipByHints(roots, zipHintsFromMapIdentity(mapId, mapTitle));
  if (hinted) return fromZip(hinted);
  if (found?.sourceKind === "file" && found.sourceOrigin !== "modSettings" && found.sourcePath) {
    return loadFillTypeBundleFromFolder(found.sourcePath);
  }
  return emptyFillTypeBundle();
}

async function loadMapFillTypeNames(args) {
  const bundle = await loadMapFillTypeBundle(args);
  return bundle.names;
}

async function loadMontanaFillTypeBundle(modsRoots) {
  let best = emptyFillTypeBundle();
  for (const ref of REFERENCE_MAPS) {
    let bundle = emptyFillTypeBundle();
    try {
      bundle = await loadMapFillTypeBundle({
        mapId: ref.mapId,
        mapTitle: ref.mapTitle,
        modsRoots,
      });
    } catch {
      bundle = emptyFillTypeBundle();
    }
    if (bundle.names.length === 0) {
      const zip = await findZipByHints(modsRoots, ref.zipHints);
      if (zip) bundle = await loadFillTypeBundleFromZip(zip).catch(() => emptyFillTypeBundle());
    }
    if (bundle.names.length > best.names.length) best = bundle;
  }
  return best;
}

async function loadMontanaFillTypeNames(modsRoots) {
  const bundle = await loadMontanaFillTypeBundle(modsRoots);
  return bundle.names;
}

function isMontanaIdentity(mapId, mapTitle) {
  const blob = `${mapId || ""} ${mapTitle || ""}`.toLowerCase();
  return blob.includes("montana");
}

async function findZipByHints(modsRoots, hints) {
  const want = (hints || []).map((h) => String(h).toLowerCase()).filter(Boolean);
  if (want.length === 0) return null;
  for (const root of modsRoots || []) {
    let entries = [];
    try {
      entries = await fs.promises.readdir(root);
    } catch {
      continue;
    }
    let best = null;
    let bestScore = -1;
    for (const name of entries) {
      if (!/\.zip$/i.test(name)) continue;
      const low = name.toLowerCase();
      let score = -1;
      for (let i = 0; i < want.length; i++) {
        if (low.includes(want[i])) score = Math.max(score, 100 - i * 10);
      }
      if (score > bestScore) {
        bestScore = score;
        best = path.join(root, name);
      }
    }
    if (best) return best;
  }
  return null;
}

function pickActiveMapFillTypeNames(mapNames, montanaNames, montanaActive) {
  if (montanaActive) {
    if (!mapNames.length) return montanaNames;
    if (!montanaNames.length) return mapNames;
    return mapNames;
  }
  return mapNames;
}

/**
 * Resolve index → name for the active save. Vanilla indices always apply.
 * Extra indices, titles, and HUD paths come only from that map's zip.
 * Montana Multifruit is read only when the save identity is Montana (including
 * Montana 4X falling back to the MF zip when that is the installed map pack).
 * Witcombe 190 stays LINSEED even if Montana is also in mods.
 */
async function resolveMapFillTypeCatalog({ mapId, mapTitle, modsRoot, modsRoots }) {
  const vanillaNames = getVanillaFillTypeNames();
  const roots = modsRoots || (modsRoot ? [modsRoot] : []);
  const montanaActive = isMontanaIdentity(mapId, mapTitle);
  let mapBundle = await loadMapFillTypeBundle({ mapId, mapTitle, modsRoot, modsRoots: roots });
  if (montanaActive && mapBundle.names.length === 0) {
    mapBundle = await loadMontanaFillTypeBundle(roots);
  }
  const extras = mapBundle.names;
  const built = buildFillTypeIndexCatalog(vanillaNames, extras);
  const vanillaMeta = recordsToTitlesAndHud(
    getVanillaFillTypeRecords(),
    [getVanillaFillTypeL10n()],
    null
  );
  const titlesByName = mergeNamedMaps(vanillaMeta.titlesByName, mapBundle.titlesByName);
  const hudByName = mergeNamedMaps(vanillaMeta.hudByName, mapBundle.hudByName);
  return {
    catalog: built.catalog,
    nameToIndex: built.nameToIndex,
    titlesByIndex: titlesByIndexFromCatalog(built.catalog, titlesByName),
    titlesByName,
    hudByName,
    vanillaCount: vanillaNames.length,
    mapCount: mapBundle.names.length,
    montanaCount: montanaActive ? mapBundle.names.length : 0,
    extraCount: extras.length,
    montanaActive,
  };
}

module.exports = {
  parseFillTypeNamesFromXml,
  parseFillTypeRecordsFromXml,
  parseFillTypeL10n,
  resolveFillTypeTitle,
  isWeakFillTypeLabel,
  buildFillTypeIndexCatalog,
  fillCatalogGaps,
  getVanillaFillTypeNames,
  getVanillaFillTypeCatalog,
  loadFillTypeNamesFromZip,
  loadFillTypeBundleFromZip,
  loadMapFillTypeNames,
  loadMapFillTypeBundle,
  loadMontanaFillTypeNames,
  pickActiveMapFillTypeNames,
  resolveMapFillTypeCatalog,
  zipHintsFromMapIdentity,
  zipPathFromOverviewHit,
  REFERENCE_MAPS,
};
