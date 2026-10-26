#!/usr/bin/env node
// Private preparation only. An approved candidate is published separately.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DEMO_IDS, FEATURE_ROUTES, emptyDemoLibrary, publicPayload,
  publishDemoGeneration, sectionHasFeature } from '../src/platform/demo-source.ts';
import { MAX_GENERATION_BYTES } from '../src/platform/recorded-publication.ts';

const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const SAFE_SLOT = /^savegame(?:[1-9]|[1-9][0-9])$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_AGE_MS = 5 * 60 * 1000;

function positive(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
}
function exactInstant(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

/** An API response must prove a completed, current source; transport time alone is insufficient. */
export function makeRecordedCandidate(snapshot, options, now = Date.now()) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new Error('invalid-snapshot');
  const { demoId, sections, farmId, sourceSlot } = options || {};
  if (!DEMO_IDS.includes(demoId) || !Array.isArray(sections) || !sections.length
    || new Set(sections).size !== sections.length
    || sections.some(section => !Object.hasOwn(FEATURE_ROUTES, section))) throw new Error('invalid-demo-selection');
  if (!Number.isInteger(farmId) || farmId < 1 || farmId > 16
    || typeof sourceSlot !== 'string' || !SAFE_SLOT.test(sourceSlot)) throw new Error('invalid-source-selection');
  if (snapshot.serverInfo?.saveSlot !== sourceSlot) throw new Error('wrong-save-slot');
  const roster = snapshot.farmInfo;
  if (!Array.isArray(roster) || !roster.some(row => row && (row.id === farmId || row.farmId === farmId))) {
    throw new Error('farm-not-in-source');
  }
  const binding = snapshot.sourceBinding;
  const identity = binding?.exportIdentity;
  if (binding?.stateStatus !== 'snapshot' || !SAFE_ID.test(String(binding.bindingId || ''))
    || !identity || !SAFE_ID.test(String(identity.careerId || ''))
    || !SAFE_ID.test(String(identity.sessionId || ''))
    || !positive(identity.exportGeneration) || !positive(identity.publicationSequence)) {
    throw new Error('uncommitted-or-held-source');
  }
  const ts = snapshot.dataTimestamps || {};
  const sampledAt = ts.lastLuaReceivedAt;
  const age = Date.parse(sampledAt);
  if (!exactInstant(sampledAt) || !Number.isFinite(now) || age > now + 30_000 || now - age > MAX_AGE_MS
    || snapshot.luaAvailable !== true || snapshot.isStale === true || ts.isStale === true
    || ts.liveExportStaleAt || ts.heldFromSnapshotAt || ts.mergeHeldStaleAt
    || ts.loadedFromDiskCacheAt || ts.cacheUsedDueToFailure === true) {
    throw new Error('stale-or-unverified-source');
  }
  const payload = { dataSource: 'recorded-demo', activeFarmId: farmId, farmInfo: roster };
  for (const section of sections) {
    const key = FEATURE_ROUTES[section];
    if (snapshot[key] === undefined) throw new Error(`missing-section:${section}`);
    if (section === 'mod-everythingConstructable') {
      const page = snapshot.companionPages?.pages?.everythingConstructable;
      if (!page || typeof page !== 'object') throw new Error(`missing-section:${section}`);
      // Never feed unrelated companion pages to the public projector.
      payload.companionPages = { pages: { everythingConstructable: page } };
    } else {
      payload[key] = snapshot[key];
    }
    if (section === 'pastures' && snapshot.animals !== undefined) payload.animals = snapshot.animals;
  }
  const projection = publicPayload(payload);
  if (!projection.ok) throw new Error(`projection:${projection.error}`);
  for (const section of sections) if (!sectionHasFeature(projection.payload, section)) throw new Error(`empty-section:${section}`);
  const year = snapshot.gameTime?.year;
  const period = snapshot.gameTime?.period;
  const gameDate = positive(year) && positive(period) && period <= 12 ? `Year ${year}, period ${period}` : null;
  const mapTitle = snapshot.mapTitle ?? snapshot.serverInfo?.mapName;
  const content = {
    demoId, capturedAt: sampledAt, gameDate, mapTitle,
    limitations: [], section: sections[0],
    exportGeneration: identity.exportGeneration,
    publicationSequence: identity.publicationSequence,
    payload: projection.payload,
  };
  const digest = createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 16);
  const candidate = { id: `${demoId}-${identity.exportGeneration}-${digest}`, ...content };
  const checked = publishDemoGeneration(emptyDemoLibrary(), candidate);
  if (!checked.ok) throw new Error(`candidate:${checked.error}`);
  const canonical = checked.library.generations[candidate.id];
  if (Buffer.byteLength(JSON.stringify(canonical)) > MAX_GENERATION_BYTES) throw new Error('candidate-too-large');
  return canonical;
}

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? null : process.argv[index + 1];
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const inputPath = readArg('input');
    const outputPath = readArg('out');
    const selection = {
      demoId: readArg('demo-id'), sourceSlot: readArg('source-slot'), farmId: Number(readArg('farm-id')),
      sections: String(readArg('sections') || '').split(',').filter(Boolean),
    };
    if (!inputPath || !outputPath || !fs.statSync(inputPath).isFile()) throw new Error('input-and-out-required');
    const stat = fs.statSync(inputPath);
    if (stat.size < 2 || stat.size > MAX_INPUT_BYTES) throw new Error('invalid-input-size');
    const snapshot = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const candidate = makeRecordedCandidate(snapshot, selection);
    fs.writeFileSync(outputPath, JSON.stringify(candidate, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ ok: true, id: candidate.id, sections: selection.sections,
      exportGeneration: candidate.exportGeneration, output: path.resolve(outputPath) }));
  } catch (error) {
    console.error(`candidate not written: ${String(error.message || error)}`);
    process.exitCode = 1;
  }
}
