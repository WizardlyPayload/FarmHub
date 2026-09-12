/**
 * Convert fill-type HUD overlays (DDS/PNG) into a web PNG cache.
 * Sources: map zip entries, vanilla extract/game files, Lua copy in modSettings.
 *
 * Prefetch walks each map zip once. Per-icon zip opens of a multi-GB map archive
 * time out in the Storage UI and then never retry.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { convertDdsToPng, getFs25GameInstallRoots } = require("./mapOverviewResolver");
const { collectFarmDashboardModSettingsRoots } = require("./fs25Paths");

const inflightByZip = new Map();
const inflightByCacheName = new Map();
let inflightDiskPrefetch = null;

function loadYauzl() {
  try {
    return require("yauzl");
  } catch {
    return null;
  }
}

function getFillTypeHudCacheDir() {
  const envDir = String(process.env.FARMDASH_FILL_TYPE_HUD_CACHE || "").trim();
  if (envDir) return envDir;
  try {
    const { app } = require("electron");
    if (app && typeof app.getPath === "function") {
      return path.join(app.getPath("userData"), "fill_type_hud");
    }
  } catch {
    /* not Electron */
  }
  return path.join(
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
    "fs25-farm-dashboard",
    "fill_type_hud"
  );
}

function fillTypeNameAliases(name) {
  const n = String(name || "")
    .trim()
    .toUpperCase()
    .replace(/\.PNG$/i, "");
  if (!n) return [];
  const out = [n];
  const stripped = n.replace(/_?\d+$/, "");
  if (stripped && stripped !== n) out.push(stripped);
  const compact = n.replace(/_/g, "");
  if (compact && compact !== n) out.push(compact);
  if (n === "SOYBEANS" || stripped === "SOYBEANS") out.push("SOYBEAN");
  if (n === "SOYBEAN" || stripped === "SOYBEAN") out.push("SOYBEANS");
  if (n === "MAIZE" || stripped === "MAIZE") out.push("CORN");
  if (n === "CORN") out.push("MAIZE");
  const dry = n.replace(/_DRY$/, "");
  if (dry && dry !== n) {
    out.push(dry);
    if (dry === "CORN") out.push("MAIZE");
    if (dry === "MAIZE") out.push("CORN");
    if (dry === "SOYBEAN" || dry === "SOYBEANS") {
      out.push("SOYBEAN", "SOYBEANS");
    }
  }
  const cut = n.replace(/_CUT$/, "");
  if (cut && cut !== n) out.push(cut);
  return [...new Set(out)];
}

function gameHudRootsEnabled() {
  return String(process.env.FARMDASH_FILL_TYPE_HUD_SKIP_GAME_ROOTS || "").trim() !== "1";
}

function documentsDirCandidates() {
  const out = [];
  const push = (p) => {
    if (p && typeof p === "string") out.push(p);
  };
  try {
    const { app } = require("electron");
    if (app && typeof app.getPath === "function") {
      push(app.getPath("documents"));
    }
  } catch {
    /* not Electron */
  }
  push(path.join(os.homedir(), "Documents"));
  if (process.env.USERPROFILE) {
    push(path.join(process.env.USERPROFILE, "Documents"));
    push(path.join(process.env.USERPROFILE, "OneDrive", "Documents"));
  }
  push(path.join(os.homedir(), "OneDrive", "Documents"));
  const envExtract = String(process.env.FS25_EXTRACT_ROOT || "").trim();
  if (envExtract) push(envExtract);
  return [...new Set(out.map((p) => path.normalize(p)))];
}

function extractHudRoots() {
  const roots = [];
  const push = (p) => {
    try {
      if (p && fs.existsSync(p)) roots.push(path.normalize(p));
    } catch {
      /* ignore */
    }
  };
  const rel = path.join("FS25 Game Files", "extract", "dataS", "menu", "hud", "fillTypes");
  for (const docs of documentsDirCandidates()) {
    push(path.join(docs, rel));
    // Env may already point at extract/ or fillTypes/
    push(path.join(docs, "dataS", "menu", "hud", "fillTypes"));
  }
  const envExtract = String(process.env.FS25_EXTRACT_ROOT || "").trim();
  if (envExtract) {
    push(envExtract);
    push(path.join(envExtract, "dataS", "menu", "hud", "fillTypes"));
    push(path.join(envExtract, "menu", "hud", "fillTypes"));
  }
  for (const root of getFs25GameInstallRoots()) {
    push(path.join(root, "dataS", "menu", "hud", "fillTypes"));
  }
  return [...new Set(roots)];
}

function luaHudRoots() {
  const roots = [];
  for (const base of collectFarmDashboardModSettingsRoots()) {
    roots.push(path.join(base, "fillTypeHud"));
  }
  return roots;
}

function hudBasename(hudPath) {
  const raw = String(hudPath || "").replace(/\\/g, "/");
  const stripped = raw
    .replace(/^\$moddir\$[^/]+\/?/i, "")
    .replace(/^\$dataS\//i, "")
    .replace(/^\$data\//i, "");
  return stripped.split("/").pop() || "";
}

function fillTypeNameFromHudFile(fileName) {
  const base = hudBasename(fileName).replace(/\.(png|dds)$/i, "");
  if (!base) return "";
  const m = base.match(/^hud_fill_(.+)$/i);
  if (m) return String(m[1] || "").toUpperCase();
  if (/^[A-Z0-9_]+$/i.test(base) && !/^hud_/i.test(base)) return base.toUpperCase();
  return "";
}

function underscoredToCamel(stem) {
  return String(stem || "")
    .toLowerCase()
    .replace(/_([a-z0-9])/g, (_, c) => String(c).toUpperCase());
}

function candidateBasenames(name, hudPath) {
  const out = [];
  const base = hudBasename(hudPath);
  if (base) {
    out.push(base);
    out.push(base.replace(/\.png$/i, ".dds"));
    out.push(base.replace(/\.dds$/i, ".png"));
  }
  const raw = String(name || "").trim();
  if (raw) {
    const lower = raw.toLowerCase();
    const compact = lower.replace(/_/g, "");
    const camel = underscoredToCamel(raw);
    for (const stem of [lower, compact, camel, raw]) {
      if (!stem) continue;
      out.push(`hud_fill_${stem}.dds`);
      out.push(`hud_fill_${stem}.png`);
    }
  }
  return [...new Set(out.filter(Boolean))];
}

function findFileCaseInsensitive(dir, basename) {
  try {
    const want = String(basename || "").toLowerCase();
    const names = fs.readdirSync(dir);
    const hit = names.find((n) => n.toLowerCase() === want);
    return hit ? path.join(dir, hit) : null;
  } catch {
    return null;
  }
}

function findOnDiskHud(name, hudPath) {
  const bases = candidateBasenames(name, hudPath);
  const roots = gameHudRootsEnabled() ? [...extractHudRoots(), ...luaHudRoots()] : [];
  for (const dir of roots) {
    for (const base of bases) {
      const hit = findFileCaseInsensitive(dir, base);
      if (hit) return hit;
    }
    const exact = findFileCaseInsensitive(dir, `${String(name || "").toUpperCase()}.dds`);
    if (exact) return exact;
    const exactPng = findFileCaseInsensitive(dir, `${String(name || "").toUpperCase()}.png`);
    if (exactPng) return exactPng;
  }
  return null;
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

function isLikelyHudEntry(fileName) {
  const low = String(fileName || "").replace(/\\/g, "/").toLowerCase();
  if (!low || /__macosx/.test(low) || low.endsWith("/")) return false;
  const base = low.split("/").pop() || "";
  if (!/\.(png|dds)$/.test(base)) return false;
  if (base.startsWith("hud_fill_")) return true;
  if (/\/huds\/hud_fill_/.test(low)) return true;
  return false;
}

function uniqueZipPaths(hudByName) {
  const out = [];
  const seen = new Set();
  for (const src of Object.values(hudByName || {})) {
    const zipPath = src && src.kind === "zip" ? src.zipPath : "";
    if (!zipPath || seen.has(zipPath)) continue;
    seen.add(zipPath);
    out.push(zipPath);
  }
  return out;
}

function indexHudByName(hudByName) {
  const byBase = {};
  for (const [name, src] of Object.entries(hudByName || {})) {
    const hint = (src && (src.entry || src.path)) || "";
    const base = hudBasename(hint).toLowerCase();
    if (!base) continue;
    byBase[base] = name;
    if (base.endsWith(".png")) byBase[base.replace(/\.png$/i, ".dds")] = name;
    else if (base.endsWith(".dds")) byBase[base.replace(/\.dds$/i, ".png")] = name;
  }
  return byBase;
}

async function extractHudFromZip(zipPath, entryHint, name) {
  const yauzl = loadYauzl();
  if (!yauzl || !zipPath) return null;
  const want = [
    String(entryHint || "")
      .replace(/\\/g, "/")
      .replace(/^\$moddir\$[^/]+\/?/i, "")
      .replace(/^\$dataS\//i, ""),
    hudBasename(entryHint),
    ...candidateBasenames(name, entryHint),
  ]
    .map((s) => String(s || "").toLowerCase())
    .filter(Boolean);
  const zipfile = await openZip(yauzl, zipPath);
  try {
    return await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (buf) => {
        if (settled) return;
        settled = true;
        resolve(buf);
      };
      zipfile.on("entry", (entry) => {
        if (settled) return;
        const n = String(entry.fileName || "").replace(/\\/g, "/");
        const low = n.toLowerCase();
        if (!isLikelyHudEntry(n)) {
          zipfile.readEntry();
          return;
        }
        const base = n.split("/").pop().toLowerCase();
        if (want.includes(low) || want.includes(base)) {
          readZipEntryBuffer(zipfile, entry)
            .then((buf) => finish(buf))
            .catch(reject);
          return;
        }
        zipfile.readEntry();
      });
      zipfile.on("end", () => finish(null));
      zipfile.on("error", reject);
      zipfile.readEntry();
    });
  } finally {
    try {
      zipfile.close();
    } catch {
      /* ignore */
    }
  }
}

function cachePngPath(name) {
  const safe = String(name || "unknown")
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .slice(0, 80);
  return path.join(getFillTypeHudCacheDir(), `${safe}.png`);
}

function bufferLooksLikePng(buf) {
  return (
    Buffer.isBuffer(buf) &&
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  );
}

function bufferLooksLikeDds(buf) {
  return (
    Buffer.isBuffer(buf) &&
    buf.length >= 4 &&
    buf[0] === 0x44 &&
    buf[1] === 0x44 &&
    buf[2] === 0x53 &&
    buf[3] === 0x20
  );
}

function fileLooksLikePng(filePath) {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(8);
    const n = fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);
    return n >= 8 && bufferLooksLikePng(buf);
  } catch {
    return false;
  }
}

function hudStagingPath(destPng) {
  return `${destPng}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
}

async function commitHudPng(tmpPng, destPng) {
  if (!fileLooksLikePng(tmpPng)) {
    await fs.promises.unlink(tmpPng).catch(() => {});
    throw new Error("hud cache write is not a PNG");
  }
  await fs.promises.rename(tmpPng, destPng);
}

async function writeHudPngFromBuffer(buf, destPng) {
  await fs.promises.mkdir(path.dirname(destPng), { recursive: true });
  const staged = hudStagingPath(destPng);
  if (bufferLooksLikePng(buf)) {
    await fs.promises.writeFile(staged, buf);
    await commitHudPng(staged, destPng);
    return;
  }
  const ddsTmp = path.join(os.tmpdir(), `fd_hud_${crypto.randomBytes(6).toString("hex")}.dds`);
  await fs.promises.writeFile(ddsTmp, buf);
  try {
    await convertDdsToPng(ddsTmp, staged);
    await commitHudPng(staged, destPng);
  } finally {
    await fs.promises.unlink(ddsTmp).catch(() => {});
    await fs.promises.unlink(staged).catch(() => {});
  }
}

async function materializeHudFile(sourcePath, destPng) {
  const buf = await fs.promises.readFile(sourcePath);
  await writeHudPngFromBuffer(buf, destPng);
}

async function materializeHudBuffer(buf, hintName, destPng) {
  void hintName;
  await writeHudPngFromBuffer(buf, destPng);
}

function lookupHudSourceExact(name, hudByName) {
  const alias = String(name || "")
    .trim()
    .toUpperCase()
    .replace(/\.PNG$/i, "");
  if (hudByName && hudByName[alias]) return { alias, source: hudByName[alias] };
  return { alias, source: null };
}

function lookupHudSource(name, hudByName) {
  for (const alias of fillTypeNameAliases(name)) {
    const hit = lookupHudSourceExact(alias, hudByName);
    if (hit.source) return hit;
  }
  return lookupHudSourceExact(name, hudByName);
}

async function runPool(items, limit, worker) {
  if (!items.length) return;
  let idx = 0;
  const n = Math.min(Math.max(1, limit), items.length);
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (idx < items.length) {
        const item = items[idx++];
        await worker(item);
      }
    })
  );
}

async function prefetchFromDisk(hudByName) {
  const byBase = indexHudByName(hudByName);
  await fs.promises.mkdir(getFillTypeHudCacheDir(), { recursive: true });
  const jobs = [];
  const seenDest = new Set();

  const queueFile = (name, sourcePath) => {
    if (!name || !sourcePath) return;
    const dest = cachePngPath(name);
    if (seenDest.has(dest)) return;
    seenDest.add(dest);
    try {
      if (fileLooksLikePng(dest)) return;
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
    } catch {
      /* rebuild */
    }
    jobs.push({ name, sourcePath, dest });
  };

  const diskRoots = gameHudRootsEnabled() ? [...extractHudRoots(), ...luaHudRoots()] : [];
  for (const dir of diskRoots) {
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const file of names) {
      if (!/\.(png|dds)$/i.test(file)) continue;
      const name = byBase[file.toLowerCase()] || fillTypeNameFromHudFile(file);
      if (!name) continue;
      queueFile(name, path.join(dir, file));
    }
  }

  for (const [name, src] of Object.entries(hudByName || {})) {
    if (!src || src.kind === "zip") continue;
    const dest = cachePngPath(name);
    try {
      if (fileLooksLikePng(dest)) continue;
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
    } catch {
      /* continue */
    }
    const hinted = src.path && fs.existsSync(src.path) ? src.path : null;
    const disk = hinted || findOnDiskHud(name, src.path || src.entry);
    if (disk) queueFile(name, disk);
  }

  let wrote = 0;
  await runPool(jobs, 4, async (job) => {
    try {
      if (fs.existsSync(job.dest)) return;
      await materializeHudFile(job.sourcePath, job.dest);
      if (fs.existsSync(job.dest)) wrote += 1;
    } catch (e) {
      console.warn("[fill-type-hud] disk", job.name, e && e.message ? e.message : e);
    }
  });
  return wrote;
}

async function prefetchOneZip(zipPath, hudByName) {
  const yauzl = loadYauzl();
  if (!yauzl || !zipPath) return 0;
  try {
    if (!fs.existsSync(zipPath)) return 0;
  } catch {
    return 0;
  }
  const byBase = indexHudByName(hudByName);
  await fs.promises.mkdir(getFillTypeHudCacheDir(), { recursive: true });
  const zipfile = await openZip(yauzl, zipPath);
  let wrote = 0;
  try {
    await new Promise((resolve, reject) => {
      zipfile.on("error", reject);
      zipfile.on("end", resolve);
      zipfile.on("entry", (entry) => {
        Promise.resolve()
          .then(async () => {
            const n = String(entry.fileName || "").replace(/\\/g, "/");
            if (!isLikelyHudEntry(n)) return;
            const base = (n.split("/").pop() || "").toLowerCase();
            const name = byBase[base] || fillTypeNameFromHudFile(n);
            if (!name) return;
            const dest = cachePngPath(name);
            try {
              if (fileLooksLikePng(dest)) return;
            } catch {
              /* extract */
            }
            const buf = await readZipEntryBuffer(zipfile, entry);
            if (!buf || buf.length < 32) return;
            await materializeHudBuffer(buf, n, dest);
            try {
              if (fs.existsSync(dest)) wrote += 1;
            } catch {
              /* ignore */
            }
          })
          .then(() => zipfile.readEntry())
          .catch(reject);
      });
      zipfile.readEntry();
    });
  } finally {
    try {
      zipfile.close();
    } catch {
      /* ignore */
    }
  }
  return wrote;
}

function prefetchFillTypeHudCache(hudByName) {
  if (!inflightDiskPrefetch) {
    inflightDiskPrefetch = prefetchFromDisk({}).catch((e) => {
      console.warn("[fill-type-hud] disk prefetch", e && e.message ? e.message : e);
      return 0;
    });
  }
  const jobs = [inflightDiskPrefetch];
  if (hudByName && Object.keys(hudByName).length > 0) {
    jobs.push(
      prefetchFromDisk(hudByName).catch((e) => {
        console.warn("[fill-type-hud] named disk prefetch", e && e.message ? e.message : e);
        return 0;
      })
    );
  }
  for (const zipPath of uniqueZipPaths(hudByName)) {
    if (!inflightByZip.has(zipPath)) {
      const p = prefetchOneZip(zipPath, hudByName).catch((e) => {
        console.warn("[fill-type-hud] zip", path.basename(zipPath), e && e.message ? e.message : e);
        return 0;
      });
      inflightByZip.set(zipPath, p);
    }
    jobs.push(inflightByZip.get(zipPath));
  }
  return Promise.all(jobs).then((parts) => {
    const wrote = parts.reduce((sum, n) => sum + (Number(n) || 0), 0);
    console.log("[fill-type-hud] prefetch complete", wrote);
    return wrote;
  });
}

async function waitForHudPrefetch(hudByName) {
  const waits = uniqueZipPaths(hudByName)
    .map((zipPath) => inflightByZip.get(zipPath))
    .filter(Boolean);
  if (inflightDiskPrefetch) waits.push(inflightDiskPrefetch);
  if (!waits.length) return;
  await Promise.all(waits.map((p) => Promise.resolve(p).catch(() => 0)));
}

async function materializeFileOrDisk(source, alias, dest) {
  const hinted = source && (source.path || source.entry);
  const resolvedHint =
    hinted && !/^\$/.test(String(hinted)) && source && source.kind === "file" && hinted && fs.existsSync(hinted)
      ? hinted
      : null;
  if (resolvedHint) {
    await materializeHudFile(resolvedHint, dest);
    if (fileLooksLikePng(dest)) return true;
  }
  const disk = findOnDiskHud(alias, hinted);
  if (disk) {
    await materializeHudFile(disk, dest);
    if (fileLooksLikePng(dest)) return true;
  }
  return false;
}

async function materializeZipSource(source, alias, dest) {
  if (!source || source.kind !== "zip" || !source.zipPath) return false;
  const pending = inflightByZip.get(source.zipPath);
  if (pending) await Promise.resolve(pending).catch(() => 0);
  if (fileLooksLikePng(dest)) return true;
  try {
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
  } catch {
    /* rebuild */
  }
  const buf = await extractHudFromZip(source.zipPath, source.entry, alias);
  if (buf && buf.length > 32) {
    await materializeHudBuffer(buf, source.entry || alias, dest);
    return fileLooksLikePng(dest);
  }
  return fileLooksLikePng(dest);
}

async function ensureFillTypeHudPngUncached(name, hudByName) {
  const aliases = fillTypeNameAliases(name);
  if (aliases.length === 0) return null;
  const cacheName = aliases[0];
  const dest = cachePngPath(cacheName);
  try {
    if (fileLooksLikePng(dest)) return dest;
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
  } catch {
    /* rebuild */
  }
  await fs.promises.mkdir(getFillTypeHudCacheDir(), { recursive: true });

  const exact = lookupHudSourceExact(cacheName, hudByName);
  if (await materializeFileOrDisk(exact.source, exact.alias, dest)) return dest;
  const exactDisk = findOnDiskHud(cacheName, exact.source && (exact.source.path || exact.source.entry));
  if (exactDisk) {
    await materializeHudFile(exactDisk, dest);
    if (fileLooksLikePng(dest)) return dest;
  }

  await waitForHudPrefetch(hudByName);
  try {
    if (fileLooksLikePng(dest)) return dest;
  } catch {
    /* fallback */
  }

  if (await materializeZipSource(exact.source, exact.alias, dest)) return dest;

  for (const alias of aliases.slice(1)) {
    const hit = lookupHudSourceExact(alias, hudByName);
    if (await materializeFileOrDisk(hit.source, hit.alias, dest)) return dest;
    const disk = findOnDiskHud(alias, hit.source && (hit.source.path || hit.source.entry));
    if (disk) {
      await materializeHudFile(disk, dest);
      if (fileLooksLikePng(dest)) return dest;
    }
    if (await materializeZipSource(hit.source, hit.alias, dest)) return dest;
  }

  return fileLooksLikePng(dest) ? dest : null;
}

async function ensureFillTypeHudPng(name, hudByName) {
  const aliases = fillTypeNameAliases(name);
  if (aliases.length === 0) return null;
  const cacheName = aliases[0];
  const pending = inflightByCacheName.get(cacheName);
  if (pending) return pending;
  const p = ensureFillTypeHudPngUncached(name, hudByName).finally(() => {
    inflightByCacheName.delete(cacheName);
  });
  inflightByCacheName.set(cacheName, p);
  return p;
}

module.exports = {
  getFillTypeHudCacheDir,
  fillTypeNameAliases,
  fillTypeNameFromHudFile,
  candidateBasenames,
  prefetchFillTypeHudCache,
  ensureFillTypeHudPng,
  lookupHudSource,
  extractHudRoots,
  isLikelyHudEntry,
  bufferLooksLikePng,
  bufferLooksLikeDds,
  fileLooksLikePng,
  writeHudPngFromBuffer,
};
