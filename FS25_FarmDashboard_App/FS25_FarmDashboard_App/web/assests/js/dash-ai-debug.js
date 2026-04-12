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
  function _safeJson(obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (e) {
      return String(obj);
    }
  }

  g.dashAiDebug = function (label, phase, payload) {
    if (!g.DASH_DEBUG) return;
    try {
      var out = payload;
      if (payload !== undefined && phase === "response" && payload && typeof payload === "object" && payload.body !== undefined) {
        out = { body: _safeJson(payload.body), httpStatus: payload.httpStatus };
      } else if (payload !== undefined && typeof payload === "object") {
        out = _safeJson(payload);
      }
      if (phase === "request") {
        console.log("[DASH_DEBUG]", label, "→ request", out);
      } else if (phase === "response") {
        console.log("[DASH_DEBUG]", label, "→ response (full payload)", out);
      } else if (phase === "error") {
        console.warn("[DASH_DEBUG]", label, "→ error", out);
      } else {
        console.log("[DASH_DEBUG]", label, phase, out);
      }
    } catch (e) {
      /* ignore */
    }
  };

  /**
   * Run DOM writes after two animation frames so layout/paint from fetch completion is not blocked.
   */
  g.dashFlushDomWork = function (fn) {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          try {
            fn();
          } catch (e) {
            console.warn("[dashFlushDomWork]", e);
          }
        });
      });
    } else if (typeof g.dashScheduleIdle === "function") {
      g.dashScheduleIdle(fn, 50);
    } else {
      setTimeout(fn, 0);
    }
  };

  /**
   * Visible warnings for consultant failures (runs even when DASH_DEBUG is false).
   */
  g.dashReportConsultantProblem = function (sourceLabel, info) {
    var st = info && info.status;
    var llm = info && info.llm_used;
    var detail = (info && (info.detail || info.message)) || "";
    var body = (info && info.bodySnippet) || "";
    if (st === 401 || st === 403) {
      console.error(
        "[FarmDash AI]",
        sourceLabel,
        "HTTP " + st + " — Farm Dashboard link key rejected or missing on the AI server. Check FARMDASH_INTEGRATION_KEY and Save & load.",
        detail || body
      );
      return;
    }
    if (st === 503 || (typeof st === "number" && st >= 500)) {
      var msg5 =
        "[FarmDash AI] " +
        sourceLabel +
        " — optional AI endpoint HTTP " +
        st +
        " (dashboard core is unaffected).";
      if (g.DASH_DEBUG) {
        console.warn(msg5, detail || body);
      } else {
        console.debug(msg5);
      }
      return;
    }
    if (info && info.parseError) {
      if (g.DASH_DEBUG) {
        console.error("[FarmDash AI]", sourceLabel, "Response JSON parse failed:", info.parseError);
      } else {
        console.debug("[FarmDash AI]", sourceLabel, "JSON parse failed (optional AI path).");
      }
      return;
    }
    if (llm === false) {
      var msgLlm =
        "[FarmDash AI] " +
        sourceLabel +
        " — llm_used=false (heuristics only; optional LLM — configure AI host or BYOK if desired).";
      if (g.DASH_DEBUG) {
        console.warn(msgLlm, detail);
      } else {
        console.debug(msgLlm);
      }
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
