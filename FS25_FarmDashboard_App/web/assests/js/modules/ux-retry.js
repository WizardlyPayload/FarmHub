/** Central retry delays for classic UI. Classification delegates to ux-classify.js. */

export const UX_RETRY = {
  maxAttempts: 3,
  baseDelayMs: 400,
  maxDelayMs: 2500,
  jitterRatio: 0.25,
};

function getUxClassify() {
  if (typeof globalThis !== "undefined" && globalThis.farmDashUxClassify) {
    return globalThis.farmDashUxClassify;
  }
  try {
    if (typeof require === "function") {
      return require("../ux-classify.js");
    }
  } catch (_) {
    /* browser ESM has no require */
  }
  return null;
}

export function classifyHttpStatus(status) {
  const api = getUxClassify();
  if (api && typeof api.classifyHttpStatus === "function") {
    return api.classifyHttpStatus(status);
  }
  const n = Number(status);
  if (n === 401 || n === 403) return "E_AUTH_MISSING";
  if (n === 404 || n >= 500) return "E_SERVER_OFFLINE";
  return "E_NETWORK";
}

export function shouldAutoRetry(code) {
  return code === "E_SERVER_OFFLINE" || code === "E_NETWORK";
}

export function nextRetryDelayMs(attempt, random = Math.random) {
  const n = Math.max(0, Number(attempt) || 0);
  const exp = Math.min(UX_RETRY.maxDelayMs, UX_RETRY.baseDelayMs * 2 ** n);
  const jitter = exp * UX_RETRY.jitterRatio * Number(random());
  return Math.round(exp + jitter);
}

export function classifyRawError(rawMsg) {
  const api = getUxClassify();
  if (api && typeof api.classifyRawError === "function") {
    return api.classifyRawError(rawMsg);
  }
  const s = String(rawMsg || "").toLowerCase();
  if (/e_lan_timeout|lan.?timeout/.test(s)) return "E_LAN_TIMEOUT";
  if (/e_setup_local|setup is only available|local-only/.test(s)) return "E_SETUP_LOCAL_ONLY";
  if (/token/.test(s)) return "E_INVALID_TOKEN";
  if (/eacces|permission denied|eperm/.test(s)) return "E_PERMISSION_DENIED";
  if (/auth|unauthor|forbidden|403|401|denied|password|user/.test(s)) return "E_AUTH_MISSING";
  if (/econn|enotfound|etimedout|timeout|unreachable|refused|network/.test(s)) return "E_SERVER_OFFLINE";
  if (/enoent|not.?found|missing|path|directory|folder/.test(s)) return "E_PATH_DENIED";
  if (/stale|lua/.test(s)) return "E_LUA_STALE";
  return "E_SAVE_FAILED";
}

export const RECOVERY =
  (typeof globalThis !== "undefined" && globalThis.farmDashUxClassify && globalThis.farmDashUxClassify.NEXT_ACTION) || {
    E_CONFIG_INCOMPLETE: "add_server",
    E_AUTH_MISSING: "open_setup",
    E_INVALID_TOKEN: "reset_token",
    E_LAN_BLOCKED: "enable_firewall",
    E_LAN_TIMEOUT: "rehandshake",
    E_SETUP_LOCAL_ONLY: "open_setup",
    E_SERVER_OFFLINE: "start_game",
    E_LUA_STALE: "restart_game",
    E_MOD_MISSING: "check_mod",
    E_MOD_OUTDATED: "check_mod",
    E_PATH_DENIED: "verify_save_slot",
    E_PERMISSION_DENIED: "verify_save_slot",
    E_CACHE_FALLBACK: "rehandshake",
    E_NETWORK: "rehandshake",
    E_SAVE_FAILED: "open_setup",
  };

export function nextActionForCode(code) {
  const api = getUxClassify();
  if (api && typeof api.nextActionForCode === "function") {
    return api.nextActionForCode(code);
  }
  return RECOVERY[code] || "open_setup";
}
