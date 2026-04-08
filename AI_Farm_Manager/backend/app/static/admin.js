(function () {
  const testBtn = document.getElementById("adminTestLlmBtn");
  const testOut = document.getElementById("adminTestLlmResult");
  if (testBtn && testOut) {
    testBtn.addEventListener("click", async function () {
      testOut.textContent = "Running…";
      testOut.className = "muted small";
      try {
        const r = await fetch("/admin/api/test-llm", { credentials: "same-origin" });
        const j = await r.json().catch(function () {
          return {};
        });
        if (!r.ok) {
          testOut.textContent = "HTTP " + r.status + (j.detail ? " — " + JSON.stringify(j.detail) : "");
          return;
        }
        if (j.ok) {
          testOut.textContent =
            "OK — " +
            (j.provider || "") +
            (j.latency_ms != null ? " — " + j.latency_ms + " ms" : "") +
            (j.model ? " — model " + j.model : "") +
            (j.detail ? " — reply: " + j.detail : "");
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
          .filter(function (k) { return k !== "ts" && k !== "level" && k !== "message"; })
          .map(function (k) { return k + "=" + JSON.stringify(row[k]); })
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
