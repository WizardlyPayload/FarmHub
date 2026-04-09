// FS25 FarmDashboard | dashboard-settings.js | v2.0.0
// Dashboard Settings modal: visible main-menu sections + edit FS25 mod config.xml locally.

import { t } from "../i18n/i18n.js";

const SECTION_KEYS = [
  "livestock",
  "vehicles",
  "fields",
  "economy",
  "pastures",
  "productions",
];

const DEFAULT_SECTION_VISIBILITY = SECTION_KEYS.reduce((acc, k) => {
  acc[k] = true;
  return acc;
}, {});

export function isDashboardSectionEnabled(name) {
  const v = this.sectionVisibility;
  if (!v) return true;
  return v[name] !== false;
}

export async function loadDashboardUiPreferences() {
  try {
    const { ipcRenderer } = require("electron");
    const prefs = await ipcRenderer.invoke("get-ui-preferences");
    this.sectionVisibility = {
      ...DEFAULT_SECTION_VISIBILITY,
      ...(prefs?.sections || {}),
    };
  } catch (e) {
    console.warn("[dashboard-settings] load UI prefs", e);
    this.sectionVisibility = { ...DEFAULT_SECTION_VISIBILITY };
  }
  this.applyDashboardSectionVisibility();
}

export function applyDashboardSectionVisibility() {
  const vis = this.sectionVisibility || DEFAULT_SECTION_VISIBILITY;
  document.querySelectorAll("[data-dashboard-section]").forEach((el) => {
    const sec = el.getAttribute("data-dashboard-section");
    if (!sec) return;
    const on = vis[sec] !== false;
    el.classList.toggle("d-none", !on);
  });
}

function collectFieldExclusionsFromForm() {
  const container = document.getElementById("settings-field-exclusions");
  if (!container) return {};
  const byServer = {};
  const inputs = container.querySelectorAll("input[data-exclude-server][data-exclude-farmland]");
  inputs.forEach((cb) => {
    const sid = cb.getAttribute("data-exclude-server");
    if (!sid) return;
    if (!byServer[sid]) byServer[sid] = [];
    if (cb.checked) {
      const fid = parseInt(cb.getAttribute("data-exclude-farmland"), 10);
      if (!Number.isNaN(fid)) byServer[sid].push(fid);
    }
  });
  const serversInForm = container.querySelectorAll("[data-field-exclusion-server]");
  serversInForm.forEach((wrap) => {
    const sid = wrap.getAttribute("data-field-exclusion-server");
    if (sid && byServer[sid] === undefined) byServer[sid] = [];
  });
  return byServer;
}

export function setupDashboardSettingsModal() {
  const modalEl = document.getElementById("dashboardSettingsModal");
  if (!modalEl) return;

  modalEl.addEventListener("show.bs.modal", () => {
    this.populateDashboardSettingsForm();
  });

  const saveBtn = document.getElementById("dashboard-settings-save-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => this.saveDashboardSettingsFromModal());
  }
}

function escAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Live check for Dashboard Settings → AI section (same logic as AI Farm Manager status). */
async function refreshSettingsAiConnectionStatus() {
  const el = document.getElementById("settings-ai-connection-status");
  if (!el) return;
  el.className = "alert small py-2 mb-3";
  el.innerHTML = '<span class="text-muted">Checking connection to AI server…</span>';
  try {
    const { ipcRenderer } = require("electron");
    const c = await ipcRenderer.invoke("get-ai-manager-connection");
    const base = (c?.baseUrl || "").replace(/\/$/, "");
    const key = (c?.integrationKey || "").trim();
    if (!base) {
      el.classList.add("alert-secondary");
      el.innerHTML =
        "<strong>AI server URL missing.</strong> Open <strong>AI Farm Manager</strong> (robot icon) and paste the <code>https://…</code> address from your host.";
      return;
    }
    if (!key) {
      el.classList.add("alert-secondary");
      el.innerHTML =
        "<strong>Link key missing.</strong> Paste the secret <strong>link key</strong> from your host in AI Farm Manager, then <strong>Save &amp; load</strong>.";
      return;
    }
    if (typeof globalThis.pipelineLog === "function") {
      globalThis.pipelineLog("renderer_out", "GET /api/integration/overview (Dashboard Settings)", { base });
    }
    const r = await fetch(base + "/api/integration/overview", {
      headers: { "X-FarmDash-Key": encodeURIComponent(key) },
    });
    if (typeof globalThis.pipelineLog === "function") {
      globalThis.pipelineLog("renderer_out", "integration/overview response (settings)", { httpStatus: r.status });
    }
    if (!r.ok) {
      el.classList.add("alert-warning");
      el.innerHTML =
        "<strong>Cannot reach AI server</strong> (HTTP " +
        r.status +
        "). Check URL, link key, and that the server is online.";
      return;
    }
    const data = await r.json();
    const push = data.farmDashboardPushMode;
    const fd = data.farmDashboardServers || [];
    const fdErr = data.farmDashboardError;
    const n = fd.length;
    if (push) {
      if (n > 0) {
        el.classList.add("alert-success");
        el.innerHTML =
          "<strong>Farm data:</strong> syncing — Smart suggestions should work. Use <strong>Refresh</strong> on the suggestions card if needed.";
      } else {
        el.classList.add("alert-warning");
        el.innerHTML =
          "<strong>Farm data:</strong> not received yet. In AI Farm Manager keep <strong>Send farm data</strong> on, click <strong>Save &amp; load</strong>. Your host must set <code>DASHBOARD_PUSH_MODE=1</code> on the AI server.";
      }
    } else if (fdErr) {
      el.classList.add("alert-warning");
      el.innerHTML =
        "<strong>Farm data:</strong> the AI server is not set up to read your dashboard. Your host must enable push mode or configure a dashboard URL — see the yellow banner in AI Farm Manager.";
    } else {
      el.classList.add("alert-success");
      el.innerHTML =
        "<strong>Farm data:</strong> linked (" + n + " save(s) visible to the server).";
    }
  } catch (e) {
    if (typeof globalThis.pipelineLog === "function") {
      globalThis.pipelineLog("renderer_err", "integration/overview (settings) failed", {
        error: String(e?.message || e),
      });
    }
    el.classList.add("alert-secondary");
    el.innerHTML =
      "Could not check (offline?). Open <strong>AI Farm Manager</strong> → <strong>Test dashboard → LLM</strong> to verify the link.";
  }
}

export async function populateDashboardSettingsForm() {
  const { ipcRenderer } = require("electron");

  await this.loadDashboardUiPreferences();

  SECTION_KEYS.forEach((key) => {
    const el = document.getElementById(`settings-section-${key}`);
    if (el) el.checked = this.sectionVisibility?.[key] !== false;
  });

  const exContainer = document.getElementById("settings-field-exclusions");
  if (exContainer) {
    try {
      const farmId = Number(this.activeFarmId ?? 1);
      const opt = await ipcRenderer.invoke("get-field-exclusion-options", {
        activeFarmId: farmId,
      });
      const rows = opt?.rows || [];
      if (rows.length === 0) {
        exContainer.innerHTML = `<p class="text-muted small mb-0">${escHtml(t("settings.fieldExclusionEmpty"))}</p>`;
      } else {
        const by = new Map();
        for (const r of rows) {
          if (!by.has(r.serverId)) by.set(r.serverId, { name: r.serverName, items: [] });
          by.get(r.serverId).items.push(r);
        }
        let html = "";
        for (const [sid, { name, items }] of by) {
          const safeSid = String(sid).replace(/[^a-zA-Z0-9_-]/g, "_");
          html += `<div class="mb-2 border border-secondary rounded p-2 bg-black bg-opacity-25" data-field-exclusion-server="${escAttr(sid)}">`;
          html += `<div class="fw-semibold text-light mb-1">${escHtml(name)} <span class="text-muted fw-normal small">(${escHtml(String(sid))})</span></div>`;
          for (const it of items) {
            const fid = it.farmlandId;
            const cid = `settings-exclude-${safeSid}-${fid}`;
            const ha = typeof it.hectares === "number" ? it.hectares.toFixed(2) : "";
            const sub = ha ? ` · ${ha} ha` : "";
            html += `<div class="form-check ms-1 py-1">`;
            html += `<input class="form-check-input" type="checkbox" id="${cid}" data-exclude-server="${escAttr(sid)}" data-exclude-farmland="${fid}" ${it.excluded ? "checked" : ""}/>`;
            html += `<label class="form-check-label" for="${cid}">${escHtml(it.label)} <span class="text-muted">(#${fid})${escHtml(sub)}</span> — <span class="text-warning">${escHtml(t("settings.fieldExclusionHide"))}</span></label>`;
            html += `</div>`;
          }
          html += `</div>`;
        }
        exContainer.innerHTML = html;
      }
    } catch (e) {
      console.warn("[dashboard-settings] field exclusions", e);
      exContainer.innerHTML = `<p class="text-muted small mb-0">${escHtml(t("settings.fieldExclusionEmpty"))}</p>`;
    }
  }

  try {
    const mod = await ipcRenderer.invoke("get-mod-config");
    const pathEl = document.getElementById("settings-mod-config-path");
    if (pathEl) pathEl.textContent = mod.path || "—";

    const ui = document.getElementById("settings-mod-update-interval");
    if (ui) ui.value = String(mod.updateInterval ?? 10000);
    const cc = document.getElementById("settings-mod-collection-cycle");
    if (cc) cc.value = String(mod.collectionCycleMs ?? 60000);

    const M = mod.modules || {};
    const modKeys = [
      "animals",
      "vehicles",
      "weather",
      "fields",
      "finance",
      "economy",
      "production",
    ];
    modKeys.forEach((k) => {
      const el = document.getElementById(`settings-mod-${k}`);
      if (el) el.checked = M[k] !== false;
    });
  } catch (e) {
    console.warn("[dashboard-settings] mod config", e);
  }

  const byokClear = document.getElementById("settings-consultant-byok-clear");
  const byokKey = document.getElementById("settings-consultant-byok-key");
  const byokProv = document.getElementById("settings-consultant-byok-provider");
  if (byokClear || byokKey || byokProv) {
    if (byokClear) byokClear.checked = false;
    if (byokKey) byokKey.value = "";
    try {
      const meta = await ipcRenderer.invoke("get-consultant-byok-meta");
      if (byokProv) {
        byokProv.value = meta?.provider === "gemini" ? "gemini" : "openai";
      }
      if (byokKey && meta?.hasKey) {
        byokKey.placeholder = "Leave blank to keep saved key (••••••••)";
      } else if (byokKey) {
        byokKey.placeholder = "Paste API key to enable VPS consultant LLM";
      }
    } catch (e) {
      console.warn("[dashboard-settings] consultant BYOK", e);
    }
  }

  await refreshSettingsAiConnectionStatus();
}

export async function saveDashboardSettingsFromModal() {
  const { ipcRenderer } = require("electron");

  const sections = {};
  SECTION_KEYS.forEach((key) => {
    const el = document.getElementById(`settings-section-${key}`);
    sections[key] = el ? !!el.checked : true;
  });

  const excludedFarmlandIdsByServer = collectFieldExclusionsFromForm();

  try {
    await ipcRenderer.invoke("save-ui-preferences", { sections, excludedFarmlandIdsByServer });
    this.sectionVisibility = { ...DEFAULT_SECTION_VISIBILITY, ...sections };
    this.applyDashboardSectionVisibility();
  } catch (e) {
    this.showAlert?.(t("settings.saveFailed") + " (UI)", "error");
    return;
  }

  if (document.getElementById("settings-consultant-byok-key")) {
    const byokClear = document.getElementById("settings-consultant-byok-clear")?.checked;
    const byokKeyRaw = document.getElementById("settings-consultant-byok-key")?.value || "";
    const byokKey = byokKeyRaw.trim();
    const byokProv =
      document.getElementById("settings-consultant-byok-provider")?.value === "gemini"
        ? "gemini"
        : "openai";
    try {
      if (byokClear) {
        await ipcRenderer.invoke("save-consultant-byok-credentials", { clear: true });
      } else {
        const meta = await ipcRenderer.invoke("get-consultant-byok-meta");
        if (byokKey || meta?.hasKey) {
          await ipcRenderer.invoke("save-consultant-byok-credentials", {
            apiKey: byokKey,
            provider: byokProv,
          });
        }
      }
    } catch (e) {
      console.warn("[dashboard-settings] save BYOK", e);
    }
  }

  const ui = parseInt(
    document.getElementById("settings-mod-update-interval")?.value,
    10
  );
  const cc = parseInt(
    document.getElementById("settings-mod-collection-cycle")?.value,
    10
  );
  const modules = {
    animals: !!document.getElementById("settings-mod-animals")?.checked,
    vehicles: !!document.getElementById("settings-mod-vehicles")?.checked,
    weather: !!document.getElementById("settings-mod-weather")?.checked,
    fields: !!document.getElementById("settings-mod-fields")?.checked,
    finance: !!document.getElementById("settings-mod-finance")?.checked,
    economy: !!document.getElementById("settings-mod-economy")?.checked,
    production: !!document.getElementById("settings-mod-production")?.checked,
  };

  try {
    const res = await ipcRenderer.invoke("save-mod-config", {
      updateInterval: Number.isFinite(ui) ? ui : 10000,
      collectionCycleMs: Number.isFinite(cc) ? cc : 60000,
      modules,
    });
    if (res?.ok) {
      this.showAlert?.(t("settings.saved"), "success");
      const modal = bootstrap.Modal.getInstance(
        document.getElementById("dashboardSettingsModal")
      );
      modal?.hide();
    } else {
      this.showAlert?.(
        (res?.error || t("settings.saveFailed")) + " (mod config)",
        "error"
      );
    }
  } catch (e) {
    this.showAlert?.(t("settings.saveFailed") + " (mod config)", "error");
  }
}
