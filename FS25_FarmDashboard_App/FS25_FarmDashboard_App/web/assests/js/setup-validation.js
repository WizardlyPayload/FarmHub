// FS25 FarmDashboard | setup-validation.js | v3.9.0
//
// Pure helpers for setup-screen validation. Loaded as a regular browser
// script (`window.farmDashSetupValidation`) AND as a CommonJS module
// (`module.exports`) so Jest tests exercise the same `mapSaveError` logic
// that ships in setup.html. The function maps low-level save/launch
// errors to actionable, localizable copy via the caller-supplied `st`
// translator.

(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.farmDashSetupValidation = api;
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
    function passThrough(_key, params, fallback) {
      var v = String(fallback != null ? fallback : "");
      if (params && typeof params === "object") {
        for (var k in params) {
          if (Object.prototype.hasOwnProperty.call(params, k)) {
            v = v.split("{{" + k + "}}").join(String(params[k]));
          }
        }
      }
      return v;
    }

    /**
     * Map a raw save/launch error string to actionable copy.
     * @param {string} rawMsg
     * @param {(key: string, params?: any, fallback?: string) => string} [st]
     */
    function mapSaveError(rawMsg, st) {
      var translate = typeof st === "function" ? st : passThrough;
      var s = String(rawMsg || "").toLowerCase();
      if (
        /econn|enotfound|etimedout|timeout|unreachable|refused|network/i.test(s)
      ) {
        return translate(
          "setup.errNetwork",
          null,
          "Server unreachable. Check the host and port and confirm the dedicated server or FTP service is running."
        );
      }
      if (/auth|unauthor|forbidden|403|401|denied|password|user/i.test(s)) {
        return translate(
          "setup.errAuth",
          null,
          "Username or password rejected by the server."
        );
      }
      if (/enoent|not.?found|missing|path|directory|folder/i.test(s)) {
        return translate(
          "setup.errPath",
          null,
          "Save folder not found. Confirm the save has been loaded once with the FS25 mod enabled."
        );
      }
      if (/token/i.test(s)) {
        return translate(
          "setup.errToken",
          null,
          "Setup token expired. Reload this page and try again."
        );
      }
      return translate(
        "setup.toastCouldNotSave",
        { msg: rawMsg },
        "Could not save: " + rawMsg
      );
    }

    /**
     * Determine which FTP fields are missing on a payload-like object.
     * Returns an array of field ids that should be marked invalid.
     */
    function findMissingFtpFields(srv) {
      var s = srv || {};
      var missing = [];
      if (!s.ftpHost) missing.push("ftpHost");
      if (!s.ftpUser) missing.push("ftpUser");
      if (!s.ftpPass) missing.push("ftpPass");
      return missing;
    }

    return {
      mapSaveError: mapSaveError,
      findMissingFtpFields: findMissingFtpFields,
    };
  }
);
