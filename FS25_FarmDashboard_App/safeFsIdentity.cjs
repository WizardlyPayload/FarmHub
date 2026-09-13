'use strict';

const path = require('path');

const SAVE_SLOT_RE = /^(mirror_)?savegame([1-9]\d{0,2})$/i;
const ID_SCHEMES = new Set(['integer-v1', 'composite-v1']);
const MAP_SLUG_RE = /^[A-Za-z0-9._-]{1,96}$/;

function sanitizeSaveSlot(raw, fallback) {
  const fb = fallback && SAVE_SLOT_RE.test(String(fallback)) ? String(fallback) : 'savegame1';
  const s = String(raw || '').trim();
  if (!SAVE_SLOT_RE.test(s)) return fb;
  return s.replace(/\\/g, '/');
}

function isMirrorSaveSlot(raw) {
  return /^mirror_/i.test(String(raw || '').trim());
}

/** Dedicated-server slot name after stripping a join-as-client mirror_ prefix. Never use this to open a local SP folder. */
function dedicatedSlotName(raw) {
  const s = sanitizeSaveSlot(raw, 'savegame1');
  return s.replace(/^mirror_/i, '');
}

function sanitizeIdScheme(raw) {
  const s = String(raw || '').trim();
  return ID_SCHEMES.has(s) ? s : 'integer-v1';
}

function sanitizeMapSlug(raw) {
  const s = String(raw || '').trim().replace(/\\/g, '/');
  if (!s || s.includes('..') || s.includes('/') || !MAP_SLUG_RE.test(s)) return null;
  return s;
}

function assertPathInsideRoot(resolvedPath, rootDir) {
  const root = path.resolve(String(rootDir || ''));
  const target = path.resolve(String(resolvedPath || ''));
  const rel = path.relative(root, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    const err = new Error('path_outside_root');
    err.code = 'PATH_OUTSIDE_ROOT';
    throw err;
  }
  return target;
}

function joinContained(rootDir, ...segments) {
  const root = path.resolve(String(rootDir || ''));
  const joined = path.resolve(root, ...segments.map((s) => String(s || '')));
  return assertPathInsideRoot(joined, root);
}

module.exports = {
  SAVE_SLOT_RE,
  sanitizeSaveSlot,
  isMirrorSaveSlot,
  dedicatedSlotName,
  sanitizeIdScheme,
  sanitizeMapSlug,
  assertPathInsideRoot,
  joinContained,
};
