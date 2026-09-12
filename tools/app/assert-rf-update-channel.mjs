#!/usr/bin/env node
/**
 * Guard: V5 product-line builds must never leave a classic latest.yml
 * that would auto-update V4 clients into V5.
 *
 * Usage: node tools/app/assert-rf-update-channel.mjs <outputDir>
 */
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2];
if (!outDir) {
  console.error('[FarmDash V5] assert-rf-update-channel: missing output directory');
  process.exit(2);
}

const classic = path.join(outDir, 'latest.yml');
const rf = path.join(outDir, 'latest-rf.yml');
const legacyChannelName = path.join(outDir, 'rf.yml');

if (fs.existsSync(classic)) {
  const classicText = fs.readFileSync(classic, 'utf8');
  if (/Farm-Dashboard-(?:V5|RF)-Setup/i.test(classicText)) {
    console.error('');
    console.error('[FarmDash V5] HARD RULE VIOLATION: V4 latest.yml points at a V5 installer:');
    console.error(`  ${classic}`);
    console.error('  V5 must publish latest-rf.yml only. Refusing to continue.');
    console.error('  See docs/COMPATIBILITY.md');
    console.error('');
    process.exit(1);
  }
}

// Stale/wrong channel name from older configs — must not ship alongside latest-rf.yml.
if (fs.existsSync(legacyChannelName)) {
  console.error('');
  console.error('[FarmDash V5] HARD RULE VIOLATION: stray rf.yml in V5 build output:');
  console.error(`  ${legacyChannelName}`);
  console.error('  Only latest-rf.yml is allowed (publish.channel: latest-rf). Remove rf.yml.');
  console.error('');
  process.exit(1);
}

const hasInstaller = fs.readdirSync(outDir).some((name) =>
  /^FS25-Farm-Dashboard-(?:V5|RF)-Setup-.*\.exe$/i.test(name),
);

if (hasInstaller && !fs.existsSync(rf)) {
  console.error('');
  console.error('[FarmDash V5] HARD RULE VIOLATION: V5 Setup.exe present but latest-rf.yml missing:');
  console.error(`  Expected: ${rf}`);
  console.error('  V4 latest.yml must remain untouched; V5 dist must emit latest-rf.yml.');
  console.error('');
  process.exit(1);
}

if (!fs.existsSync(rf)) {
  console.warn('[FarmDash V5] Note: latest-rf.yml not found yet (ok for --dir pack without installer).');
  console.warn(`  Expected at: ${rf}`);
}

console.error('[FarmDash V5] Update-channel guard OK (latest-rf.yml only; no V4 latest.yml).');
