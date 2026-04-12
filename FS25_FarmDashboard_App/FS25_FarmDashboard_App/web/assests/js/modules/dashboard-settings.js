// FS25 FarmDashboard | dashboard-settings.js | v2.0.0
// Dashboard Settings modal: visible main-menu sections + edit FS25 mod config.xml locally.

import { t } from "../i18n/i18n.js";
import { isFarmDashLocalConfigHost } from "./viewer-mode.js";

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

/** In-memory copy of servers list while Settings is open (mirrors first-run setup). */
let _appSettingsServersDraft = null;

function gatherFtpPollingFromForm() {
  const delay = parseInt(document.getElementById("app-settings-sm-ftp-delay")?.value, 10);
  const interval = parseInt(document.getElementById("app-settings-sm-ftp-interval")?.value, 10);
  const sched = document.querySelector('input[name="app-settings-sm-ftp-schedule"]:checked');
  return {
    initialDelaySeconds: Math.min(600, Math.max(0, Number.isFinite(delay) ? delay : 0)),
    intervalMinutes: Math.min(25, Math.max(1, Number.isFinite(interval) ? interval : 5)),
    scheduleMode: sched?.value === "staggered" ? "staggered" : "sync",
  };
}

function applyFtpPollingToForm(fp) {
  const f = fp || {};
  const d = document.getElementById("app-settings-sm-ftp-delay");
  if (d) d.value = String(f.initialDelaySeconds ?? 0);
  const i = document.getElementById("app-settings-sm-ftp-interval");
  if (i) i.value = String(f.intervalMinutes ?? 5);
  const mode = f.scheduleMode === "staggered" ? "staggered" : "sync";
  const sync = document.getElementById("app-settings-sm-ftp-sched-sync");
  const stag = document.getElementById("app-settings-sm-ftp-sched-stag");
  if (sync && stag) {
    if (mode === "staggered") stag.checked = true;
    else sync.checked = true;
  }
}

function toggleAppSettingsServerMode() {
  const mode = document.querySelector('input[name="app-settings-sm-mode"]:checked')?.value;
  const local = document.getElementById("app-settings-sm-local-fields");
  const ftp = document.getElementById("app-settings-sm-ftp-fields");
  if (local && ftp) {
    local.classList.toggle("d-none", mode !== "local");
    ftp.classList.toggle("d-none", mode !== "ftp");
  }
}

function renderAppSettingsServerList() {
  const list = document.getElementById("app-settings-sm-list");
  const empty = document.getElementById("app-settings-sm-empty");
  if (!list || !empty) return;
  const servers = _appSettingsServersDraft || [];
  empty.classList.toggle("d-none", servers.length > 0);
  list.innerHTML = "";
  servers.forEach((srv, idx) => {
    const info =
      srv.mode === "local"
        ? "Local: " + (srv.localSubFolder || srv.name)
        : "FTP: " + (srv.ftpHost || "") + (srv.httpFeedHost ? " + HTTP" : "");
    const row = document.createElement("div");
    row.className =
      "d-flex justify-content-between align-items-start border border-secondary rounded p-2 mb-2 bg-black bg-opacity-25 gap-2";
    row.innerHTML = `<div class="min-w-0"><strong>${escHtml(srv.name)}</strong><br/><span class="small text-muted text-break">${escHtml(
      info
    )}</span></div>`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm btn-outline-danger flex-shrink-0";
    btn.textContent = t("setup.remove");
    btn.addEventListener("click", () => {
      if (!_appSettingsServersDraft) return;
      _appSettingsServersDraft.splice(idx, 1);
      renderAppSettingsServerList();
    });
    row.appendChild(btn);
    list.appendChild(row);
  });
}

async function loadAppSettingsServerDraft() {
  try {
    const { ipcRenderer } = require("electron");
    const cfg = await ipcRenderer.invoke("get-current-config");
    _appSettingsServersDraft = JSON.parse(JSON.stringify(cfg?.servers || []));
    applyFtpPollingToForm(cfg?.ftpPolling);
    renderAppSettingsServerList();
  } catch (e) {
    console.warn("[dashboard-settings] server draft", e);
    _appSettingsServersDraft = null;
    renderAppSettingsServerList();
  }
}

function addAppSettingsServerFromForm(dashboard) {
  const name = document.getElementById("app-settings-sm-server-name")?.value?.trim();
  const mode = document.querySelector('input[name="app-settings-sm-mode"]:checked')?.value;
  if (!name) {
    dashboard.showAlert?.("Enter a display name.", "error");
    return;
  }
  if (!_appSettingsServersDraft) _appSettingsServersDraft = [];
  const srv = { id: "srv_" + Date.now(), name, mode };
  if (mode === "local") {
    srv.localPath = document.getElementById("app-settings-sm-local-path")?.value?.trim() || "";
    srv.localSubFolder = document.getElementById("app-settings-sm-local-sub")?.value?.trim() || "";
  } else {
    srv.ftpHost = document.getElementById("app-settings-sm-ftp-host")?.value?.trim() || "";
    srv.ftpPort = document.getElementById("app-settings-sm-ftp-port")?.value || "21";
    srv.ftpUser = document.getElementById("app-settings-sm-ftp-user")?.value?.trim() || "";
    srv.ftpPass = document.getElementById("app-settings-sm-ftp-pass")?.value || "";
    srv.ftpBasePath = document.getElementById("app-settings-sm-ftp-base")?.value?.trim() || "profile";
    srv.localSubFolder = document.getElementById("app-settings-sm-ftp-sub")?.value?.trim() || "savegame1";
    const feedHost = document.getElementById("app-settings-sm-http-host")?.value?.trim() || "";
    const feedCode = document.getElementById("app-settings-sm-http-code")?.value?.trim() || "";
    if (feedHost && feedCode) {
      srv.httpFeedHost = feedHost;
      srv.httpFeedPort = parseInt(document.getElementById("app-settings-sm-http-port")?.value, 10) || 8080;
      srv.httpFeedCode = feedCode;
    }
    if (!srv.ftpHost || !srv.ftpUser || !srv.ftpPass) {
      dashboard.showAlert?.("FTP host, user and password are required.", "error");
      return;
    }
  }
  _appSettingsServersDraft.push(srv);
  renderAppSettingsServerList();
  const sn = document.getElementById("app-settings-sm-server-name");
  if (sn) sn.value = "";
}

function syncAppSettingsFooterButtons() {
  const active = document.querySelector("#app-settings-sidebar .nav-link.active");
  const id = active?.id || "";
  const saveDash = document.getElementById("dashboard-settings-save-btn");
  const saveTheme = document.getElementById("app-settings-save-theme-btn");
  const onTheme = id === "app-settings-tab-theme";
  if (saveTheme) saveTheme.classList.toggle("d-none", !onTheme);
  if (saveDash) saveDash.classList.toggle("d-none", onTheme);
}

function wireAppSettingsServerControlsOnce(dashboard) {
  if (window.__farmdashAppSettingsServersWired) return;
  window.__farmdashAppSettingsServersWired = true;

  document.querySelectorAll('input[name="app-settings-sm-mode"]').forEach((r) => {
    r.addEventListener("change", () => toggleAppSettingsServerMode());
  });
  toggleAppSettingsServerMode();

  document.getElementById("app-settings-sm-add-btn")?.addEventListener("click", () => {
    addAppSettingsServerFromForm(dashboard);
  });

  document.getElementById("app-settings-open-setup-btn")?.addEventListener("click", () => {
    dashboard.openSetup?.();
  });

  document.getElementById("app-settings-sm-detect-btn")?.addEventListener("click", () => {
    const btn = document.getElementById("app-settings-sm-detect-btn");
    const prev = btn?.textContent;
    if (btn) btn.textContent = "…";
    try {
      const { ipcRenderer } = require("electron");
      ipcRenderer
        .invoke("scan-local-saves")
        .then((found) => {
          if (!found || found.length === 0) {
            dashboard.showAlert?.("No saves found. Run the mod at least once.", "info");
            return;
          }
          if (!_appSettingsServersDraft) _appSettingsServersDraft = [];
          const fresh = found.filter(
            (f) => !_appSettingsServersDraft.some((s) => s.localSubFolder === f.localSubFolder)
          );
          if (fresh.length > 0) {
            _appSettingsServersDraft = _appSettingsServersDraft.concat(fresh);
            renderAppSettingsServerList();
            dashboard.showAlert?.(`Imported ${fresh.length} save(s).`, "success");
          } else {
            dashboard.showAlert?.("All detected saves are already listed.", "info");
          }
        })
        .catch((e) => dashboard.showAlert?.(String(e.message || e), "error"))
        .finally(() => {
          if (btn && prev) btn.textContent = prev;
        });
    } catch (e) {
      if (btn && prev) btn.textContent = prev;
    }
  });

  document.getElementById("app-settings-sm-mod-img-btn")?.addEventListener("click", () => {
    const btn = document.getElementById("app-settings-sm-mod-img-btn");
    const prev = btn?.textContent;
    if (btn) btn.textContent = "…";
    let cleanup = null;
    try {
      const { ipcRenderer } = require("electron");
      if (typeof window.attachModExportProgress === "function") {
        cleanup = window.attachModExportProgress(ipcRenderer);
      }
      ipcRenderer
        .invoke("export-mod-store-images")
        .catch((e) => dashboard.showAlert?.(String(e.message || e), "error"))
        .finally(() => {
          if (typeof cleanup === "function") cleanup();
          if (btn && prev) btn.textContent = prev;
        });
    } catch (e) {
      if (btn && prev) btn.textContent = prev;
    }
  });
}

export function setupDashboardSettingsModal() {
  const modalEl = document.getElementById("appSettingsModal");
  if (!modalEl) return;

  wireAppSettingsServerControlsOnce(this);

  modalEl.addEventListener("show.bs.modal", () => {
    this.populateDashboardSettingsForm();
  });

  modalEl.addEventListener("shown.bs.modal", () => {
    syncAppSettingsFooterButtons();
  });

  document.querySelectorAll('#app-settings-sidebar [data-bs-toggle="tab"]').forEach((btn) => {
    btn.addEventListener("shown.bs.tab", () => {
      syncAppSettingsFooterButtons();
      if (btn.id === "app-settings-tab-theme") {
        this.loadThemeEditor?.();
      }
    });
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

  await loadAppSettingsServerDraft();
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

  try {
    const cfg = await ipcRenderer.invoke("get-current-config");
    ipcRenderer.send("save-settings", {
      ...cfg,
      isConfigured: true,
      servers: _appSettingsServersDraft !== null ? _appSettingsServersDraft : cfg?.servers || [],
      ftpPolling: { ...(cfg?.ftpPolling || {}), ...gatherFtpPollingFromForm() },
    });
  } catch (e) {
    console.warn("[dashboard-settings] save-settings", e);
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
      const modal = bootstrap.Modal.getInstance(document.getElementById("appSettingsModal"));
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

const UNIFIED_SETTINGS_TAB_IDS = {
  dashboard: "app-settings-tab-dashboard",
  servers: "app-settings-tab-servers",
  ai: "app-settings-tab-ai",
  mod: "app-settings-tab-mod",
  theme: "app-settings-tab-theme",
};

/**
 * Open the unified Settings modal and optionally activate a sidebar tab (servers, AI, etc.).
 * Replaces the old separate navbar “folder” shortcut — all configuration lives here.
 * @param {"dashboard"|"servers"|"ai"|"mod"|"theme"} [tabKey]
 */
export function openUnifiedSettingsModal(tabKey) {
  if (!isFarmDashLocalConfigHost()) {
    this.showAlert?.(
      "Server and save setup is only available on the PC running Farm Dashboard.",
      "info"
    );
    return;
  }
  const modalEl = document.getElementById("appSettingsModal");
  if (!modalEl || typeof bootstrap === "undefined") return;
  const key = tabKey && UNIFIED_SETTINGS_TAB_IDS[tabKey] ? tabKey : "dashboard";
  const trigger = document.getElementById(UNIFIED_SETTINGS_TAB_IDS[key]);
  if (trigger) {
    try {
      bootstrap.Tab.getOrCreateInstance(trigger).show();
    } catch (e) {
      /* ignore */
    }
  }
  try {
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  } catch (e) {
    /* ignore */
  }
}
