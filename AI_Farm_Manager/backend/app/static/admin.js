(function () {
  const testBtn = document.getElementById("adminTestLlmBtn");
  const testOut = document.getElementById("adminTestLlmResult");
  if (testBtn && testOut) {
    testBtn.addEventListener("click", async function () {
      testOut.textContent = "Running consultant pipeline (Smart suggestions)…";
      testOut.className = "muted small";
      testOut.style.color = "";
      try {
        var sidEl = document.getElementById("adminTestLlmServerId");
        var sid = sidEl && sidEl.value ? String(sidEl.value).trim() : "";
        var qs = new URLSearchParams();
        if (sid) qs.set("serverId", sid);
        qs.set("context", "full");
        var url = "/admin/api/test-llm?" + qs.toString();
        const r = await fetch(url, { credentials: "same-origin" });
        const j = await r.json().catch(function () {
          return {};
        });
        if (!r.ok) {
          testOut.textContent = "HTTP " + r.status + (j.detail ? " — " + JSON.stringify(j.detail) : "");
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
        testOut.textContent = String(e.message || e);
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
