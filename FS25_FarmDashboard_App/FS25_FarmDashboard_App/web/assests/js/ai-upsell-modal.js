/**
 * AI upsell / help modal — subscription portal + BYOK doc links (operator-configurable).
 *
 * Set URLs before other scripts run, e.g. in index.html:
 *   window.FARMDASH_AI_MARKETING = {
 *     portalSubscribeUrl: 'https://your-portal.example.com/subscribe',
 *     byokDocUrl: 'https://docs.example.com/byok'
 *   };
 */
(function () {
  function marketing() {
    return window.FARMDASH_AI_MARKETING || {};
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  var _lastUpsellAt = 0;
  var _lastUpsellKey = "";

  /**
   * Shared handler for consultant / Smart suggestions HTTP failures (called from field bridge + insights).
   * @param {number} status HTTP status (0 = network failure)
   * @param {string} bodyText response body (may be JSON)
   * @param {{ silent?: boolean }} opts set silent:true during background preload to avoid modal spam
   */
  function farmdashNotifyConsultantHttpError(status, bodyText, opts) {
    opts = opts || {};
    if (opts.silent) return;
    if (typeof showFarmdashAiUpsellModal !== "function") return;

    var detail = "";
    var farmErr = "";
    try {
      var j = JSON.parse(bodyText || "{}");
      if (j && j.detail) detail = String(j.detail);
      if (j && j.farmdash_ai_error) farmErr = String(j.farmdash_ai_error);
    } catch (e) {
      if (bodyText && String(bodyText).length < 600) detail = String(bodyText).trim();
    }

    var variant = "unreachable";
    if (status === 402 || status === 403 || status === 429) {
      variant = "payment";
    } else if (status === 503) {
      if (farmErr === "lan_cache_miss") variant = "lan_cache_miss";
      else variant = "not_configured";
    } else if (status === 401) {
      variant = "no_key";
    } else if (!status || status === 0) {
      variant = "unreachable";
    }

    var dedupeKey = variant + "|" + status + "|" + detail.slice(0, 120);
    var now = Date.now();
    if (now - _lastUpsellAt < 45000 && _lastUpsellKey === dedupeKey) return;
    _lastUpsellAt = now;
    _lastUpsellKey = dedupeKey;

    showFarmdashAiUpsellModal({ variant: variant, detail: detail });
  }

  window.farmdashNotifyConsultantHttpError = farmdashNotifyConsultantHttpError;

  function showFarmdashAiUpsellModal(opts) {
    opts = opts || {};
    var variant = opts.variant || "rules_only";
    var detail = opts.detail || "";

    var titleEl = document.getElementById("farmdashAiUpsellTitle");
    var bodyEl = document.getElementById("farmdashAiUpsellBody");
    var setupHint = document.getElementById("farmdashAiUpsellSetupHint");
    var subBtn = document.getElementById("farmdashAiUpsellSubscribeBtn");
    var byokBtn = document.getElementById("farmdashAiUpsellByokBtn");
    var mkt = marketing();
    var portal = String(mkt.portalSubscribeUrl || "").trim();
    var byok = String(mkt.byokDocUrl || "").trim();

    if (titleEl) {
      if (variant === "payment") {
        titleEl.textContent = "Subscription, plan limit, or BYOK";
      } else if (variant === "no_key") {
        titleEl.textContent = "Connect AI Farm Manager";
      } else if (variant === "not_configured") {
        titleEl.textContent = "AI server not configured on this PC";
      } else if (variant === "lan_cache_miss") {
        titleEl.textContent = "Open the dashboard on the host PC first";
      } else if (variant === "unreachable") {
        titleEl.textContent = "AI server unreachable";
      } else {
        titleEl.textContent = "Full AI (LLM) not used on this refresh";
      }
    }

    var parts = [];
    if (variant === "no_key") {
      parts.push(
        "<p>Enter your <strong>AI server URL</strong> and <strong>link key</strong> in <strong>AI Farm Manager</strong> (robot icon in the navbar) → <strong>Save &amp; load</strong>.</p>"
      );
      parts.push(
        "<p class=\"small text-muted mb-0\">" +
          "<strong>Premium · Hosted AI:</strong> AI server URL + link key in <strong>Settings → AI Farm Manager</strong>. " +
          "<strong>Mid · BYOK:</strong> your OpenAI/Gemini key in the same tab. " +
          "<strong>Basic · Rules:</strong> heuristics only until an LLM is configured. See the BYOK guide link if needed.</p>"
      );
    } else if (variant === "payment") {
      parts.push(
        "<p>" +
          escapeHtml(
            detail ||
              "The AI service returned a billing or quota error. Upgrade your hosted plan, or attach your own API key (BYOK) in Dashboard Settings."
          ) +
          "</p>"
      );
      parts.push(
        "<p class=\"small text-muted mb-0\">BYOK uses your key with the same AI Farm Manager backend — limits then follow your provider account.</p>"
      );
    } else if (variant === "not_configured") {
      parts.push(
        "<p>" +
          escapeHtml(
            detail ||
              "The Farm Dashboard on this PC does not have an AI server URL + link key yet."
          ) +
          "</p>"
      );
      parts.push(
        "<p class=\"mb-0\"><strong>Setup:</strong> On <strong>this PC</strong>, open Farm Dashboard → <strong>AI Farm Manager</strong> (robot) → paste <strong>Server URL</strong> + <strong>Link key</strong> → <strong>Save &amp; load</strong>. Optional: add <strong>BYOK</strong> in <strong>Settings</strong> for your own LLM key.</p>"
      );
    } else if (variant === "lan_cache_miss") {
      parts.push(
        "<p>" +
          escapeHtml(
            detail ||
              "Tablets and other devices only show <strong>cached</strong> AI insights from this PC. They do not call the LLM separately."
          ) +
          "</p>"
      );
      parts.push(
        "<p class=\"mb-0\"><strong>Fix:</strong> On the <strong>host PC</strong>, open the dashboard at <code class=\"text-light\">http://127.0.0.1:8766</code> (or localhost) so it can fetch AI once. Then reload this page — you should see the same suggestions as on the PC.</p>"
      );
    } else if (variant === "unreachable") {
      parts.push(
        "<p>" +
          escapeHtml(
            detail ||
              "Could not reach the AI Farm Manager server (network error, firewall, or the service is down)."
          ) +
          "</p>"
      );
      parts.push(
        "<p class=\"mb-0\">Check that the AI backend URL is correct, the service is running, and your link key is valid. Use <strong>hosted AI</strong> (subscribe) or <strong>BYOK</strong> if you bring your own key.</p>"
      );
    } else {
      parts.push(
        "<p>The response used <strong>Basic · Rules</strong> (heuristics) — the LLM did not run. For <strong>Premium · Hosted</strong> or <strong>Mid · BYOK</strong>, use <strong>Settings → AI Farm Manager</strong>.</p>"
      );
    }
    if (detail && variant !== "payment" && variant !== "no_key" && variant !== "not_configured" && variant !== "lan_cache_miss" && variant !== "unreachable") {
      parts.push('<p class="small text-muted mb-0">' + escapeHtml(detail) + "</p>");
    }
    if (bodyEl) bodyEl.innerHTML = parts.join("");

    if (setupHint) {
      setupHint.innerHTML =
        "<strong>Quick links:</strong> <em>Premium · Hosted</em> (URL + link key) or <em>Mid · BYOK</em> (your API key) under <strong>Settings → AI Farm Manager</strong> → Save &amp; load.";
    }

    function wireLink(btn, url, emptyTitle, activeClass) {
      activeClass = activeClass || "btn-outline-light";
      if (!btn) return;
      btn.onclick = null;
      if (url) {
        btn.href = url;
        btn.target = "_blank";
        btn.rel = "noopener noreferrer";
        btn.classList.remove("disabled", "btn-secondary", "btn-outline-light", "btn-farm-accent");
        btn.classList.add(activeClass);
        btn.removeAttribute("aria-disabled");
        btn.title = "";
      } else {
        btn.href = "#";
        btn.removeAttribute("target");
        btn.removeAttribute("rel");
        btn.classList.add("disabled", "btn-secondary");
        btn.classList.remove("btn-outline-light", "btn-farm-accent");
        btn.setAttribute("aria-disabled", "true");
        btn.title = emptyTitle;
        btn.onclick = function (e) {
          e.preventDefault();
        };
      }
    }

    wireLink(
      subBtn,
      portal,
      "Set window.FARMDASH_AI_MARKETING.portalSubscribeUrl in index.html to your subscription portal URL.",
      "btn-farm-accent"
    );
    wireLink(
      byokBtn,
      byok,
      "Set window.FARMDASH_AI_MARKETING.byokDocUrl in index.html to your BYOK help page.",
      "btn-outline-light"
    );

    var el = document.getElementById("farmdashAiUpsellModal");
    if (el && typeof bootstrap !== "undefined" && bootstrap.Modal) {
      var Modal = bootstrap.Modal;
      var instance = Modal.getOrCreateInstance
        ? Modal.getOrCreateInstance(el)
        : Modal.getInstance(el) || new Modal(el);
      instance.show();
    }
  }

  window.showFarmdashAiUpsellModal = showFarmdashAiUpsellModal;

  document.addEventListener("DOMContentLoaded", function () {
    var openRobot = document.getElementById("farmdashAiUpsellOpenRobot");
    if (openRobot) {
      openRobot.addEventListener("click", function () {
        var upsell = document.getElementById("farmdashAiUpsellModal");
        if (upsell && typeof bootstrap !== "undefined" && bootstrap.Modal) {
          var Modal = bootstrap.Modal;
          var i = Modal.getInstance(upsell);
          if (i) i.hide();
        }
        if (window.__farmDashRemoteViewer) {
          return;
        }
        var appSettings = document.getElementById("appSettingsModal");
        if (appSettings && typeof bootstrap !== "undefined" && bootstrap.Modal) {
          var M = bootstrap.Modal;
          var ri = M.getOrCreateInstance ? M.getOrCreateInstance(appSettings) : M.getInstance(appSettings) || new M(appSettings);
          ri.show();
          var aiTabBtn = document.getElementById("app-settings-tab-ai");
          if (aiTabBtn && typeof bootstrap.Tab !== "undefined") {
            var Ti = bootstrap.Tab.getOrCreateInstance ? bootstrap.Tab.getOrCreateInstance(aiTabBtn) : new bootstrap.Tab(aiTabBtn);
            Ti.show();
          }
        }
      });
    }
  });
})();
