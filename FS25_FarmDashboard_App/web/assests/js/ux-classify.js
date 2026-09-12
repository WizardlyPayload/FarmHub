/**
 * Shared error classification (browser UMD + Node CJS).
 * Keep in lockstep with uxContract.cjs re-exports and docs/UX-STATE-CONTRACT.md.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.farmDashUxClassify = api;
  }
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
      ? window
      : typeof self !== "undefined"
        ? self
        : this,
  function () {
    var ERROR_CODES = {
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
    };

    var NEXT_ACTION = {
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

    var SAVE_COPY = {
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
        fallback:
          "Save folder not found. Confirm the save has been loaded once with the FS25 mod enabled.",
      },
      E_PERMISSION_DENIED: {
        key: "setup.errPath",
        fallback:
          "Save folder not found. Confirm the save has been loaded once with the FS25 mod enabled.",
      },
    };

    function classifyHttpStatus(status) {
      var n = Number(status);
      if (n === 401 || n === 403) return ERROR_CODES.E_AUTH_MISSING;
      if (n === 404 || n >= 500) return ERROR_CODES.E_SERVER_OFFLINE;
      if (n === 0 || !isFinite(n)) return ERROR_CODES.E_NETWORK;
      return ERROR_CODES.E_NETWORK;
    }

    function classifyRawError(rawMsg) {
      var s = String(rawMsg || "").toLowerCase();
      if (/e_lan_timeout|lan.?timeout/.test(s)) return ERROR_CODES.E_LAN_TIMEOUT;
      if (/e_setup_local|setup is only available|local-only/.test(s)) {
        return ERROR_CODES.E_SETUP_LOCAL_ONLY;
      }
      if (/token/.test(s)) return ERROR_CODES.E_INVALID_TOKEN;
      if (/eacces|permission denied|eperm/.test(s)) return ERROR_CODES.E_PERMISSION_DENIED;
      if (/auth|unauthor|forbidden|403|401|denied|password|user/.test(s)) {
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

    function nextActionForCode(code) {
      return NEXT_ACTION[code] || "open_setup";
    }

    function saveCopyForCode(code) {
      return SAVE_COPY[code] || null;
    }

    return {
      ERROR_CODES: ERROR_CODES,
      NEXT_ACTION: NEXT_ACTION,
      classifyHttpStatus: classifyHttpStatus,
      classifyRawError: classifyRawError,
      nextActionForCode: nextActionForCode,
      saveCopyForCode: saveCopyForCode,
    };
  }
);
