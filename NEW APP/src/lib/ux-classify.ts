/**
 * Shared error classification (NEW APP). Keep in lockstep with
 * FS25_FarmDashboard_App/web/assests/js/ux-classify.js.
 */

export const ERROR_CODES = {
  E_CONFIG_INCOMPLETE: "E_CONFIG_INCOMPLETE",
  E_AUTH_MISSING: "E_AUTH_MISSING",
  E_INVALID_TOKEN: "E_INVALID_TOKEN",
  E_LAN_BLOCKED: "E_LAN_BLOCKED",
  E_LAN_TIMEOUT: "E_LAN_TIMEOUT",
  E_SETUP_LOCAL_ONLY: "E_SETUP_LOCAL_ONLY",
  E_SERVER_OFFLINE: "E_SERVER_OFFLINE",
  E_LUA_STALE: "E_LUA_STALE",
  E_MOD_MISSING: "E_MOD_MISSING",
  E_MOD_OUTDATED: "E_MOD_OUTDATED",
  E_PATH_DENIED: "E_PATH_DENIED",
  E_PERMISSION_DENIED: "E_PERMISSION_DENIED",
  E_CACHE_FALLBACK: "E_CACHE_FALLBACK",
  E_NETWORK: "E_NETWORK",
  E_SAVE_FAILED: "E_SAVE_FAILED",
} as const;

export const NEXT_ACTION: Record<string, string> = {
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

const SAVE_COPY: Record<string, { key: string; fallback: string }> = {
  E_INVALID_TOKEN: {
    key: "setup.errToken",
    fallback: "Setup token expired. Reload this page and try again.",
  },
  E_AUTH_MISSING: {
    key: "setup.errAuth",
    fallback: "Username or password rejected by the server.",
  },
  E_SERVER_OFFLINE: {
    key: "setup.errNetwork",
    fallback:
      "Server unreachable. Check the host and port and confirm the dedicated server or FTP service is running.",
  },
  E_NETWORK: {
    key: "setup.errNetwork",
    fallback:
      "Server unreachable. Check the host and port and confirm the dedicated server or FTP service is running.",
  },
  E_LAN_TIMEOUT: {
    key: "setup.errLanTimeout",
    fallback:
      "LAN login did not finish in time. Check Wi‑Fi, confirm the PC app is running, then retry.",
  },
  E_SETUP_LOCAL_ONLY: {
    key: "setup.errLocalOnly",
    fallback: "Setup is only available on the PC running Farm Dashboard.",
  },
  E_PATH_DENIED: {
    key: "setup.errPath",
    fallback: "Save folder not found. Confirm the save has been loaded once with the FS25 mod enabled.",
  },
  E_PERMISSION_DENIED: {
    key: "setup.errPath",
    fallback: "Save folder not found. Confirm the save has been loaded once with the FS25 mod enabled.",
  },
};

export function classifyHttpStatus(status: number): string {
  const n = Number(status);
  if (n === 401 || n === 403) return ERROR_CODES.E_AUTH_MISSING;
  if (n === 404 || n >= 500) return ERROR_CODES.E_SERVER_OFFLINE;
  if (n === 0 || !Number.isFinite(n)) return ERROR_CODES.E_NETWORK;
  return ERROR_CODES.E_NETWORK;
}

export function classifyRawError(rawMsg: string | null | undefined): string {
  const s = String(rawMsg || "").toLowerCase();
  if (/e_lan_timeout|lan.?timeout/.test(s)) return ERROR_CODES.E_LAN_TIMEOUT;
  if (/e_setup_local|setup is only available|local-only/.test(s)) {
    return ERROR_CODES.E_SETUP_LOCAL_ONLY;
  }
  if (/\benoent\b|\benotdir\b/.test(s)) return ERROR_CODES.E_PATH_DENIED;
  if (/token/.test(s)) return ERROR_CODES.E_INVALID_TOKEN;
  if (/eacces|permission denied|eperm/.test(s)) return ERROR_CODES.E_PERMISSION_DENIED;
  if (/auth|unauthor|forbidden|403|401|denied|password/.test(s)) {
    return ERROR_CODES.E_AUTH_MISSING;
  }
  if (/econn|enotfound|etimedout|timeout|unreachable|refused|network/.test(s)) {
    return ERROR_CODES.E_SERVER_OFFLINE;
  }
  if (/enoent|not.?found|missing|path|directory|folder/.test(s)) {
    return ERROR_CODES.E_PATH_DENIED;
  }
  if (/stale|lua/.test(s)) return ERROR_CODES.E_LUA_STALE;
  return ERROR_CODES.E_SAVE_FAILED;
}

export function nextActionForCode(code: string | null | undefined): string {
  return NEXT_ACTION[String(code || "")] || "open_setup";
}

export function saveCopyForCode(code: string | null | undefined): { key: string; fallback: string } | null {
  return SAVE_COPY[String(code || "")] || null;
}

export function mapSaveError(
  rawMsg: string,
  translate: (key: string, params?: Record<string, string | number> | null, fallback?: string) => string,
): string {
  const code = classifyRawError(rawMsg);
  const copy = saveCopyForCode(code);
  if (copy) return translate(copy.key, null, copy.fallback);
  return translate("setup.toastCouldNotSave", { msg: rawMsg }, `Could not save: ${rawMsg}`);
}
