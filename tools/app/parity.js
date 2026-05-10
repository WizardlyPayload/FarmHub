#!/usr/bin/env node
// FS25 FarmDashboard | tools/parity.js | Plan v5 C2
//
// Sort-keys deep-equal comparator for `data.json` snapshots.
// Compares a candidate `data.json` against a baseline (defaults to commit 4ce846f export)
// using a stable, recursive, key-sorted equality check. Differences are listed with their
// JSON pointer path so a developer can audit them.
//
// Whitelisted **new** top-level fields introduced by Plan v5 are tolerated (no diff emitted):
//   - schemaVersion           (Plan v5 Phase 0)
//   - serverTimeSec           (Plan v5 Phase 0)
//   - serverInfo.idScheme     (Plan v5 B5)
//   - serverInfo.animalMode   (Phase 5 — already shipped)
//
// Usage (from FS25_FarmDashboard_App/FS25_FarmDashboard_App): npm run parity --
//   node ../../tools/app/parity.js <candidate.json> [baseline.json]
//   node ../../tools/app/parity.js --help
//
// Exit codes:
//   0  — parity OK (differences only in volatile fields like timestamp / serverTimeSec)
//   1  — semantic differences detected (printed)
//   2  — invalid arguments / I/O error

const fs = require('fs');
const path = require('path');

const VOLATILE_KEYS = new Set([
  'timestamp',
  'serverTimeSec',
  'lastUpdate',
  'updatedAt',
  'generatedAt',
]);

const NEW_FIELDS_WHITELIST = new Set([
  '/schemaVersion',
  '/serverTimeSec',
  '/serverInfo/idScheme',
  '/serverInfo/animalMode',
]);

function usage() {
    console.log(`Usage: node ../../tools/app/parity.js <candidate.json> [baseline.json]

Compares a candidate Farm Dashboard data.json against a known-good baseline using a stable,
key-sorted, recursive deep-equal. Volatile fields (timestamps) are ignored.

If [baseline.json] is omitted, the tool looks for a file at:
  ${path.join(__dirname, '..', 'tests', 'fixtures', 'data.baseline.4ce846f.json')}

Exit code 0 means parity OK. Exit code 1 means semantic differences were detected. Exit
code 2 indicates an argument or I/O error.`);
}

function readJson(p) {
  const txt = fs.readFileSync(p, 'utf8');
  return JSON.parse(txt);
}

/**
 * Sort-keys deep-equal comparator. Returns a list of difference paths (JSON pointer style).
 * `path` is the JSON pointer prefix; root is "".
 */
function diff(a, b, ptr, out) {
  if (a === b) return;
  if (typeof a !== typeof b) {
    out.push({ path: ptr || '/', kind: 'type', a: typeof a, b: typeof b });
    return;
  }
  if (a === null || b === null) {
    out.push({ path: ptr || '/', kind: 'null', a, b });
    return;
  }
  if (typeof a !== 'object') {
    if (typeof a === 'number' && typeof b === 'number'
        && Number.isFinite(a) && Number.isFinite(b)) {
      // Allow tiny floating point drift in cumulative sums.
      if (Math.abs(a - b) < 1e-9) return;
    }
    out.push({ path: ptr || '/', kind: 'value', a, b });
    return;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    out.push({ path: ptr || '/', kind: 'shape', a: Array.isArray(a) ? 'array' : 'object', b: Array.isArray(b) ? 'array' : 'object' });
    return;
  }
  if (Array.isArray(a)) {
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      diff(a[i], b[i], `${ptr}/${i}`, out);
    }
    return;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of [...keys].sort()) {
    if (VOLATILE_KEYS.has(k)) continue;
    const childPtr = `${ptr}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`;
    diff(a[k], b[k], childPtr, out);
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    usage();
    process.exit(args.length === 0 ? 2 : 0);
  }

  const candidatePath = args[0];
  const baselinePath = args[1]
    || path.join(__dirname, '..', 'tests', 'fixtures', 'data.baseline.4ce846f.json');

  let candidate, baseline;
  try {
    candidate = readJson(candidatePath);
  } catch (e) {
    console.error(`Cannot read candidate ${candidatePath}: ${e.message}`);
    process.exit(2);
  }
  try {
    baseline = readJson(baselinePath);
  } catch (e) {
    console.error(`Cannot read baseline ${baselinePath}: ${e.message}`);
    console.error('Hint: produce a baseline by checking out commit 4ce846f, running the mod once,');
    console.error('and copying the resulting data.json to tests/fixtures/data.baseline.4ce846f.json');
    process.exit(2);
  }

  const out = [];
  diff(baseline, candidate, '', out);
  // Filter out whitelisted-new fields (present in candidate, missing from baseline).
  const real = out.filter((d) => {
    if (d.kind === 'value' && d.a === undefined && NEW_FIELDS_WHITELIST.has(d.path)) return false;
    return true;
  });

  if (real.length === 0) {
    console.log(`OK: ${candidatePath} matches baseline (volatile + whitelisted-new fields excluded).`);
    process.exit(0);
  }

  console.log(`PARITY MISMATCH: ${real.length} differences found.\n`);
  for (const d of real.slice(0, 100)) {
    console.log(`  ${d.path || '/'}: kind=${d.kind} baseline=${JSON.stringify(d.a)} candidate=${JSON.stringify(d.b)}`);
  }
  if (real.length > 100) {
    console.log(`  ... (+${real.length - 100} more)`);
  }
  process.exit(1);
}

if (require.main === module) main();

module.exports = { diff, NEW_FIELDS_WHITELIST, VOLATILE_KEYS };
