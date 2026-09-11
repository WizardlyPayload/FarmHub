/**
 * Field boundary polygons from the map i3d (FieldUtil.onCreate + polygonIndex).
 * Engine: Field.lua loads child nodes of polygonIndex and uses world X/Z.
 * These shapes are map-static; live soil/crop still comes from the dashboard feed.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  findOverviewSourceFile,
  getMapOverviewCacheDir,
} = require("./mapOverviewResolver");
const { pickMapOutlineForField } = require("./fleetMapOverlays.cjs");
const { sanitizeMapSlug, joinContained } = require("./safeFsIdentity.cjs");

const OUTLINE_MAX_POINTS = 64;
const I3D_CACHE_VERSION = 5;
const I3D_SCENE_MAX_BYTES = 48 * 1024 * 1024;

function parseVec(raw, fallbackX, fallbackY, fallbackZ) {
  if (!raw) return { x: fallbackX, y: fallbackY, z: fallbackZ };
  const p = String(raw).trim().split(/\s+/);
  return {
    x: Number(p[0]) || fallbackX,
    y: Number(p[1]) || fallbackY,
    z: Number(p[2]) || fallbackZ,
  };
}

function parseTranslation(raw) {
  return parseVec(raw, 0, 0, 0);
}

function composeChild(parent, translation, rotation, scale) {
  const px = parent ? parent.worldX : 0;
  const pz = parent ? parent.worldZ : 0;
  const parentYaw = parent ? parent.yaw : 0;
  const parentSx = parent ? parent.scaleX : 1;
  const parentSz = parent ? parent.scaleZ : 1;
  const rad = (parentYaw * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const lx = translation.x * parentSx;
  const lz = translation.z * parentSz;
  return {
    worldX: px + lx * c - lz * s,
    worldZ: pz + lx * s + lz * c,
    yaw: parentYaw + (rotation.y || 0),
    scaleX: parentSx * (scale.x || 1),
    scaleZ: parentSz * (scale.z || 1),
  };
}

function isFieldNodeName(name) {
  return /^field[_-]?0*\d+$/i.test(String(name || ""));
}

function isPolygonRootName(name) {
  const n = String(name || "").toLowerCase();
  return n === "polygonpoints" || n === "polygon" || n === "points" || n === "fieldpolygon";
}

function attr(blob, name) {
  const m = new RegExp(`\\b${name}="([^"]*)"`, "i").exec(blob);
  return m ? m[1] : "";
}

function pointSegDist(p, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

function rdpSimplify(pts, eps) {
  if (pts.length <= 2) return pts.slice();
  let maxD = 0;
  let idx = 0;
  const first = pts[0];
  const last = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = pointSegDist(pts[i], first, last);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > eps) {
    const left = rdpSimplify(pts.slice(0, idx + 1), eps);
    const right = rdpSimplify(pts.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

function stepSample(pts, maxPoints) {
  const n = pts.length;
  const step = Math.ceil(n / maxPoints);
  const out = [];
  for (let i = 0; i < n; i += step) out.push(pts[i]);
  const last = pts[n - 1];
  const kept = out[out.length - 1];
  if (!kept || kept[0] !== last[0] || kept[1] !== last[1]) out.push(last);
  return out;
}

function downsampleOutline(pts, maxPoints = OUTLINE_MAX_POINTS) {
  if (!Array.isArray(pts) || pts.length < 3) return null;
  if (pts.length <= maxPoints) return pts;
  let lo = 0;
  let hi = 80;
  let best = null;
  for (let i = 0; i < 18; i++) {
    const eps = (lo + hi) / 2;
    const cand = rdpSimplify(pts, eps);
    if (cand.length > maxPoints) lo = eps;
    else {
      best = cand;
      hi = eps;
    }
  }
  if (best && best.length >= 3) return best;
  const stepped = stepSample(pts, maxPoints);
  return stepped.length >= 3 ? stepped : null;
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

function fieldIdFromName(name, fallback) {
  const idMatch = /(\d+)\s*$/.exec(String(name || ""));
  const n = Number(idMatch && idMatch[1]);
  return Number.isFinite(n) ? n : fallback;
}

function finishParsedField(current, fields) {
  if (!current) return;
  const children = current.directChildren || [];
  let poly = children.find((c) => isPolygonRootName(c.name));
  if (!poly) {
    const idx = Number(current.polygonIndex);
    poly = children[Number.isFinite(idx) && idx >= 0 ? idx : 0];
  }
  const rawPts = poly && Array.isArray(poly.vertices) ? poly.vertices : [];
  if (rawPts.length < 3) return;
  const outline = downsampleOutline(rawPts.map(([x, z]) => [round1(x), round1(z)]));
  if (!outline) return;
  let sx = 0;
  let sz = 0;
  for (const p of outline) {
    sx += p[0];
    sz += p[1];
  }
  fields.push({
    id: current.id,
    name: current.name,
    outline,
    cx: round1(sx / outline.length),
    cz: round1(sz / outline.length),
  });
}

/**
 * Parse field polygons from a map i3d Scene (FieldUtil.onCreate + polygonIndex).
 * Engine: Field.lua walks children of polygonIndex; vertices use full parent transforms.
 */
function parseI3dFieldOutlines(i3dXml) {
  let xml = String(i3dXml || "");
  if (!/<Scene[\s>]/i.test(xml) && !/<TransformGroup\b/i.test(xml)) return [];
  const sceneStart = xml.search(/<Scene[\s>]/i);
  if (sceneStart >= 0) {
    const sceneEnd = xml.search(/<\/Scene>/i);
    xml = xml.slice(sceneStart, sceneEnd >= 0 ? sceneEnd : xml.length);
  }
  const re = /<TransformGroup\b([^>]*)>|<\/TransformGroup>|<Attribute\b([^>]*)\/?>/gi;
  const stack = [];
  const fields = [];
  let current = null;
  let m;
  while ((m = re.exec(xml))) {
    const token = m[0];
    if (/^<Attribute/i.test(token)) {
      const blob = m[2] || "";
      const attrName = attr(blob, "name");
      const attrValue = attr(blob, "value");
      const top = stack[stack.length - 1];
      if (/polygonIndex/i.test(attrName) && current) {
        const n = Number(String(attrValue).split("|")[0]);
        if (Number.isFinite(n) && n >= 0) current.polygonIndex = n;
      }
      if (/onCreate/i.test(attrName) && /FieldUtil\.onCreate/i.test(attrValue) && top) {
        top.isFieldsRoot = true;
      }
      continue;
    }
    if (token.startsWith("</")) {
      const popped = stack.pop();
      if (current && popped && popped.isField) {
        finishParsedField(current, fields);
        current = null;
      }
      continue;
    }
    const blob = m[1] || "";
    const selfClose = /\/\s*>$/.test(token);
    const name = attr(blob, "name");
    const t = parseTranslation(attr(blob, "translation"));
    const rot = parseVec(attr(blob, "rotation"), 0, 0, 0);
    const scale = parseVec(attr(blob, "scale"), 1, 1, 1);
    const onCreate = attr(blob, "onCreate");
    const parent = stack[stack.length - 1];
    const world = composeChild(parent, t, rot, scale);
    const node = {
      name,
      ...world,
      isFieldsRoot: /FieldUtil\.onCreate/i.test(onCreate) || /^fields$/i.test(name),
      isField: false,
      vertices: [],
    };
    const parentIsFields = parent && (parent.isFieldsRoot || /^fields$/i.test(parent.name));
    if (
      !current &&
      !selfClose &&
      !node.isFieldsRoot &&
      (parentIsFields || isFieldNodeName(name))
    ) {
      current = {
        id: fieldIdFromName(name, fields.length + 1),
        name,
        polygonIndex: 0,
        directChildren: [],
      };
      node.isField = true;
      const polyFromTag = attr(blob, "polygonIndex");
      if (polyFromTag) {
        const pn = Number(String(polyFromTag).split("|")[0]);
        if (Number.isFinite(pn) && pn >= 0) current.polygonIndex = pn;
      }
    }
    if (current && parent && parent.isField) {
      current.directChildren.push(node);
    } else if (current && parent && current.directChildren.includes(parent)) {
      parent.vertices.push([world.worldX, world.worldZ]);
    }
    if (!selfClose) stack.push(node);
  }
  return fields;
}

function scoreMapI3dPath(entryName, uncompressedSize) {
  const n = String(entryName || "").replace(/\\/g, "/").toLowerCase();
  if (!n.endsWith(".i3d")) return -1;
  if (n.includes("__macosx") || n.includes("/.ds_store")) return -1;
  if (
    /(^|\/)(foliage|character|licenseplates?|sounds|missions|effects|placeables|buildings|bales|trees|fs\d*trees|cutter|config|animals|navmesh|prefabs)(\/|$)/i.test(
      n,
    )
  ) {
    return -1;
  }
  const base = n.split("/").pop() || n;
  // map.i3d / mapUS.i3d, plus map-named scenes (carpathianCountrysideMap.i3d, Settlers_map.i3d)
  if (!/^map[a-z0-9]*\.i3d$/i.test(base) && !/map\.i3d$/i.test(base)) return -1;
  let s = /^map[a-z0-9]*\.i3d$/i.test(base) ? 200 : 160;
  if (/(^|\/)maps\/map[a-z0-9]*\.i3d$/i.test(n)) s += 40;
  if (/(^|\/)map\/map[a-z0-9]*\.i3d$/i.test(n)) s += 40;
  if (/\/map[a-z0-9]+\/map[a-z0-9]+\.i3d$/.test(n)) s += 50;
  const size = Number(uncompressedSize) || 0;
  if (size > 500_000) s += 4;
  if (size > 2_000_000) s += 4;
  return s;
}

function createTerrainStripper() {
  let inTerrain = false;
  let carry = "";
  return function push(chunk) {
    let s = carry + String(chunk || "");
    carry = "";
    let out = "";
    while (s.length) {
      if (!inTerrain) {
        const i = s.search(/<TerrainTransformGroup\b/i);
        if (i < 0) {
          if (/<TerrainTransformGrou?p?$/i.test(s.slice(-40))) {
            carry = s.slice(-40);
            out += s.slice(0, Math.max(0, s.length - 40));
          } else {
            out += s;
          }
          return out;
        }
        out += s.slice(0, i);
        const rest = s.slice(i);
        const endOpen = rest.indexOf(">");
        if (endOpen < 0) {
          carry = rest;
          return out;
        }
        const openTag = rest.slice(0, endOpen + 1);
        s = rest.slice(endOpen + 1);
        if (/\/\s*>$/.test(openTag)) continue;
        inTerrain = true;
        continue;
      }
      const j = s.search(/<\/TerrainTransformGroup>/i);
      if (j < 0) {
        carry = s.length > 32 ? s.slice(-32) : s;
        return out;
      }
      const closePart = s.slice(j);
      const endClose = closePart.indexOf(">");
      if (endClose < 0) {
        carry = closePart;
        return out;
      }
      s = closePart.slice(endClose + 1);
      inTerrain = false;
    }
    return out;
  };
}

function stripTerrainTransformGroups(xml) {
  return createTerrainStripper()(xml);
}

function extractI3dSceneFromStream(stream, maxSceneBytes = I3D_SCENE_MAX_BYTES) {
  return new Promise((resolve, reject) => {
    let done = false;
    let inScene = false;
    let tail = "";
    let scene = "";
    const stripTerrain = createTerrainStripper();
    const finish = (value) => {
      if (done) return;
      done = true;
      try {
        stream.destroy();
      } catch {
        /* ignore */
      }
      resolve(value);
    };
    stream.on("data", (chunk) => {
      if (done) return;
      const text = chunk.toString("utf8");
      if (!inScene) {
        const merged = tail + text;
        const idx = merged.search(/<Scene[\s>]/i);
        if (idx < 0) {
          tail = merged.slice(-80);
          return;
        }
        inScene = true;
        scene = stripTerrain(merged.slice(idx));
        const end = scene.search(/<\/Scene>/i);
        if (end >= 0) finish(`${scene.slice(0, end)}</Scene>`);
        else if (scene.length > maxSceneBytes) finish(scene.slice(0, maxSceneBytes));
        return;
      }
      scene += stripTerrain(text);
      const end = scene.search(/<\/Scene>/i);
      if (end >= 0) finish(`${scene.slice(0, end)}</Scene>`);
      else if (scene.length > maxSceneBytes) finish(scene.slice(0, maxSceneBytes));
    });
    stream.on("end", () => {
      if (!done) finish(inScene ? scene : "");
    });
    stream.on("error", (err) => {
      if (done) return;
      done = true;
      reject(err);
    });
  });
}

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

async function findMapI3dInZip(zipPath) {
  const yauzl = loadYauzl();
  if (!yauzl) return null;
  const zipfile = await openZip(yauzl, zipPath);
  return new Promise((resolve, reject) => {
    let best = null;
    let bestScore = -1;
    zipfile.on("entry", (entry) => {
      const sc = scoreMapI3dPath(entry.fileName, entry.uncompressedSize);
      if (sc > bestScore) {
        bestScore = sc;
        best = { zipPath, entryName: entry.fileName, entrySize: entry.uncompressedSize };
      }
      zipfile.readEntry();
    });
    zipfile.on("end", () => {
      try {
        zipfile.close();
      } catch {
        /* ignore */
      }
      resolve(bestScore > 0 ? best : null);
    });
    zipfile.on("error", (err) => {
      try {
        zipfile.close();
      } catch {
        /* ignore */
      }
      reject(err);
    });
    zipfile.readEntry();
  });
}

async function extractBestMapI3dText(zipPath) {
  const listed = await findMapI3dInZip(zipPath);
  if (!listed || !listed.entryName) return null;
  const xml = await extractZipEntryText(zipPath, listed.entryName);
  if (!xml) return null;
  return { entryName: listed.entryName, xml };
}

async function findMapI3dOnDisk(startPath) {
  let dir = path.dirname(startPath);
  for (let depth = 0; depth < 6; depth++) {
    let names = [];
    try {
      names = await fs.promises.readdir(dir);
    } catch {
      break;
    }
    let best = null;
    let bestScore = -1;
    for (const name of names) {
      if (!/\.i3d$/i.test(name)) continue;
      const full = path.join(dir, name);
      let size = 0;
      try {
        size = (await fs.promises.stat(full)).size;
      } catch {
        continue;
      }
      const rel = full.replace(/\\/g, "/");
      const sc = scoreMapI3dPath(rel, size);
      if (sc > bestScore) {
        bestScore = sc;
        best = full;
      }
    }
    if (best && bestScore > 0) return best;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function extractZipEntryText(zipPath, entryName) {
  const yauzl = loadYauzl();
  if (!yauzl) throw new Error("yauzl unavailable");
  const zipfile = await openZip(yauzl, zipPath);
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err, value) => {
      if (settled) return;
      settled = true;
      try {
        zipfile.close();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(value);
    };
    zipfile.on("entry", (entry) => {
      const name = String(entry.fileName).replace(/\\/g, "/");
      const want = String(entryName).replace(/\\/g, "/");
      if (name !== want) {
        zipfile.readEntry();
        return;
      }
      zipfile.openReadStream(entry, (err, stream) => {
        if (err) return done(err);
        extractI3dSceneFromStream(stream).then((xml) => done(null, xml)).catch(done);
      });
    });
    zipfile.on("end", () => done(null, null));
    zipfile.on("error", (err) => {
      if (settled) return;
      done(err);
    });
    zipfile.readEntry();
  });
}

function cacheKey(mapSlug, zipPath, mtimeMs, size) {
  return crypto
    .createHash("sha1")
    .update(`${I3D_CACHE_VERSION}|${mapSlug}|${zipPath}|${mtimeMs}|${size}`)
    .digest("hex")
    .slice(0, 12);
}

async function resolveMapFieldOutlines({ mapId, mapTitle, modsRoot, modsRoots }) {
  const found = await findOverviewSourceFile({ mapId, mapTitle, modsRoot, modsRoots });
  if (!found) {
    return { ok: false, error: "no_map_zip", fields: [] };
  }
  const sourceToken =
    found.sourceKind === "zip" && found.zipHit
      ? found.zipHit.zipPath
      : found.sourcePath;
  if (!sourceToken) return { ok: false, error: "no_map_zip", fields: [] };
  let st;
  try {
    st = await fs.promises.stat(
      found.sourceKind === "zip" && found.zipHit ? found.zipHit.zipPath : found.sourcePath,
    );
  } catch {
    return { ok: false, error: "source_missing", fields: [], mapSlug: found.mapSlug };
  }
  const slug = sanitizeMapSlug(found.mapSlug) || "map";
  const key = cacheKey(slug, sourceToken, st.mtimeMs, st.size);
  const cacheDir = getMapOverviewCacheDir();
  await fs.promises.mkdir(cacheDir, { recursive: true });
  const cachePath = joinContained(cacheDir, `${slug}_${key}_fields.json`);
  try {
    const raw = await fs.promises.readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.cacheVersion === I3D_CACHE_VERSION && Array.isArray(parsed.fields)) {
      return { ok: true, fields: parsed.fields, cached: true, mapSlug: found.mapSlug, fieldCount: parsed.fields.length };
    }
  } catch {
    /* rebuild */
  }

  let xml = null;
  let sourcePath = "";
  if (found.sourceKind === "zip" && found.zipHit) {
    const hit = await extractBestMapI3dText(found.zipHit.zipPath);
    if (!hit || !hit.xml) return { ok: false, error: "no_map_i3d", fields: [], mapSlug: found.mapSlug };
    xml = hit.xml;
    sourcePath = `${found.zipHit.zipPath}::${hit.entryName}`;
  } else {
    const i3dPath = await findMapI3dOnDisk(found.sourcePath);
    if (!i3dPath) return { ok: false, error: "no_map_i3d", fields: [], mapSlug: found.mapSlug };
    xml = await extractI3dSceneFromStream(fs.createReadStream(i3dPath));
    sourcePath = i3dPath;
  }
  const fields = parseI3dFieldOutlines(xml);
  const payload = {
    cacheVersion: I3D_CACHE_VERSION,
    mapSlug: found.mapSlug,
    sourcePath,
    fieldCount: fields.length,
    fields,
    cachedAt: new Date().toISOString(),
  };
  await fs.promises.writeFile(cachePath, JSON.stringify(payload), "utf8");
  return { ok: true, fields, cached: false, mapSlug: found.mapSlug, fieldCount: fields.length };
}

function attachOutlinesToFieldList(fields, mapFields) {
  if (!Array.isArray(fields) || !Array.isArray(mapFields) || mapFields.length === 0) return fields;
  return fields.map((f) => {
    if (!f || typeof f !== "object") return f;
    if (Array.isArray(f.outline) && f.outline.length >= 3) return f;
    const outline = pickMapOutlineForField(f, mapFields);
    return outline ? { ...f, outline } : f;
  });
}

module.exports = {
  parseI3dFieldOutlines,
  downsampleOutline,
  scoreMapI3dPath,
  resolveMapFieldOutlines,
  attachOutlinesToFieldList,
  extractBestMapI3dText,
  stripTerrainTransformGroups,
  OUTLINE_MAX_POINTS,
};
