import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createV5ReleaseStage, cleanupV5ReleaseStage, promoteV5Artifacts } from '../v5-release-stage.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'farmdash-v5-release-test-'));
  t.after(() => {
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.match(path.basename(resolved), /^farmdash-v5-release-test-/);
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return { root, releaseDir: path.join(root, 'FarmDash Release') };
}

function stagedDist(stage, version = '5.0.26') {
  fs.writeFileSync(path.join(stage, `FS25-Farm-Dashboard-V5-Setup-${version}.exe`), 'verified installer');
  fs.writeFileSync(path.join(stage, `FS25-Farm-Dashboard-V5-Setup-${version}.exe.blockmap`), 'verified blockmap');
  fs.writeFileSync(path.join(stage, 'latest-rf.yml'), `version: ${version}\n`);
}

test('candidate remains private until promotion; verified versioned files appear flat without changing old feeds', (t) => {
  const { releaseDir } = fixture(t);
  fs.mkdirSync(releaseDir);
  fs.writeFileSync(path.join(releaseDir, 'FS25-Farm-Dashboard-V5-Setup-5.0.25.exe'), 'old installer');
  fs.writeFileSync(path.join(releaseDir, 'latest-rf.yml'), 'version: 5.0.25\n');
  fs.writeFileSync(path.join(releaseDir, 'latest.yml'), 'classic feed');
  const stage = createV5ReleaseStage(releaseDir);
  stagedDist(stage);
  assert.equal(fs.existsSync(path.join(releaseDir, 'FS25-Farm-Dashboard-V5-Setup-5.0.26.exe')), false);
  const result = promoteV5Artifacts({ stageDir: stage, releaseDir, mode: 'dist', version: '5.0.26' });
  assert.deepEqual(result.promoted, [
    'FS25-Farm-Dashboard-V5-Setup-5.0.26.exe',
    'FS25-Farm-Dashboard-V5-Setup-5.0.26.exe.blockmap',
  ]);
  assert.equal(result.updateMetadataPromoted, false);
  assert.equal(fs.readFileSync(path.join(releaseDir, 'latest-rf.yml'), 'utf8'), 'version: 5.0.25\n');
  assert.equal(fs.readFileSync(path.join(releaseDir, 'latest.yml'), 'utf8'), 'classic feed');
  assert.equal(fs.readFileSync(path.join(releaseDir, 'FS25-Farm-Dashboard-V5-Setup-5.0.25.exe'), 'utf8'), 'old installer');
  cleanupV5ReleaseStage(stage, releaseDir);
  assert.equal(fs.existsSync(stage), false);
  assert.equal(fs.readFileSync(path.join(releaseDir, 'FS25-Farm-Dashboard-V5-Setup-5.0.26.exe'), 'utf8'), 'verified installer');
});

test('same-version collision and missing blockmap fail without altering the release', (t) => {
  const { releaseDir } = fixture(t);
  fs.mkdirSync(releaseDir);
  const existing = path.join(releaseDir, 'FS25-Farm-Dashboard-V5-Setup-5.0.26.exe');
  fs.writeFileSync(existing, 'do not overwrite');
  const stage = createV5ReleaseStage(releaseDir);
  stagedDist(stage);
  assert.throws(() => promoteV5Artifacts({ stageDir: stage, releaseDir, mode: 'dist', version: '5.0.26' }),
    /Refusing to overwrite/);
  assert.equal(fs.readFileSync(existing, 'utf8'), 'do not overwrite');
  fs.unlinkSync(existing);
  fs.unlinkSync(path.join(stage, 'FS25-Farm-Dashboard-V5-Setup-5.0.26.exe.blockmap'));
  assert.throws(() => promoteV5Artifacts({ stageDir: stage, releaseDir, mode: 'dist', version: '5.0.26' }),
    /Verified artifact missing/);
  assert.equal(fs.readdirSync(releaseDir).length, 0);
  cleanupV5ReleaseStage(stage, releaseDir);
});

test('pack promotion refuses an existing unpacked directory, and cleanup refuses unrelated paths', (t) => {
  const { root, releaseDir } = fixture(t);
  fs.mkdirSync(releaseDir);
  const stage = createV5ReleaseStage(releaseDir);
  fs.mkdirSync(path.join(stage, 'win-unpacked'));
  fs.mkdirSync(path.join(releaseDir, 'win-unpacked'));
  assert.throws(() => promoteV5Artifacts({ stageDir: stage, releaseDir, mode: 'pack', version: '5.0.26' }),
    /already exists/);
  const unrelated = path.join(root, 'unrelated');
  fs.mkdirSync(unrelated);
  assert.throws(() => cleanupV5ReleaseStage(unrelated, releaseDir), /unexpected release staging path/);
  assert.equal(fs.existsSync(unrelated), true);
  cleanupV5ReleaseStage(stage, releaseDir);
});
