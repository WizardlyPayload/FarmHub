'use strict';

/**
 * Public demo hosts: the website demo reaches this app through a tunnel that connects from loopback and
 * forwards the public Host. Such a request is a member of the public, never this PC: it may read dashboard
 * data and nothing else, and no loopback / same-machine trust applies to it.
 *
 * Matching is an exact, case-insensitive hostname with no port or :80 / :443. No wildcards, no suffixes.
 */

const lanHttpPath = require('./lanHttpPath.cjs');

const PUBLIC_DEMO_HOSTS = Object.freeze(['demo.farmdashboard.co.uk']);
const DEMO_HOST_PORTS = new Set([null, 80, 443]);

/** Read endpoints the dashboard page uses; GET/HEAD only. */
const DEMO_READ_API_PATHS = new Set([
  '/api/status',
  '/api/servers',
  '/api/data',
  '/api/animals',
  '/api/vehicles',
  '/api/fields',
  '/api/production',
  '/api/finance',
  '/api/weather',
  '/api/economy',
  '/api/farmlands',
  '/api/map-overview-image',
  '/api/map-field-outlines',
  '/api/item-image-filenames',
]);

/** Pages a demo visitor may not load even though they are not under /api. */
const DEMO_DENIED_PAGES = new Set(['/setup.html']);

const ERROR_DEMO_READ_ONLY = 'E_DEMO_READ_ONLY';

/** Strict Host header parse: `name[:port]` or `[ipv6][:port]`; null when malformed. */
function parseHostHeader(raw) {
  const s = typeof raw === 'string' ? raw : '';
  if (!s || s.length > 255) return null;
  const m = /^\[([0-9a-f:.]+)\](?::(\d{1,5}))?$/i.exec(s)
    || /^([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::(\d{1,5}))?$/i.exec(s);
  if (!m) return null;
  return { hostname: m[1].toLowerCase(), port: m[2] === undefined ? null : Number(m[2]) };
}

function isPublicDemoHost(rawHost) {
  const host = parseHostHeader(rawHost);
  if (!host || !DEMO_HOST_PORTS.has(host.port)) return false;
  return PUBLIC_DEMO_HOSTS.includes(host.hostname);
}

/** Origin a browser on a demo host sends (WebSocket upgrades carry it). */
function isPublicDemoOrigin(origin) {
  if (typeof origin !== 'string' || !origin) return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    if (u.username || u.password || (u.pathname && u.pathname !== '/')) return false;
    return isPublicDemoHost(u.host);
  } catch (_) {
    return false;
  }
}

function isDemoReadApiPath(reqPath) {
  const p = lanHttpPath.normalizeHttpPath(reqPath);
  if (DEMO_READ_API_PATHS.has(p)) return true;
  return /^\/api\/livestock\/[^/]+$/.test(p);
}

/**
 * What a demo-host request may do. Reads of dashboard data and the page shell only; every write, setup,
 * token, SimHub preference, export or unknown API path is refused.
 */
function demoRequestAllowed(method, reqPath) {
  const m = String(method || 'GET').toUpperCase();
  if (m !== 'GET' && m !== 'HEAD') return false;
  const p = lanHttpPath.normalizeHttpPath(reqPath);
  if (lanHttpPath.isApiPath(p)) return isDemoReadApiPath(p);
  return !DEMO_DENIED_PAGES.has(p);
}

/** Local paths and raw exception text never leave the machine on a demo map lookup. */
function redactMapResultForDemo(result) {
  if (!result || typeof result !== 'object') return result;
  const out = { ...result };
  delete out.sourcePath;
  delete out.modsFoldersChecked;
  if (out.ok === false && typeof out.error === 'string' && !/^[a-z0-9_]+$/.test(out.error)) {
    out.error = 'overview_failed';
  }
  return out;
}

module.exports = {
  PUBLIC_DEMO_HOSTS,
  DEMO_READ_API_PATHS,
  ERROR_DEMO_READ_ONLY,
  parseHostHeader,
  isPublicDemoHost,
  isPublicDemoOrigin,
  isDemoReadApiPath,
  demoRequestAllowed,
  redactMapResultForDemo,
};
