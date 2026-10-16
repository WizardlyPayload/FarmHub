import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function inside(base, target) {
  const rel = path.relative(path.resolve(base), path.resolve(target));
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}
const canonical = p => process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
function statOrMissing(p) {
  try { return fs.lstatSync(p); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
/** Inspect from the volume root, never realpath a link and adopt its target. */
export function assertSafePath(target, base, { mustExist = false, directory = false } = {}) {
  const abs = path.resolve(target);
  if (base && !inside(base, abs)) throw new Error('path must be inside allowed root');
  const parsed = path.parse(abs), parts = abs.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let cursor = parsed.root, missing = false, last = fs.lstatSync(cursor);
  if (last.isSymbolicLink()) throw new Error('linked filesystem root');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (/[\x00-\x1f:]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)) throw new Error('unsafe filesystem component');
    cursor = path.join(cursor, part);
    if (missing) continue;
    last = statOrMissing(cursor);
    if (!last) { missing = true; continue; }
    if (last.isSymbolicLink()) throw new Error('linked path refused');
    if (canonical(fs.realpathSync.native(cursor)) !== canonical(cursor)) throw new Error('reparse path refused');
    if (i < parts.length - 1 && !last.isDirectory()) throw new Error('ancestor is not a directory');
    if (i === parts.length - 1 && last.isFile() && last.nlink !== 1) throw new Error('hard-linked file refused');
  }
  if (mustExist && missing) throw new Error('missing path');
  if (!missing && directory && !last.isDirectory()) throw new Error('expected directory');
  return { path: abs, stat: missing ? null : last };
}
export function ensureDirectory(dir, base) {
  const abs = assertSafePath(dir, base, { directory: true }).path;
  const parsed = path.parse(abs);
  let cursor = parsed.root;
  for (const part of abs.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    const checked = assertSafePath(cursor, undefined, { directory: true });
    if (!checked.stat) {
      assertSafePath(path.dirname(cursor), undefined, { mustExist: true, directory: true });
      try { fs.mkdirSync(cursor); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    assertSafePath(cursor, undefined, { mustExist: true, directory: true });
  }
  return abs;
}
/** Size preflight plus bounded reads also covers growing files and misleading sizes. */
export function boundedRead(file, limit, base) {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('invalid byte limit');
  const checked = assertSafePath(file, base);
  if (!checked.stat) return null;
  if (!checked.stat.isFile()) throw new Error('expected regular file');
  if (checked.stat.size > limit) throw new Error('file-too-large');
  assertSafePath(file, base, { mustExist: true });
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.size > limit || opened.dev !== checked.stat.dev || opened.ino !== checked.stat.ino) throw new Error('file-changed-or-too-large');
    assertSafePath(file, base, { mustExist: true });
    const chunks = [];
    let total = 0;
    for (;;) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, limit + 1 - total));
      const count = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (!count) break;
      total += count;
      if (total > limit) throw new Error('file-too-large');
      chunks.push(chunk.subarray(0, count));
    }
    const after = fs.fstatSync(fd);
    const final = assertSafePath(file, base, { mustExist: true }).stat;
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs || final.ino !== opened.ino || final.dev !== opened.dev) throw new Error('file-changed-during-read');
    return Buffer.concat(chunks, total);
  } finally { fs.closeSync(fd); }
}
export function atomicFile(file, body, base, exclusive = false) {
  const checked = assertSafePath(file, base);
  if (checked.stat && (!checked.stat.isFile() || exclusive)) throw new Error('immutable file exists');
  const dir = path.dirname(file);
  ensureDirectory(dir, base);
  const tmp = path.join(dir, '.prepared-' + crypto.randomUUID() + '.tmp');
  let fd;
  try {
    assertSafePath(tmp, base);
    fd = fs.openSync(tmp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
    fs.writeFileSync(fd, body);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    assertSafePath(file, base);
    assertSafePath(tmp, base, { mustExist: true });
    if (exclusive) {
      fs.linkSync(tmp, file);
      // Removing the private temporary link is cleanup, not the commit decision.
      fs.unlinkSync(tmp);
    } else {
      fs.renameSync(tmp, file);
    }
    // No fallible operation follows a successful authority rename.
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { if (assertSafePath(tmp, base).stat) fs.unlinkSync(tmp); } catch { /* retain unsafe/locked temp for recovery */ }
  }
}
function lockCleanupDiagnostic(reason) {
  // Diagnostics are best-effort cleanup, never a new transaction outcome.
  try {
    console.warn('[recorded-publication] ' + reason + '; operation outcome preserved. Any remaining lock is retained for manual inspection; do not retry a known committed transaction.');
  } catch { /* A broken diagnostic sink must not replace the operation outcome. */ }
}
export function withRootLock(root, base, operation) {
  ensureDirectory(root, base);
  const lock = path.join(root, '.publication-lock');
  assertSafePath(lock, root);
  const fd = fs.openSync(lock, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
  let identity;
  try {
    identity = fs.fstatSync(fd);
    return operation();
  } finally {
    let closed = false;
    try { fs.closeSync(fd); closed = true; }
    catch { lockCleanupDiagnostic('lock-close-uncertain'); }
    // Do not retry close or unlink a lock with an uncertain descriptor/identity.
    if (closed) {
      if (!identity) lockCleanupDiagnostic('lock-identity-unknown');
      else {
        try {
          const st = assertSafePath(lock, root, { mustExist: true }).stat;
          if (st.ino === identity.ino && st.dev === identity.dev) fs.unlinkSync(lock);
          else lockCleanupDiagnostic('lock-ownership-changed');
        } catch { lockCleanupDiagnostic('lock-cleanup-failed'); }
      }
    }
  }
}
