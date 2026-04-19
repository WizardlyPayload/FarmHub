(function () {
  const TAB_IDS = ["overview", "clients", "farm", "bot", "hank", "mod", "logs"];

  function selectTab(name) {
    if (TAB_IDS.indexOf(name) < 0) name = "overview";
    TAB_IDS.forEach(function (tab) {
      var btn = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
      var panel = document.getElementById("panel-" + tab);
      var on = tab === name;
      if (btn) {
        btn.setAttribute("aria-selected", on ? "true" : "false");
        btn.tabIndex = on ? 0 : -1;
      }
      if (panel) panel.hidden = !on;
    });
    try {
      var u = new URL(window.location.href);
      u.searchParams.set("tab", name);
      history.replaceState(null, "", u.pathname + u.search + window.location.hash);
    } catch (_) {
      /* ignore */
    }
  }

  var initial = typeof window.__ADMIN_ACTIVE_TAB__ === "string" ? window.__ADMIN_ACTIVE_TAB__ : "overview";
  if (window.location.hash === "#bots") initial = "mod";
  selectTab(initial);

  document.querySelectorAll(".tab-btn[data-tab]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      selectTab(btn.getAttribute("data-tab") || "overview");
    });
  });

  const testBtn = document.getElementById("adminTestLlmBtn");
  const testOut = document.getElementById("adminTestLlmResult");
  if (testBtn && testOut) {
    testBtn.addEventListener("click", async function () {
      testOut.textContent = "Running consultant pipeline (Smart suggestions)…";
      testOut.className = "muted small";
      testOut.style.color = "";
      var ac = new AbortController();
      var tid = setTimeout(function () {
        ac.abort();
      }, 180000);
      try {
        var sidEl = document.getElementById("adminTestLlmServerId");
        var sid = sidEl && sidEl.value ? String(sidEl.value).trim() : "";
        var qs = new URLSearchParams();
        if (sid) qs.set("serverId", sid);
        qs.set("context", "full");
        var url = "/admin/api/test-llm?" + qs.toString();
        const r = await fetch(url, { credentials: "same-origin", signal: ac.signal });
        const raw = await r.text();
        var j = {};
        try {
          j = raw ? JSON.parse(raw) : {};
        } catch (_) {
          j = {};
        }
        if (!r.ok) {
          var errLine =
            "HTTP " +
            r.status +
            (j.detail != null ? " — " + (typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail)) : "");
          if (!j.detail && raw) {
            errLine += " — " + raw.slice(0, 200).replace(/\s+/g, " ");
          }
          testOut.textContent = errLine;
          testOut.style.color = "#fbbf24";
          return;
        }
        if (j.ok) {
          var prev = (j.insights_preview || [])[0];
          var firstMsg = prev && prev.message ? String(prev.message).slice(0, 120) : "";
          testOut.textContent =
            "OK — llm_used=" +
            j.llm_used +
            " — " +
            (j.insight_count != null ? j.insight_count + " insights" : "") +
            (j.provider ? " — " + j.provider : "") +
            (j.model ? " / " + j.model : "") +
            (firstMsg ? " — e.g. " + firstMsg + (firstMsg.length >= 120 ? "…" : "") : "");
          testOut.className = "small";
          testOut.style.color = "#6ee7b7";
        } else {
          testOut.textContent = "Failed — " + (j.detail || "unknown");
          testOut.className = "small";
          testOut.style.color = "#fbbf24";
        }
      } catch (e) {
        if (e && e.name === "AbortError") {
          testOut.textContent =
            "Timed out after 3 min — proxy or Gemini still too slow; check server logs. (Admin test skips 429 sleep; try again.)";
        } else {
          testOut.textContent = String((e && e.message) || e);
        }
        testOut.style.color = "#fbbf24";
      } finally {
        clearTimeout(tid);
      }
    });
  }

  const box = document.getElementById("logBox");
  if (!box) return;

  async function refresh() {
    try {
      const r = await fetch("/admin/api/logs?tail=200", { credentials: "same-origin" });
      if (!r.ok) return;
      const data = await r.json();
      const lines = (data.logs || []).map(function (row) {
        const extra = Object.keys(row)
          .filter(function (k) {
            return k !== "ts" && k !== "level" && k !== "message";
          })
          .map(function (k) {
            return k + "=" + JSON.stringify(row[k]);
          })
          .join(" ");
        return row.ts + " [" + row.level + "] " + row.message + (extra ? " " + extra : "");
      });
      box.textContent = lines.join("\n");
      box.scrollTop = box.scrollHeight;
    } catch (_) {
      /* ignore */
    }
  }

  refresh();
  setInterval(refresh, 2000);
})();
