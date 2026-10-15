#!/usr/bin/env node
// Local publication: one shared containment and admitted-closure policy.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_IDS, emptyDemoLibrary, publishDemoGeneration } from '../src/platform/demo-source.ts';
import { publishPersisted, readCommittedTexts, readPersistedLibrary, parseAdmission,
  parsePointer, safeAssetName, MAX_ADMISSION_BYTES, MAX_ASSET_BYTES,
  MAX_GENERATION_BYTES, MAX_MANIFEST_BYTES, publicationSha256 } from '../src/platform/recorded-publication.ts';
import { inside, assertSafePath, ensureDirectory, boundedRead, atomicFile, withRootLock } from './recorded-filesystem.mjs';
import { validatePublicAsset } from './recorded-assets.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_CANDIDATE_BYTES = 4 * 1024 * 1024;
const MAX_STAGE_BYTES = 64 * 1024 * 1024;
const STORES = ['pointers', 'commits', 'generations', 'manifests', 'visitors', 'assets'];
const STORE_REL = /^(pointers|commits|generations|manifests|visitors)\/[A-Za-z0-9][A-Za-z0-9_-]{0,63}\.json$/;
const DEMO_REL = /^(pointers|admissions)\/(base|precision-farming|realistic-farming|precision-companions)\.json$/;
export function publicationBase() { return path.resolve(process.env.FARMDASH_RECORDED_BASE || path.join(appRoot, '.recorded-publication')); }
function checkedRoot(dir, label = 'root', mustExist = false) {
  if (typeof dir !== 'string' || !dir) throw new Error(`--${label} is required`);
  const base = publicationBase(), target = path.resolve(dir);
  assertSafePath(base, undefined, { directory: true });
  return assertSafePath(target, base, { mustExist, directory: true }).path;
}
export function resolveRoot(dir, label = 'root') {
  const root = checkedRoot(dir, label);
  return ensureDirectory(root, publicationBase());
}
function storeLimit(rel) {
  if (DEMO_REL.test(rel)) return MAX_ADMISSION_BYTES;
  if (rel.startsWith('assets/') && safeAssetName(rel.slice(7))) return MAX_ASSET_BYTES;
  if (!STORE_REL.test(rel)) return null;
  if (rel.startsWith('generations/')) return MAX_GENERATION_BYTES;
  if (rel.startsWith('manifests/')) return MAX_MANIFEST_BYTES;
  if (rel.startsWith('commits/') || rel.startsWith('visitors/')) return 1024;
  return null;
}
export function fsIo(rootDir) {
  const root = checkedRoot(rootDir);
  const abs = rel => {
    if (storeLimit(rel) == null) throw new Error('unsafe publication path');
    const physical = rel.startsWith('admissions/') ? 'pointers/' + rel.slice(11) : rel;
    return assertSafePath(path.resolve(root, physical), root).path;
  };
  const readBytes = rel => boundedRead(abs(rel), storeLimit(rel), root);
  const io = {
    root, readBytes,
    read(rel) { const body = readBytes(rel); return body == null ? null : new TextDecoder('utf-8', { fatal: true }).decode(body); },
    writeAtomic(rel, body) {
      if (!/^(pointers|visitors)\//.test(rel)) return io.createOnce(rel, body);
      const target = abs(rel);
      if (Buffer.byteLength(body) > storeLimit(rel)) throw new Error('file-too-large');
      atomicFile(target, body, root);
    },
    createOnce(rel, body) {
      if (!/^(generations|manifests|commits|assets)\//.test(rel)) throw new Error('unsafe immutable path');
      const target = abs(rel);
      if (Buffer.byteLength(body) > storeLimit(rel)) throw new Error('file-too-large');
      atomicFile(target, body, root, true);
    },
    exists(rel) { return !!assertSafePath(abs(rel), root).stat; },
    list(prefix) {
      if (!STORES.includes(prefix)) return [];
      const dir = assertSafePath(path.join(root, prefix), root, { directory: true });
      if (!dir.stat) return [];
      assertSafePath(dir.path, root, { mustExist: true, directory: true });
      return fs.readdirSync(dir.path).filter(name => {
        const st = assertSafePath(path.join(dir.path, name), root).stat;
        return name.endsWith('.json') && st?.isFile();
      });
    },
    digest(rel) { const body = readBytes(rel); return body == null ? null : { bytes: body.length, sha256: publicationSha256(body) }; },
    validateAsset(rel) {
      if (!rel.startsWith('assets/')) return null;
      const body = readBytes(rel);
      if (body == null) return null;
      try { return validatePublicAsset(rel.slice(7), body); } catch { return null; }
    },
    withLock(operation) {
      checkedRoot(root);
      for (const store of STORES) assertSafePath(path.join(root, store), root, { directory: true });
      return withRootLock(root, publicationBase(), operation);
    },
  };
  return io;
}
export function publish(rootDir, candidatePath, assetDir) {
  const root = checkedRoot(rootDir);
  if (typeof candidatePath !== 'string' || !candidatePath) return { ok: false, error: 'candidate-unreadable' };
  let candidate;
  try {
    const candidateFile = assertSafePath(path.resolve(candidatePath), undefined, { mustExist: true }).path;
    candidate = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(boundedRead(candidateFile, MAX_CANDIDATE_BYTES)));
  } catch { return { ok: false, error: 'candidate-unreadable' }; }
  const checked = publishDemoGeneration(emptyDemoLibrary(), candidate);
  if (!checked.ok) return { ok: false, error: checked.error };
  const names = candidate.assets ?? [];
  if (!Array.isArray(names) || names.length > 32 || new Set(names).size !== names.length || names.some(name => !safeAssetName(name))) return { ok: false, error: 'unsafe-asset' };
  const io = fsIo(root), pending = new Map();
  try {
    const from = assetDir ? assertSafePath(path.resolve(assetDir), undefined, { mustExist: true, directory: true }).path : root;
    for (const name of names) {
      const source = assetDir ? path.join(from, name) : path.join(root, 'assets', name);
      const body = boundedRead(source, MAX_ASSET_BYTES, from);
      if (!body) throw new Error('missing-asset');
      validatePublicAsset(name, body);
      const prior = io.readBytes('assets/' + name);
      if (prior && !prior.equals(body)) throw new Error('immutable-asset-collision');
      pending.set(name, body);
    }
    return io.withLock(() => {
      let prepared = false;
      const adapter = {
        ...io, withLock: undefined,
        validateAsset(rel) {
          const body = pending.get(rel.slice(7));
          return body ? validatePublicAsset(rel.slice(7), body) : io.validateAsset(rel);
        },
        createOnce(rel, body) {
          if (!prepared) {
            for (const [name, bytes] of pending) {
              const existing = io.readBytes('assets/' + name);
              if (existing && !existing.equals(bytes)) throw new Error('immutable-asset-collision');
            }
            for (const [name, bytes] of pending) if (!io.exists('assets/' + name)) io.createOnce('assets/' + name, bytes);
            prepared = true;
          }
          io.createOnce(rel, body);
        },
      };
      const result = publishPersisted(adapter, candidate);
      return result.ok ? { ok: true, pointers: result.library.pointers } : { ok: false, error: result.error };
    });
  } catch (error) { return { ok: false, error: String(error.message || error) }; }
}
function admittedClosure(io) {
  const files = new Map(), authorities = new Map();
  let total = 0;
  const add = (rel, body) => {
    if (files.has(rel)) { if (!files.get(rel).equals(body)) throw new Error('source-identity-collision'); return; }
    total += body.length;
    if (total > MAX_STAGE_BYTES) throw new Error('stage-byte-budget');
    files.set(rel, body);
  };
  for (const demoId of DEMO_IDS) {
    const text = io.read(`pointers/${demoId}.json`);
    if (text == null) continue;
    const authority = parseAdmission(text, demoId);
    if (!authority) throw new Error('invalid-source-admission');
    for (const entry of authority.history) {
      const record = readCommittedTexts(io, entry.generationId);
      if (!record || record.generation.demoId !== demoId) throw new Error('invalid-source-closure');
      for (const store of ['generations', 'manifests', 'commits']) {
        const key = store === 'generations' ? 'generation' : store === 'manifests' ? 'manifest' : 'commit';
        add(`${store}/${entry.generationId}.json`, Buffer.from(record.texts[key]));
      }
      for (const asset of record.manifest.assets) {
        const body = io.readBytes('assets/' + asset.name);
        const info = validatePublicAsset(asset.name, body);
        if (info.bytes !== asset.bytes || info.sha256 !== asset.sha256) throw new Error('source-asset-changed');
        add('assets/' + asset.name, body);
      }
    }
    authorities.set(demoId, authority);
  }
  return { files, authorities };
}
export function stage(rootDir, outDir) {
  const root = checkedRoot(rootDir, 'root', true), out = checkedRoot(outDir, 'out');
  if (inside(root, out) || inside(out, root)) throw new Error('out must not overlap root');
  const incoming = admittedClosure(fsIo(root)), target = fsIo(out);
  const preflight = () => {
    const existing = admittedClosure(target), updates = new Map(), owner = new Map();
    for (const [demoId, authority] of existing.authorities) for (const entry of authority.history) owner.set(entry.generationId.toLowerCase(), demoId);
    for (const [rel, bytes] of incoming.files) {
      const current = target.readBytes(rel);
      if (current && !current.equals(bytes)) throw new Error('immutable-stage-collision: ' + rel);
    }
    for (const [demoId, authority] of incoming.authorities) {
      const history = [...(existing.authorities.get(demoId)?.history ?? [])];
      for (const row of authority.history) {
        const priorOwner = owner.get(row.generationId.toLowerCase());
        if (priorOwner && priorOwner !== demoId) throw new Error('generation-owner-collision');
        const prior = history.find(item => item.generationId.toLowerCase() === row.generationId.toLowerCase());
        if (prior && JSON.stringify(prior) !== JSON.stringify(row)) throw new Error('admission-identity-collision');
        if (!prior) history.push(row);
        owner.set(row.generationId.toLowerCase(), demoId);
      }
      const text = JSON.stringify({ ...authority, history });
      if (!parseAdmission(text, demoId)) throw new Error('stage-history-full');
      updates.set(demoId, text);
    }
    return updates;
  };
  preflight();
  return target.withLock(() => {
    const updates = preflight();
    for (const [rel, bytes] of incoming.files) if (!target.exists(rel)) target.createOnce(rel, bytes);
    for (const [demoId, text] of updates) if (target.read(`pointers/${demoId}.json`) !== text) target.writeAtomic(`pointers/${demoId}.json`, text);
    return { ok: true, files: [...incoming.files.keys(), ...[...updates.keys()].map(id => `pointers/${id}.json`)].sort() };
  });
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
export function serve(rootDir, distDir, port = 5178) {
  const root = checkedRoot(rootDir, 'root', true);
  if (typeof distDir !== 'string' || !distDir) throw new Error('--dist is required');
  const dist = assertSafePath(path.resolve(distDir), undefined, { mustExist: true, directory: true }).path;
  if (inside(root, dist) || inside(dist, root)) throw new Error('dist must not overlap publication root');
  if (!boundedRead(path.join(dist, 'index.html'), 2 * 1024 * 1024, dist)) throw new Error('dist has no index.html');
  const server = http.createServer((req, res) => {
    const send = (status, body, type = 'text/plain; charset=utf-8', immutable = false) => {
      res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff', 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-store', 'content-length': Buffer.byteLength(body) });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'read only');
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); } catch { return send(400, 'bad path'); }
    try {
      if (pathname.startsWith('/recorded/')) {
        const rel = pathname.slice(10), io = fsIo(root), demo = DEMO_REL.exec(rel);
        if (demo) {
          const admissionText = io.read(`pointers/${demo[2]}.json`), authority = parseAdmission(admissionText, demo[2]);
          if (!authority || !readCommittedTexts(io, authority.generationId)) return send(404, 'not found');
          if (demo[1] === 'admissions' && authority.history.some(row => !readCommittedTexts(io, row.generationId))) return send(404, 'not found');
          return send(200, demo[1] === 'admissions' ? admissionText : JSON.stringify({ generationId: parsePointer(admissionText) }), TYPES['.json']);
        }
        const stored = /^(generations|manifests|commits)\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})\.json$/.exec(rel);
        if (stored) {
          const record = readCommittedTexts(io, stored[2]);
          if (!record) return send(404, 'not found');
          const key = stored[1] === 'generations' ? 'generation' : stored[1] === 'manifests' ? 'manifest' : 'commit';
          return send(200, record.texts[key], TYPES['.json'], true);
        }
        if (rel.startsWith('assets/') && safeAssetName(rel.slice(7))) {
          const library = readPersistedLibrary(io);
          for (const id of Object.keys(library.generations)) {
            const record = readCommittedTexts(io, id), asset = record?.manifest.assets.find(row => row.name === rel.slice(7));
            if (!asset) continue;
            const body = io.readBytes(rel), info = validatePublicAsset(asset.name, body);
            if (info.bytes !== asset.bytes || info.sha256 !== asset.sha256) return send(404, 'not found');
            return send(200, body, TYPES['.png'], true);
          }
        }
        return send(404, 'not found');
      }
      const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
      if (rel !== 'index.html' && rel !== 'locales/translations.json' && !/^assets\/[a-zA-Z0-9_-]+\.(js|mjs|css|png|jpg|jpeg|webp|svg|woff2)$/.test(rel)) return send(404, 'not found');
      const body = boundedRead(path.resolve(dist, rel), 16 * 1024 * 1024, dist);
      return body == null ? send(404, 'not found') : send(200, body, TYPES[path.extname(rel)]);
    } catch { return send(404, 'not found'); }
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(server); }); });
}
function arg(name) { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : undefined; }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const command = process.argv[2];
    if (command === 'publish') {
      const result = publish(arg('root'), arg('candidate'), arg('asset-dir'));
      console.log(JSON.stringify(result)); process.exitCode = result.ok ? 0 : 1;
    } else if (command === 'stage') console.log(JSON.stringify(stage(arg('root'), arg('out'))));
    else if (command === 'serve') { const server = await serve(arg('root'), arg('dist'), Number(arg('port') || 5178)); console.log(`serving http://127.0.0.1:${server.address().port}/`); }
    else { console.error('usage: recorded-publication.mjs publish|stage|serve --root <dir> ...'); process.exitCode = 2; }
  } catch (error) { console.error(String(error.message || error)); process.exitCode = 1; }
}
