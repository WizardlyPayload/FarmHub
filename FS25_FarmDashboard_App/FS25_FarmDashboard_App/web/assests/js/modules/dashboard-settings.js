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
