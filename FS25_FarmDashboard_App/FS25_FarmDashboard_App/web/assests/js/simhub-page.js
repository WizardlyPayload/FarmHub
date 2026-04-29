/**
 * Read-only SimHub page: polls HTTP APIs (no nav chrome).
 * Server + farm default from `/api/simhub-session` (desktop dashboard); optional `?serverId=&farmId=` override.
 */

import { buildFieldDisplayClusters, syntheticFieldFromCluster } from "./field-clusters.js";
import { t } from "./i18n/i18n.js";

function banner(msg, kind = "secondary") {
  const el = document.getElementById("simhub-banner");
  if (!el) return;
  el.className = `alert alert-${kind} py-2`;
  el.textContent = msg;
  el.classList.toggle("d-none", !msg);
}

async function resolveSimHubContext() {
  const params = new URLSearchParams(window.location.search);
  const urlSid = (params.get("serverId") || "").trim();
  const urlFarmRaw = parseInt(params.get("farmId") || "0", 10);
  const urlFarm = Number.isFinite(urlFarmRaw) && urlFarmRaw > 0 ? urlFarmRaw : 1;
  if (urlSid) {
    return { serverId: urlSid, farmId: urlFarm };
  }
  try {
    const r = await fetch("/api/simhub-session");
    const j = await r.json();
    const sid = (j.serverId || "").trim();
    const f = Math.max(1, parseInt(String(j.farmId ?? 1), 10) || 1);
    if (sid) return { serverId: sid, farmId: f };
  } catch (_) {
    /* ignore */
  }
  let serverId = "";
  try {
    const r = await fetch("/api/servers");
    const s = await r.json();
    if (Array.isArray(s) && s.length && s[0].id != null) serverId = String(s[0].id);
  } catch (_) {
    /* ignore */
  }
  return { serverId, farmId: 1 };
}

function filterFieldsForFarm(fields, activeFarmId) {
  const fid = Math.max(1, Number(activeFarmId) || 1);
  const list = Array.isArray(fields) ? fields : [];
  return list.filter((f) => Number(f?.ownerFarmId ?? f?.farmId ?? 0) === fid);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderFieldRows(rows) {
  const root = document.getElementById("simhub-root");
  if (!root) return;
  if (!rows.length) {
    root.innerHTML = `<div class="col-12 text-muted">${t(
      "simhub.noFieldRows"
    )}</div>`;
    return;
  }
  root.innerHTML = rows
    .map((f) => {
      const ha = Number(f.hectares);
      const haS = Number.isFinite(ha) && ha > 0 ? `${ha.toFixed(2)} ha` : "—";
      const crop = escapeHtml(f.fruitType || "—");
      const name = escapeHtml(f.name || `Field ${f.farmlandId ?? f.id}`);
      const nid = escapeHtml(f._displayClusterId || "");
      return `<div class="col-12 col-lg-6">
        <div class="card bg-secondary simhub-card h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between gap-2">
              <h2 class="h6 mb-1">${name}</h2>
              ${nid ? `<span class="badge bg-dark border border-secondary">${nid}</span>` : ""}
            </div>
            <div class="small text-muted mb-2">${haS} · <strong>${crop}</strong></div>
            <div class="small">${f.needsWork ? '<span class="text-warning">Needs work</span>' : ""}</div>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

function renderPastures(pastures, filterIds) {
  const root = document.getElementById("simhub-root");
  if (!root) return;
  let list = Array.isArray(pastures) ? pastures : [];
  if (filterIds.length) {
    list = list.filter((_, i) => filterIds.includes(i));
  }
  if (!list.length) {
    root.innerHTML = `<div class="col-12 text-muted">${t(
      "simhub.noPastureData"
    )}</div>`;
    return;
  }
  root.innerHTML = list
    .map((p, i) => {
      const title = escapeHtml(p.name || p.id || `Pasture ${i}`);
      return `<div class="col-12 col-md-6"><div class="card bg-secondary"><div class="card-body"><h3 class="h6">${title}</h3><pre class="small text-muted mb-0 text-wrap">${escapeHtml(
        JSON.stringify(p, null, 0).slice(0, 400)
      )}</pre></div></div></div>`;
    })
    .join("");
}

function renderProduction(prod, keys) {
  const root = document.getElementById("simhub-root");
  if (!root) return;
  const chains = prod && Array.isArray(prod.chains) ? prod.chains : [];
  let list = chains;
  if (keys.length) {
    list = chains.filter((c) => keys.includes(String(c.name || c.id || "")));
  }
  if (!list.length) {
    root.innerHTML = `<div class="col-12 text-muted">${t(
      "simhub.noProductionChains"
    )}</div>`;
    return;
  }
  root.innerHTML = list
    .map((c) => {
      const title = escapeHtml(c.name || c.id || "Chain");
      return `<div class="col-12"><div class="card bg-secondary"><div class="card-body"><h3 class="h6">${title}</h3><pre class="small text-muted mb-0">${escapeHtml(
        JSON.stringify(c, null, 0).slice(0, 800)
      )}</pre></div></div></div>`;
    })
    .join("");
}

async function tick() {
  const { serverId, farmId } = await resolveSimHubContext();
  const sidQ = serverId ? `?serverId=${encodeURIComponent(serverId)}` : "";
  let cfg;
  try {
    cfg = await fetch(`/api/simhub-view-config${sidQ}`).then((r) => r.json());
  } catch (e) {
    banner(String(e.message || e), "danger");
    return;
  }
  const sh = cfg.simHubView || {};
  if (!sh.enabled) {
    banner("SimHub is turned off in Dashboard Settings on this PC.", "warning");
    document.getElementById("simhub-root").innerHTML = "";
    return;
  }
  banner("", "secondary");
  let data;
  try {
    data = await fetch(`/api/data${sidQ}`).then((r) => r.json());
  } catch (e) {
    banner("Could not load /api/data — is the game running with the mod?", "danger");
    return;
  }
  if (data.error) {
    banner(String(data.error), "warning");
    return;
  }
  document.getElementById("simhub-updated").textContent = data.timestamp
    ? `Updated ${data.timestamp}`
    : "";

  const view = sh.view === "pastures" || sh.view === "production" ? sh.view : "fields";
  const clusterFilter = (sh.fieldClusterIds || []).map((x) => String(x).trim()).filter(Boolean);
  const pastureFilter = Array.isArray(sh.pastureIds) ? sh.pastureIds : [];
  const prodKeys = (sh.productionKeys || []).map((k) => String(k).trim()).filter(Boolean);

  if (view === "pastures") {
    renderPastures(data.pastures, pastureFilter);
    return;
  }
  if (view === "production") {
    renderProduction(data.production, prodKeys);
    return;
  }

  const rawFields = filterFieldsForFarm(data.fields || [], farmId);
  const clusters = buildFieldDisplayClusters(rawFields, cfg.fieldClusterPrefs || { autoMerge: true, manualGroups: [] });
  let rows = clusters.map((c) => syntheticFieldFromCluster(c)).filter(Boolean);
  if (clusterFilter.length) {
    rows = rows.filter((r) => clusterFilter.includes(String(r._displayClusterId || "")));
  }
  renderFieldRows(rows);
}

tick().catch((e) => banner(String(e.message || e), "danger"));
setInterval(() => tick().catch(() => {}), 12000);
