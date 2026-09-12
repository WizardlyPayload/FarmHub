'use strict';

/**
 * LAN HTTP path matching — must use the same semantics as Express (case-insensitive
 * routing, optional trailing slashes). Do not compare raw req.path prefixes.
 */

function normalizeHttpPath(reqPath) {
  let p = String(reqPath || '').split('?')[0] || '';
  try {
    p = decodeURIComponent(p);
  } catch (_) {
    /* keep raw */
  }
  p = p.replace(/\\/g, '/');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  if (!p.startsWith('/')) p = `/${p}`;
  return p.toLowerCase();
}

const PUBLIC_GET_PATHS = new Set(['/api/status']);

/** Paths that always require LAN Basic (or this-machine) even when lanAuthOptional is on. */
const SENSITIVE_EXACT = new Set([
  '/api/lan-ws-token',
  '/api/setup-config',
  '/api/data',
  '/api/animals',
  '/api/vehicles',
  '/api/fields',
  '/api/production',
  '/api/finance',
  '/api/weather',
  '/api/economy',
  '/api/farmlands',
  '/api/simhub-view-config',
  '/api/simhub-session',
  '/api/servers',
  '/api/livestock',
  '/api/setup-status',
  '/api/setup-handshake',
]);

function isPublicUnauthenticatedGetPath(reqPath) {
  const p = normalizeHttpPath(reqPath);
  return PUBLIC_GET_PATHS.has(p);
}

function isApiPath(reqPath) {
  const p = normalizeHttpPath(reqPath);
  return p === '/api' || p.startsWith('/api/');
}

function isLanSensitiveHttpPath(reqPath) {
  const p = normalizeHttpPath(reqPath);
  if (!p.startsWith('/api/')) return false;
  if (SENSITIVE_EXACT.has(p)) return true;
  if (p.startsWith('/api/livestock/')) return true;
  return false;
}

/**
 * GET/HEAD of the dashboard shell (HTML/JS/CSS) may skip Basic so the login overlay can load.
 * All /api/* except /api/status require credentials unless lanAuthOptional and the path is not sensitive.
 */
function maySkipLanBasicForGet(reqPath, lanAuthOptional) {
  const p = normalizeHttpPath(reqPath);
  if (!isApiPath(p) || isPublicUnauthenticatedGetPath(p)) return true;
  if (lanAuthOptional && !isLanSensitiveHttpPath(p)) return true;
  return false;
}

module.exports = {
  normalizeHttpPath,
  isPublicUnauthenticatedGetPath,
  isApiPath,
  isLanSensitiveHttpPath,
  maySkipLanBasicForGet,
};
