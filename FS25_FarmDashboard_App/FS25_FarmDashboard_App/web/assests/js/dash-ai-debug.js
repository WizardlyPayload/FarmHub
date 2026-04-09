/**
 * Performance / connectivity audit helpers.
 *
 * In DevTools:  window.DASH_DEBUG = true
 * Then refresh the page or click Refresh on AI panels — console shows full AI request/response (keys redacted).
 */
(function (g) {
  if (typeof g.DASH_DEBUG === "undefined") {
    g.DASH_DEBUG = false;
  }

  /**
   * Run work after the browser is idle (or soon, via timeout cap) so layout/paint stay smooth.
   */
  g.dashScheduleIdle = function (fn, timeoutMs) {
    var t = timeoutMs != null ? timeoutMs : 2000;
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(
        function () {
          try {
            fn();
          } catch (e) {
            console.warn("[dashScheduleIdle]", e);
          }
        },
        { timeout: t }
      );
    } else {
      setTimeout(fn, 0);
    }
  };

  /**
   * Verbose AI fetch logging when DASH_DEBUG is true (full URL + redacted headers + body or error).
   */
  g.dashAiDebug = function (label, phase, payload) {
    if (!g.DASH_DEBUG) return;
    try {
      if (phase === "request") {
        console.log("[DASH_DEBUG]", label, "→ request", payload);
      } else if (phase === "response") {
        console.log("[DASH_DEBUG]", label, "→ response", payload);
      } else if (phase === "error") {
        console.warn("[DASH_DEBUG]", label, "→ error", payload);
      } else {
        console.log("[DASH_DEBUG]", label, phase, payload);
      }
    } catch (e) {
      /* ignore */
    }
  };

  g.dashRedactHeaders = function (h) {
    if (!h || typeof h !== "object") return h;
    var o = {};
    for (var k in h) {
      if (!Object.prototype.hasOwnProperty.call(h, k)) continue;
      var lk = String(k).toLowerCase();
      if (lk === "x-farmdash-key" || lk === "x-ai-api-key") {
        o[k] = "(redacted)";
      } else {
        o[k] = h[k];
      }
    }
    return o;
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
