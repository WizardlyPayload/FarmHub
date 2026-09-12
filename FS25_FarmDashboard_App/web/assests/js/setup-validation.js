// FS25 FarmDashboard | setup-validation.js | v3.9.0
//
// Thin shim: classification lives in ux-classify.js. This file formats
// setup save/launch copy and FTP field checks. Loaded as a browser script
// (`window.farmDashSetupValidation`) AND as a CommonJS module for Jest.

(function (root, factory) {
  var classify =
    (typeof require === "function"
      ? (function () {
          try {
            return require("./ux-classify.js");
          } catch (_) {
            return null;
          }
        })()
      : null) ||
    (root && root.farmDashUxClassify) ||
    null;
  var api = factory(classify);
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
  function (classify) {
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

    function classifyError(rawMsg) {
      if (classify && typeof classify.classifyRawError === "function") {
        return classify.classifyRawError(rawMsg);
      }
      return "E_SAVE_FAILED";
    }

    function recoveryActionForCode(code) {
      if (classify && typeof classify.nextActionForCode === "function") {
        return classify.nextActionForCode(code);
      }
      return "open_setup";
    }

    /**
     * Map a raw save/launch error string to actionable copy.
     * Classification is shared; this only picks the setup translation key.
     * @param {string} rawMsg
     * @param {(key: string, params?: any, fallback?: string) => string} [st]
     */
    function mapSaveError(rawMsg, st) {
      var translate = typeof st === "function" ? st : passThrough;
      var code = classifyError(rawMsg);
      var copy =
        classify && typeof classify.saveCopyForCode === "function"
          ? classify.saveCopyForCode(code)
          : null;
      if (copy) {
        return translate(copy.key, null, copy.fallback);
      }
      return translate(
        "setup.toastCouldNotSave",
        { msg: rawMsg },
        "Could not save: " + rawMsg
      );
    }

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
      classifyError: classifyError,
      recoveryActionForCode: recoveryActionForCode,
    };
  }
);
