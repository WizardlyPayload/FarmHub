import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../tools/app/assert-rf-update-channel.mjs', import.meta.url));

function runGuard(dir) {
  return spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
}

test('V5 out dir with latest.yml is hard-fail and the file is deleted', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farmdash-v5-channel-'));
  try {
    fs.writeFileSync(path.join(dir, 'latest.yml'), 'path: FS25-Farm-Dashboard-V5-Setup-5.0.3.exe\n');
    fs.writeFileSync(path.join(dir, 'latest-rf.yml'), 'path: FS25-Farm-Dashboard-V5-Setup-5.0.3.exe\n');
    const result = runGuard(dir);
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(path.join(dir, 'latest.yml')), false);
    assert.match(String(result.stderr || result.stdout), /latest\.yml must not exist/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('V5 out dir with latest-rf.yml only is OK', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farmdash-v5-channel-ok-'));
  try {
    fs.writeFileSync(path.join(dir, 'latest-rf.yml'), 'path: FS25-Farm-Dashboard-V5-Setup-5.0.3.exe\n');
    const result = runGuard(dir);
    assert.equal(result.status, 0);
    assert.equal(fs.existsSync(path.join(dir, 'latest-rf.yml')), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
