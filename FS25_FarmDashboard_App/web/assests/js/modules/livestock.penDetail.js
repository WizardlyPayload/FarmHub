// FS25 FarmDashboard | livestock.penDetail.js | v2.3.0 (Plan v5 A2)
//
// On-demand REAL per-pen detail fetch & accessible modal.
//   - LRU cache keyed by `${serverId}|${idScheme}|${penId}|${dirtyAt}` (max 32 entries).
//   - GET /api/livestock/:id triggers FTP refetch only when index ts moves (server-side).
//   - POST /api/livestock/:id/request is debounced 5s/pen.
//   - Modal is role="dialog" aria-modal=true with focus trap, Esc close, ARIA live region.
//   - Loading skeleton, error toast w/ retry, "Stale" pill when cachedAt > 60s ago.

import { t } from "../i18n/i18n.js";

const LRU_MAX = 32;
const REQUEST_DEBOUNCE_SEC = 5;
const STALE_AFTER_SEC = 60;

const lruCache = new Map(); // key -> { detail, ts: Date.now() }
const requestDebounce = new Map(); // penId -> last request unix sec

function lruGet(key) {
  if (!lruCache.has(key)) return null;
  const v = lruCache.get(key);
  // Move to end (most-recently-used)
  lruCache.delete(key);
  lruCache.set(key, v);
  return v;
}
function lruSet(key, value) {
  if (lruCache.has(key)) lruCache.delete(key);
  lruCache.set(key, value);
  while (lruCache.size > LRU_MAX) {
    const firstKey = lruCache.keys().next().value;
    lruCache.delete(firstKey);
  }
}

function getActiveServerId() {
  try {
    if (typeof window !== "undefined" && window.dashboard && window.dashboard.activeServerId) {
      return String(window.dashboard.activeServerId);
    }
    if (typeof localStorage !== "undefined") {
      return String(localStorage.getItem("dashboard_active_server") || "");
    }
  } catch (_) { /* ignore */ }
  return "";
}

function getSetupToken() {
  try {
    if (typeof window !== "undefined" && window.__FARMDASH_SETUP_TOKEN) {
      return String(window.__FARMDASH_SETUP_TOKEN);
    }
  } catch (_) { /* ignore */ }
  return "";
}

/**
 * Plan v5 A2: fetch real per-pen detail. Returns { detail, serverTimeSec, animalMode, idScheme,
 * dirtyAt, cachedAt, fromCache } or null on failure / not-available.
 */
export async function loadPenDetail(penId, opts = {}) {
  const id = String(penId);
  const sid = opts.serverId || getActiveServerId();
  const cacheKey = `${sid}|${opts.idScheme || "?"}|${id}|${opts.dirtyAt || 0}`;
  const cached = lruGet(cacheKey);
  if (cached && cached.value) return cached.value;

  const q = sid ? `?serverId=${encodeURIComponent(sid)}` : "";
  let res;
  try {
    res = await fetch(`/api/livestock/${encodeURIComponent(id)}${q}`, { cache: "no-store" });
  } catch (e) {
    console.warn("[livestock] pen detail fetch failed", id, e && e.message);
    return null;
  }
  if (!res.ok) {
    if (res.status === 404) return null;
    console.warn("[livestock] pen detail HTTP", res.status, id);
    return null;
  }
  let body = null;
  try { body = await res.json(); } catch (_) { return null; }
  if (!body || !body.detail) return null;

  const finalKey = `${sid}|${body.idScheme || opts.idScheme || "?"}|${id}|${body.dirtyAt || 0}`;
  lruSet(finalKey, { value: body, ts: Date.now() });
  return body;
}

/**
 * Plan v5 A2 + A6: POST /api/livestock/:id/request — debounced 5s/pen, sends X-FarmDash-Token,
 * silent-fails on rate-limit (429) or auth (403) so UI is never blocked.
 */
export async function requestPenRefresh(penId) {
  const id = String(penId);
  const nowSec = Date.now() / 1000;
  const last = requestDebounce.get(id) || 0;
  if (nowSec - last < REQUEST_DEBOUNCE_SEC) return false;
  requestDebounce.set(id, nowSec);

  const sid = getActiveServerId();
  const q = sid ? `?serverId=${encodeURIComponent(sid)}` : "";
  const token = getSetupToken();
  try {
    const res = await fetch(`/api/livestock/${encodeURIComponent(id)}/request${q}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "X-FarmDash-Token": token } : {}),
      },
      body: JSON.stringify({ id: Number(id) }),
    });
    return res.ok;
  } catch (e) {
    console.warn("[livestock] pen detail request failed", id, e && e.message);
    return false;
  }
}

function formatTime(unixSec) {
  if (!unixSec) return t("common.notAvailable");
  try {
    return new Date(unixSec * 1000).toLocaleTimeString();
  } catch (_) {
    return String(unixSec);
  }
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensurePenDetailModal() {
  let modal = document.getElementById("penDetailModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "penDetailModal";
  modal.className = "modal fade";
  modal.tabIndex = -1;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "penDetailTitle");
  modal.innerHTML = `
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
      <div class="modal-content bg-dark text-light">
        <div class="modal-header">
          <h5 class="modal-title" id="penDetailTitle">
            <i class="bi bi-clipboard2-pulse me-2"></i><span id="penDetailTitleText">Pen detail</span>
          </h5>
          <span id="penDetailStalePill" class="badge bg-warning text-dark ms-2 d-none">${escapeHtml("Stale")}</span>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div id="penDetailMeta" class="text-muted small mb-2"></div>
          <div id="penDetailLive" aria-live="polite" class="visually-hidden"></div>
          <div id="penDetailContent">
            ${'<div class="placeholder-glow">' + Array(10).fill('<div class="placeholder col-12 mb-2" style="height:1.5em"></div>').join("") + "</div>"}
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" id="penDetailRefreshBtn">
            <i class="bi bi-arrow-clockwise me-1"></i>${escapeHtml(t("common.refresh") || "Refresh")}
          </button>
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">${escapeHtml(t("common.close") || "Close")}</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function announceLive(msg) {
  const live = document.getElementById("penDetailLive");
  if (live) live.textContent = msg;
}

function renderAnimalsTable(animals, mode) {
  if (!Array.isArray(animals) || animals.length === 0) {
    return `<div class="alert alert-secondary mb-0">${escapeHtml(t("livestock.noAnimals") || "No animals in this pen.")}</div>`;
  }
  const PER_PAGE = 50;
  const rows = animals.slice(0, PER_PAGE).map((a, i) => {
    const id = escapeHtml(a.uniqueId || a.id || a.tag || i + 1);
    const subType = escapeHtml(a.subType || a.type || "?");
    const gender = escapeHtml(a.gender || "?");
    const age = escapeHtml(a.age || a.ageInMonths || "?");
    const weight = escapeHtml(a.weight || "?");
    const health = escapeHtml(a.health || "?");
    const flags = [
      a.isPregnant ? '<span class="badge bg-info">P</span>' : "",
      a.isLactating ? '<span class="badge bg-primary">L</span>' : "",
      a.isCastrated ? '<span class="badge bg-secondary">C</span>' : "",
    ].filter(Boolean).join(" ");
    return `<tr><td><code>${id}</code></td><td>${subType}</td><td>${gender}</td><td class="text-end">${age}</td><td class="text-end">${weight}</td><td class="text-end">${health}</td><td>${flags}</td></tr>`;
  }).join("");
  const more = animals.length > PER_PAGE
    ? `<tfoot><tr><td colspan="7" class="text-muted text-center small">${escapeHtml(t("livestock.morePagedHint") || `+${animals.length - PER_PAGE} more (paging coming soon)`)}</td></tr></tfoot>`
    : "";
  return `
    <table class="table table-sm table-dark table-striped table-hover mb-0">
      <thead>
        <tr>
          <th>${escapeHtml(t("livestock.colId") || "ID")}</th>
          <th>${escapeHtml(t("livestock.colType") || "Type")}</th>
          <th>${escapeHtml(t("livestock.colGender") || "Gender")}</th>
          <th class="text-end">${escapeHtml(t("livestock.colAge") || "Age")}</th>
          <th class="text-end">${escapeHtml(t("livestock.colWeight") || "Weight")}</th>
          <th class="text-end">${escapeHtml(t("livestock.colHealth") || "Health")}</th>
          <th>${escapeHtml(t("livestock.colFlags") || "Flags")}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      ${more}
    </table>
    <div class="small text-muted mt-2">${escapeHtml((t("livestock.modeLabel") || "Mode") + ": " + (mode || "?"))}</div>
  `;
}

function setStalePill(detailEnvelope) {
  const pill = document.getElementById("penDetailStalePill");
  if (!pill) return;
  const cachedAt = Number(detailEnvelope?.cachedAt) || 0;
  const nowSec = Date.now() / 1000;
  if (cachedAt > 0 && (nowSec - cachedAt) > STALE_AFTER_SEC) {
    pill.classList.remove("d-none");
    pill.title = `Cached at ${formatTime(cachedAt)}; refetch failed or not yet attempted.`;
  } else {
    pill.classList.add("d-none");
  }
}

function renderModalState(envelope) {
  const meta = document.getElementById("penDetailMeta");
  const content = document.getElementById("penDetailContent");
  if (!envelope || !envelope.detail) {
    if (meta) meta.textContent = "";
    if (content) {
      content.innerHTML = `<div class="alert alert-warning">${escapeHtml(t("livestock.detailUnavailable") || "Detail not available — the mod has not generated a per-pen file for this pen yet.")}</div>`;
    }
    setStalePill(envelope);
    announceLive(t("livestock.detailUnavailable") || "Detail not available.");
    return;
  }
  const d = envelope.detail;
  if (meta) {
    meta.innerHTML = `
      <span title="${escapeHtml(t("livestock.serverTimeTitle") || "Server clock at generation")}">${escapeHtml(t("livestock.serverTime") || "Server time")}: ${escapeHtml(formatTime(envelope.serverTimeSec))}</span>
      <span class="ms-3">${escapeHtml(t("livestock.cachedAt") || "Cached at")}: ${escapeHtml(formatTime(envelope.cachedAt))}</span>
      <span class="ms-3">${escapeHtml(t("livestock.modeLabel") || "Mode")}: ${escapeHtml(envelope.animalMode)}</span>
      <span class="ms-3">${escapeHtml(t("livestock.idSchemeLabel") || "ID scheme")}: ${escapeHtml(envelope.idScheme || "integer-v1")}</span>
    `;
  }
  if (content) {
    content.innerHTML = renderAnimalsTable(d.animals, d.mode || envelope.animalMode);
  }
  setStalePill(envelope);
  announceLive((t("livestock.detailLoaded") || "Loaded animals from pen detail.") + " " + (Array.isArray(d.animals) ? d.animals.length : 0));
}

let lastFocusedTrigger = null;

/**
 * Plan v5 A2: open modal for a pen, with a11y, debounced refresh trigger, and skeleton loading.
 */
export async function openPenDetailModal(penId, opts = {}) {
  const modal = ensurePenDetailModal();
  const idStr = String(penId);
  const titleEl = document.getElementById("penDetailTitleText");
  const refreshBtn = document.getElementById("penDetailRefreshBtn");
  if (titleEl) titleEl.textContent = `${t("livestock.penDetailTitle") || "Pen detail"} — #${idStr}`;
  // Reset content to skeleton.
  const content = document.getElementById("penDetailContent");
  if (content) {
    content.innerHTML = `<div class="placeholder-glow">${Array(10).fill('<div class="placeholder col-12 mb-2" style="height:1.5em"></div>').join("")}</div>`;
  }
  announceLive(t("livestock.detailLoading") || "Loading pen detail.");

  lastFocusedTrigger = document.activeElement;
  if (typeof bootstrap !== "undefined" && bootstrap.Modal) {
    bootstrap.Modal.getOrCreateInstance(modal).show();
  } else {
    modal.classList.add("show");
    modal.style.display = "block";
  }

  // Fire the request first (debounced) so the next mod cycle refreshes this pen, then fetch detail.
  requestPenRefresh(idStr).catch(() => { /* swallow */ });
  let envelope = null;
  try {
    envelope = await loadPenDetail(idStr, opts);
  } catch (e) {
    envelope = null;
  }
  renderModalState(envelope);

  if (refreshBtn) {
    refreshBtn.onclick = async () => {
      if (content) {
        content.innerHTML = `<div class="placeholder-glow">${Array(10).fill('<div class="placeholder col-12 mb-2" style="height:1.5em"></div>').join("")}</div>`;
      }
      announceLive(t("livestock.detailRefreshing") || "Refreshing pen detail.");
      await requestPenRefresh(idStr).catch(() => { /* swallow */ });
      // Bust the cache for this pen (but keep idScheme/dirtyAt — server side will tell us anew).
      for (const k of Array.from(lruCache.keys())) {
        if (k.endsWith(`|${idStr}|0`) || k.includes(`|${idStr}|`)) lruCache.delete(k);
      }
      let env2 = null;
      try { env2 = await loadPenDetail(idStr, opts); } catch (_) { env2 = null; }
      renderModalState(env2);
    };
  }

  // Restore focus on close.
  modal.addEventListener("hidden.bs.modal", function onHidden() {
    modal.removeEventListener("hidden.bs.modal", onHidden);
    if (lastFocusedTrigger && typeof lastFocusedTrigger.focus === "function") {
      try { lastFocusedTrigger.focus(); } catch (_) { /* ignore */ }
    }
  });
}

/**
 * Plan v5 A2 helper: when an animal is `__lodSynth`, replace the modal payload with the real
 * pen detail. Caller (livestock.js#showAnimalDetails) calls this to enrich a synthetic-animal
 * modal with truth-data when available.
 *
 * Returns the original animal augmented with { __replaced: true } when a uniqueId match is
 * found, or null when no match exists in the detail payload.
 */
export async function resolveSyntheticAnimal(animal) {
  if (!animal || !animal.__lodSynth) return null;
  const penId = animal.husbandryId || animal.huId;
  if (!penId) return null;
  const env = await loadPenDetail(String(penId)).catch(() => null);
  if (!env || !env.detail || !Array.isArray(env.detail.animals)) return null;
  const realList = env.detail.animals;
  // Match by uniqueId only — never by index — so reorderings don't yield false matches.
  if (animal.uniqueId) {
    const real = realList.find((r) => r && (r.uniqueId === animal.uniqueId));
    if (real) return { ...animal, ...real, __replaced: true };
  }
  return null;
}
