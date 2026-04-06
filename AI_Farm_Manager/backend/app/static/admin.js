(function () {
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
