#!/usr/bin/env node
// Run before publishing a V5 app/mod pair. Development revision numbers must
// not be promoted to public release versions.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const app = read('FS25_FarmDashboard_App/electron-builder.rf.yml').match(/^  version: (\d+)\.(\d+)\.(\d+)\s*$/m);
const descriptor = read('FS25_FarmDashboard_Mod/modDesc.xml').match(/<version>(\d+)\.(\d+)\.(\d+)\.(\d+)<\/version>/);
const runtime = read('FS25_FarmDashboard_Mod/src/FarmDashboard.lua').match(/^FarmDashboard\.VERSION = "(\d+\.\d+\.\d+\.\d+)"/m);

const errors = [];
if (!app || app[1] !== '5' || app[3] !== '0') errors.push('V5 public app version must be 5.PUBLIC.0');
if (!descriptor || descriptor[1] !== '5' || descriptor[3] !== '0' || descriptor[4] !== '0') {
  errors.push('V5 public mod version must be 5.PUBLIC.0.0');
}
if (!descriptor || !runtime || descriptor.slice(1).join('.') !== runtime[1]) {
  errors.push('Mod descriptor and runtime versions must match');
}
if (errors.length) {
  for (const error of errors) console.error(`[FarmDash public version] ${error}`);
  process.exit(1);
}
console.log(`[FarmDash public version] OK — app ${app.slice(1).join('.')} / mod ${runtime[1]}`);
