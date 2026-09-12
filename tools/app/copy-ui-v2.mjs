#!/usr/bin/env node
/**
 * Copies NEW APP Vite dist → FS25_FarmDashboard_App/ui-v2 for Electron packaging.
 *
 * On the installer/edition slice the NEW APP tree is not present yet. Skip
 * (exit 0) so prepack/predist/build:ui/pack can run. The NEW APP PR restores
 * a hard failure when dist is incomplete.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const srcDir = path.join(repoRoot, 'NEW APP', 'dist');
const destDir = path.join(repoRoot, 'FS25_FarmDashboard_App', 'ui-v2');
const required = ['index.html', 'setup.html', 'simhub.html'];

function rmDirSafe(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function main() {
  const missing = required.filter((f) => !fs.existsSync(path.join(srcDir, f)));
  if (missing.length) {
    console.error('[copy-ui-v2] Skipping — NEW APP dist not present on this branch.');
    console.error('[copy-ui-v2] Missing:', missing.map((f) => path.join(srcDir, f)).join(', '));
    process.exit(0);
  }

  rmDirSafe(destDir);
  fs.cpSync(srcDir, destDir, { recursive: true });

  for (const f of required) {
    if (!fs.existsSync(path.join(destDir, f))) {
      console.error('[copy-ui-v2] Copy failed — missing', path.join(destDir, f));
      process.exit(1);
    }
  }

  console.log('[copy-ui-v2] OK —', destDir);
}

main();
