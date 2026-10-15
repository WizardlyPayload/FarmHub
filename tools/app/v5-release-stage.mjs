import fs from 'node:fs';
import path from 'node:path';

const STAGE_PREFIX = '.farmdash-v5-stage-';

function assertReleaseDirectory(releaseDir) {
  const resolved = path.resolve(releaseDir);
  if (fs.existsSync(resolved) && (fs.lstatSync(resolved).isSymbolicLink()
      || !fs.lstatSync(resolved).isDirectory())) {
    throw new Error(`[FarmDash V5] Linked or non-directory release path refused: ${resolved}`);
  }
  const parent = path.dirname(resolved);
  if (!fs.existsSync(parent) || fs.lstatSync(parent).isSymbolicLink()
      || !fs.lstatSync(parent).isDirectory()) {
    throw new Error(`[FarmDash V5] Unsafe release parent: ${parent}`);
  }
  return { resolved, parent };
}

function assertOwnedStage(stageDir, releaseDir) {
  const { parent } = assertReleaseDirectory(releaseDir);
  const stage = path.resolve(stageDir);
  if (!fs.existsSync(stage) || fs.lstatSync(stage).isSymbolicLink()
      || !fs.lstatSync(stage).isDirectory()
      || path.dirname(fs.realpathSync(stage)) !== fs.realpathSync(parent)
      || !path.basename(stage).startsWith(STAGE_PREFIX)) {
    throw new Error(`[FarmDash V5] Refusing unexpected release staging path: ${stage}`);
  }
  return stage;
}

export function createV5ReleaseStage(releaseDir) {
  const { parent } = assertReleaseDirectory(releaseDir);
  const stage = fs.mkdtempSync(path.join(parent, STAGE_PREFIX));
  assertOwnedStage(stage, releaseDir);
  return stage;
}

export function cleanupV5ReleaseStage(stageDir, releaseDir) {
  if (!stageDir || !fs.existsSync(stageDir)) return;
  const stage = assertOwnedStage(stageDir, releaseDir);
  fs.rmSync(stage, { recursive: true, force: true });
}

export function promoteV5Artifacts({ stageDir, releaseDir, mode, version }) {
  const stage = assertOwnedStage(stageDir, releaseDir);
  const { resolved: release } = assertReleaseDirectory(releaseDir);
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) throw new Error('[FarmDash V5] Invalid candidate version');
  if (mode !== 'dist' && mode !== 'pack') throw new Error('[FarmDash V5] Invalid promotion mode');

  if (mode === 'pack') {
    const unpacked = path.join(stage, 'win-unpacked');
    if (!fs.existsSync(unpacked) || fs.lstatSync(unpacked).isSymbolicLink()
        || !fs.lstatSync(unpacked).isDirectory()) throw new Error('[FarmDash V5] Verified unpacked output missing');
    fs.mkdirSync(release, { recursive: true });
    const target = path.join(release, 'win-unpacked');
    if (fs.existsSync(target)) throw new Error('[FarmDash V5] win-unpacked already exists; refusing overwrite');
    fs.renameSync(unpacked, target);
    return { promoted: ['win-unpacked'], updateMetadataPromoted: false };
  }

  const installer = `FS25-Farm-Dashboard-V5-Setup-${version}.exe`;
  const blockmap = `${installer}.blockmap`;
  const metadata = 'latest-rf.yml';
  for (const name of [installer, blockmap, metadata]) {
    const full = path.join(stage, name);
    if (!fs.existsSync(full) || fs.lstatSync(full).isSymbolicLink()
        || !fs.lstatSync(full).isFile()) throw new Error(`[FarmDash V5] Verified artifact missing: ${name}`);
  }
  if (fs.existsSync(release)) {
    for (const name of [installer, blockmap]) {
      if (fs.existsSync(path.join(release, name))) {
        throw new Error(`[FarmDash V5] Refusing to overwrite existing artifact: ${name}`);
      }
    }
  }
  fs.mkdirSync(release, { recursive: true });
  const promoted = [];
  try {
    for (const name of [installer, blockmap]) {
      fs.linkSync(path.join(stage, name), path.join(release, name));
      promoted.push(name);
    }
    // Candidate packaging is not a release decision: never overwrite a live update feed.
    if (!fs.existsSync(path.join(release, metadata))) {
      fs.linkSync(path.join(stage, metadata), path.join(release, metadata));
      promoted.push(metadata);
    }
    return { promoted, updateMetadataPromoted: promoted.includes(metadata) };
  } catch (error) {
    for (const name of promoted.reverse()) fs.unlinkSync(path.join(release, name));
    throw error;
  }
}
