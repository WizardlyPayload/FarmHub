#!/usr/bin/env node
/**
 * Copies NEW APP Vite dist → FS25_FarmDashboard_App/ui-v2 for Electron packaging.
 * electron-builder ships ui-v2/** next to main.js (reliable in asar); do not rely on ../NEW APP/dist.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const srcDir = path.join(repoRoot, 'NEW APP', 'dist');
const destDir = path.join(repoRoot, 'FS25_FarmDashboard_App', 'ui-v2');
const required = ['index.html', 'setup.html', 'simhub.html'];

function assertOwnedSibling(candidate, parent, prefix) {
  const resolved = path.resolve(candidate);
  const parentReal = fs.realpathSync(parent);
  if (path.dirname(fs.realpathSync(resolved)) !== parentReal
      || !path.basename(resolved).startsWith(prefix)
      || fs.lstatSync(resolved).isSymbolicLink()) {
    throw new Error(`[copy-ui-v2] Refusing to remove or move unexpected staging path: ${resolved}`);
  }
}

function assertPathWithinParent(target, parent) {
  const resolved = path.resolve(target);
  const intendedParent = path.resolve(parent);
  const relative = path.relative(intendedParent, resolved);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`[copy-ui-v2] Move target is outside the intended UI directory: ${resolved}`);
  }
  if (fs.existsSync(resolved)) {
    if (fs.lstatSync(resolved).isSymbolicLink()) {
      throw new Error(`[copy-ui-v2] Linked move target refused: ${resolved}`);
    }
    const actual = fs.realpathSync(resolved);
    const actualRelative = path.relative(fs.realpathSync(parent), actual);
    if (!actualRelative || actualRelative === '..' || actualRelative.startsWith(`..${path.sep}`)
        || path.isAbsolute(actualRelative)) {
      throw new Error(`[copy-ui-v2] Resolved move target is outside the intended UI directory: ${actual}`);
    }
  }
  return resolved;
}

export function copyUiDirectory(source = srcDir, destination = destDir,
  { copy = fs.cpSync, verify, move = fs.renameSync } = {}) {
  const missing = required.filter((f) => !fs.existsSync(path.join(source, f)));
  if (missing.length) {
    console.error('[copy-ui-v2] NEW APP dist incomplete. Run: npm run build --prefix "NEW APP"');
    throw new Error(`[copy-ui-v2] Missing: ${missing.map((f) => path.join(source, f)).join(', ')}`);
  }

  const parent = path.dirname(path.resolve(destination));
  fs.mkdirSync(parent, { recursive: true });
  if (fs.lstatSync(parent).isSymbolicLink()) throw new Error(`[copy-ui-v2] Linked destination parent refused: ${parent}`);
  if (fs.existsSync(destination)) {
    const destStat = fs.lstatSync(destination);
    if (destStat.isSymbolicLink() || !destStat.isDirectory()) {
      throw new Error(`[copy-ui-v2] Linked or non-directory destination refused: ${destination}`);
    }
  }
  const prefix = `.${path.basename(destination)}-copy-`;
  const stageRoot = fs.mkdtempSync(path.join(parent, prefix));
  const candidate = path.join(stageRoot, 'next');
  const previous = path.join(stageRoot, 'previous');
  let preserveBackup = false;
  try {
    copy(source, candidate, { recursive: true });
    for (const f of required) {
      if (!fs.existsSync(path.join(candidate, f))) {
        throw new Error(`[copy-ui-v2] Copy failed — missing ${path.join(candidate, f)}`);
      }
    }
    if (verify) verify(candidate);
    assertOwnedSibling(stageRoot, parent, prefix);
    let movedPrevious = false;
    if (fs.existsSync(destination)) {
      assertPathWithinParent(destination, parent);
      assertPathWithinParent(previous, parent);
      move(destination, previous);
      movedPrevious = true;
    }
    try {
      assertPathWithinParent(candidate, parent);
      assertPathWithinParent(destination, parent);
      move(candidate, destination);
    } catch (error) {
      if (movedPrevious) {
        try {
          assertPathWithinParent(previous, parent);
          assertPathWithinParent(destination, parent);
          move(previous, destination);
        } catch (restoreError) {
          preserveBackup = true;
          throw new Error(`[copy-ui-v2] Candidate move failed and previous UI restore failed. `
            + `Previous UI backup preserved at ${previous}. `
            + `Candidate error: ${error.message}; restore error: ${restoreError.message}`);
        }
      }
      throw error;
    }
  } finally {
    if (!preserveBackup && fs.existsSync(stageRoot)) {
      assertOwnedSibling(stageRoot, parent, prefix);
      fs.rmSync(stageRoot, { recursive: true, force: true });
    }
  }

  console.log('[copy-ui-v2] OK —', destination);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.FARMDASH_V5_STAGING_UI_BUILD === '1') {
    // npm's postbuild runs this script; the V5 runner copies its verified staging output instead.
    console.log('[copy-ui-v2] V5 staging build: postbuild copy deferred to package proof.');
  } else {
    try {
      copyUiDirectory();
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  }
}
