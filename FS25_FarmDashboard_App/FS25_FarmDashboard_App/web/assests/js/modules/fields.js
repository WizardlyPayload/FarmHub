// FS25 FarmDashboard | fields.js | v2.0.0

import {
    getLocalFieldSuggestion,
    RULES_ENGINE_FALLBACK_ACTION,
    getBaleCountStrict,
    aggregateWindrowDetected,
    aggregateBaleableLoose,
    classifyWindrowMaterial,
} from "../rules-engine.js";
import {
  refreshFieldConsultantCache,
  scheduleFieldConsultantFetch,
  lookupFieldConsultantInsight,
} from "../field-consultant-bridge.js";

/**
 * fields.js  —  FarmDashboard FS25
 * Live field data from the API, auto-refreshes every 5 seconds.
 * Supports standard soil plus variable-rate nitrogen/pH when the game exports soil maps.
 *
 * The API returns every field (all farms + unowned). The UI filters to the active farm
 * by default (owned-only). Pass { includeUnowned: true } to also list NPC/unowned fields.
 */

// Module-level state
let currentFields        = [];
let fieldsRefreshTimer   = null;
let fieldsIsLoading      = false;
/** Persists across API refreshes until user leaves the fields section (then reset to all). */
let fieldsFilterType     = "all";
let fieldsSearchTerm     = "";
let fieldConsultantListenerRegistered = false;
/** Skip re-render when /api/fields body and client scope (farm/server) unchanged */
let lastFieldsPayloadKey = null;

/** Mirrors getAPIBaseURL in apiStorage — cannot import apiStorage here (it imports this module). */
function resolveFarmdashApiBase() {
  if (typeof window !== "undefined" && window.location && /^https?:$/i.test(window.location.protocol || "")) {
    return window.location.origin;
  }
  return "http://127.0.0.1:8766";
}

function ensureFieldConsultantListener() {
  if (fieldConsultantListenerRegistered || typeof window === "undefined") return;
  fieldConsultantListenerRegistered = true;
  window.addEventListener("field-consultant-updated", () => {
    if (document.getElementById("fields-list")) {
      renderFields(fieldsFilterType, fieldsSearchTerm);
    }
  });
  window.addEventListener("field-consultant-loading", (ev) => {
    const on = ev.detail && ev.detail.loading;
    const row = document.getElementById("field-ai-thinking-row");
    if (row) row.classList.toggle("d-none", !on);
  });
}

/** Single field bar: purple when mulched (map-style), matches progress bar */
const MULCH_PURPLE = "#7b1fa2";
const MULCH_PURPLE_FG = "#f3e5f5";

/** Plowed / cultivated soil (brown–red, map-style) */
const SOIL_TILLED_BG = "#a65d3a";
const SOIL_TILLED_FG = "#fff8f5";

/** Orange = harvest ready (FS map) */
const HARVEST_ORANGE = "#ff9800";

/** Grass is perennial in FS; never treat as arable "withered" in the UI. */
function fieldShowsWithered(field) {
    if (!field || !field.isWithered) return false;
    if (String(field.fruitType || "").toUpperCase() === "GRASS") return false;
    return true;
}

/**
 * @param {Array} fields — full list from /api/fields or merged payload
 * @param {number} farmId — active farm (from farm dropdown)
 * @param {{ includeUnowned?: boolean }} [options] — if true, also include ownerFarmId 0 (NPC / contracts). Default false.
 */
export function filterFieldsForFarmView(fields, farmId, options = {}) {
    const { includeUnowned = false } = options;
    if (!Array.isArray(fields)) return [];
    const fid = Number(farmId);
    return fields.filter(f => {
        if (!f) return false;
        const oid = Number(f.ownerFarmId ?? f.farmId ?? 0);
        if (oid === fid) return true;
        if (includeUnowned && oid === 0) return true;
        return false;
    });
}

if (typeof window !== 'undefined') {
    window.filterFieldsForFarmView = filterFieldsForFarmView;
}

// ── Section entry point ───────────────────────────────────────────────────────
export function showFieldsSection() {
    fieldsFilterType = "all";
    fieldsSearchTerm = "";
    lastFieldsPayloadKey = null;
    ensureFieldConsultantListener();

    document.getElementById("section-content-dynamic").innerHTML = buildFieldsHTML();
    document.getElementById("section-content").classList.remove("d-none");

    // Stop any previous refresh loop
    stopFieldsRefresh();

    // Load immediately, then poll every 5 seconds
    loadFieldsData();
    fieldsRefreshTimer = setInterval(loadFieldsData, 5000);
}

// Called by navigation when leaving the section
export function showFieldsErrorState() {
    stopFieldsRefresh();
}

function stopFieldsRefresh() {
    if (fieldsRefreshTimer) {
        clearInterval(fieldsRefreshTimer);
        fieldsRefreshTimer = null;
    }
}

// ── Data fetching ─────────────────────────────────────────────────────────────
async function loadFieldsData() {
    // Prevent overlapping requests
    if (fieldsIsLoading) return;
    fieldsIsLoading = true;

    try {
        const apiBase   = window.dashboard?.getAPIBaseURL?.() ?? resolveFarmdashApiBase();
        const serverId  = window.dashboard?.activeServerId;
        const farmId    = window.dashboard?.activeFarmId ?? 1;

        let url = `${apiBase}/api/fields?t=${Date.now()}`;
        if (serverId) url += `&serverId=${encodeURIComponent(serverId)}`;

        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const raw = await response.json();

        // Normalise to array (full list — all farms + unowned)
        let fields = Array.isArray(raw) ? raw
                   : Array.isArray(raw.fields) ? raw.fields
                   : Object.values(raw);

        const scopeKey =
            JSON.stringify(fields) +
            "|" +
            String(farmId) +
            "|" +
            String(serverId ?? "");
        if (lastFieldsPayloadKey === scopeKey) {
            fieldsIsLoading = false;
            return;
        }
        lastFieldsPayloadKey = scopeKey;

        if (window.dashboard) {
            window.dashboard.allFields = fields;
            currentFields = filterFieldsForFarmView(fields, farmId);
            window.dashboard.fields = currentFields;
        } else {
            currentFields = filterFieldsForFarmView(fields, farmId);
        }

        renderFields(fieldsFilterType, fieldsSearchTerm);
        updateFieldStats();
        updateLandingCount();
        scheduleFieldConsultantFetch();

    } catch (err) {
        console.error("[Fields] Load error:", err);
        showFieldsApiError();
    } finally {
        fieldsIsLoading = false;
    }
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
export function updateFieldStats() {
    const totalArea     = currentFields.reduce((s, f) => s + (f.hectares || 0), 0);
    const needsWork     = currentFields.filter(f => f.needsWork || f.needsRolling || fieldShowsWithered(f)).length;
    const harvestReady  = currentFields.filter(f => effectiveHarvestReady(f)).length;

    setText("total-fields-count", currentFields.length);
    setText("total-area",         totalArea.toFixed(1));
    setText("fields-need-work",   needsWork);
    setText("fields-harvest-ready", harvestReady);
}

/** Sync list from merged/realtime `dashboard.fields` and re-apply the active filter. */
export function updateFieldsList() {
    if (window.dashboard?.fields && Array.isArray(window.dashboard.fields)) {
        currentFields = window.dashboard.fields;
    }
    renderFields(fieldsFilterType, fieldsSearchTerm);
}

function updateLandingCount() {
    const el = document.getElementById("field-count");
    if (el) el.textContent = `${currentFields.length} Field${currentFields.length !== 1 ? "s" : ""}`;
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ── Render field cards ────────────────────────────────────────────────────────
function renderFields(filterType = "all", searchTerm = "") {
    const container = document.getElementById("fields-list");
    if (!container) return;

    if (currentFields.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-5 text-muted">
                <i class="bi bi-hourglass-split display-1 mb-3"></i>
                <h4>Waiting for field data…</h4>
                <p>Make sure FS25 is running with the FarmDashboard mod active.</p>
            </div>`;
        return;
    }

    let filtered = currentFields.filter(f => {
        // Status filter
        const status = getFieldStatus(f);
        if (filterType !== "all" && status !== filterType) return false;
        // Search filter
        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            return (f.name || "").toLowerCase().includes(q)
                || (f.fruitType || "").toLowerCase().includes(q);
        }
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="col-12 text-center py-4 text-muted">No fields match this filter.</div>`;
        return;
    }

    container.innerHTML = filtered.map(buildFieldCard).join("");
}

function getFieldStatus(f) {
    if (fieldShowsWithered(f)) return "needswork";
    // Mulched fallow (no crop): same filter bucket as empty — cards still show mulched styling
    if (isMulchedEmptyField(f)) return "empty";
    if (effectiveHarvestReady(f)) return "harvest";
    if (f.needsWork || f.needsRolling) return "needswork";
    if (f.growthState > 0) return "growing";
    return "empty";
}

/** True when stubble shred / mulch level indicates mulching (API may set `isMulched` explicitly). */
function fieldIsMulched(field) {
    if (field.isMulched === true)  return true;
    if (field.isMulched === false) return false;
    const s = Number(field.stubbleShredLevel ?? field.mulchLevel ?? 0);
    return s >= 1;
}

/**
 * Mulched fallow: no crop (or explicit Lua labels) but stubble mulch applied.
 * Shown before harvest-ready so merged XML `harvestReady` does not paint orange bars on mulch.
 */
function isMulchedEmptyField(field) {
    if (!fieldIsMulched(field)) return false;
    if (field.isHarvested || field.growthLabel === "harvested") return false;
    if (field.growthLabel === "mulched_fallow" || field.fruitType === "mulched_stubble") return true;
    const fruit = (field.fruitType || "").toLowerCase();
    const noCrop = !field.fruitType || fruit === "unknown" || fruit === "empty";
    return noCrop && (field.growthState || 0) === 0;
}

/** True when save says harvested / stubble (XML often leaves harvestReady=true stale). */
function fieldIsAlreadyHarvested(field) {
    if (field.isHarvested === true) return true;
    if (field.growthLabel === "harvested") return true;
    const gt = String(field.groundType || "").toUpperCase();
    return gt.includes("HARVESTED");
}

/** Harvest-ready for UI only — suppress when mulched fallow or already harvested. */
function effectiveHarvestReady(field) {
    if (fieldIsAlreadyHarvested(field)) return false;
    return !!(field.harvestReady && !isMulchedEmptyField(field));
}

/**
 * Post-harvest / fallow stubble: after crop is taken off, cycle is Harvest → mulch → till → seed.
 * Not used when a crop is actively growing toward harvest (harvestReady) or mid-season.
 */
function isPostHarvestField(field) {
    if (effectiveHarvestReady(field)) return false;
    if (fieldShowsWithered(field)) return false;
    const gs = field.growthState || 0;
    const gl = field.growthLabel;
    const gt = String(field.groundType || "").toUpperCase();
    // Mid-season crop (explicit Lua label): never show post-harvest pipeline here
    if (gl === "growing") return false;
    // Growing rows with no harvest markers — not post-harvest (avoids mulch UI during growth)
    if (gs > 0 && !field.isHarvested && gl !== "harvested" && !gt.includes("HARVESTED")) {
        return false;
    }
    if (field.isHarvested) return true;
    if (field.growthLabel === "harvested") return true;
    if (field.growthLabel === "mulched_fallow") return true;
    if (gt.includes("HARVESTED")) return true;
    const fruit = (field.fruitType || "").toLowerCase();
    const noCrop = !field.fruitType || fruit === "unknown" || fruit === "empty";
    if (noCrop && gs === 0 && (fieldIsMulched(field) || Number(field.stubbleShredLevel ?? field.mulchLevel ?? 0) > 0)) {
        return true;
    }
    return false;
}

// ── Individual card HTML ──────────────────────────────────────────────────────
function buildFieldCard(field) {
    const status     = getFieldStatus(field);
    const badge      = buildStatusBadge(field);
    const progress   = buildProgressBar(field);
    const conditions = buildConditions(field);
    const suggestion = buildSuggestion(field);
    const isPF       = field.isPrecisionFarming;
    const pfBadge    = isPF
        ? `<span class="badge bg-info text-dark ms-1" title="Soil mapping active (variable-rate N / pH)">
               <i class="bi bi-cpu me-1"></i>Soil
           </span>`
        : "";

    return `
        <div class="col-md-6 col-lg-4 mb-4 field-card" data-status="${status}">
            <div class="card bg-secondary h-100 shadow-sm">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">
                        <i class="bi bi-geo-alt-fill text-primary me-1"></i>
                        ${field.name || "Field " + field.id}
                        ${pfBadge}
                    </h5>
                    ${badge}
                </div>
                <div class="card-body">
                    <div class="row mb-2">
                        <div class="col-6">
                            <small class="text-muted d-block">Area</small>
                            <strong>${formatFieldHectares(field)}</strong>
                        </div>
                        <div class="col-6">
                            <small class="text-muted d-block">Crop</small>
                            <strong>${formatCropName(field.fruitType)}</strong>
                        </div>
                    </div>
                    ${buildForageDetectionBadges(field)}
                    ${progress}
                    <div class="mt-3">${conditions}</div>
                    ${suggestion}
                </div>
            </div>
        </div>`;
}

// ── Status badge ──────────────────────────────────────────────────────────────
function buildStatusBadge(field) {
    if (fieldShowsWithered(field)) return `<span class="badge bg-danger">Withered</span>`;
    if (field.isHarvested)  return `<span class="badge" style="background:#8d6e63">Harvested</span>`;
    if (isMulchedEmptyField(field)) {
        return `<span class="badge" style="background:${MULCH_PURPLE};color:${MULCH_PURPLE_FG}">Mulched</span>`;
    }
    if (effectiveHarvestReady(field)) return `<span class="badge" style="background:#ff9800;color:#000">Ready</span>`;
    if (field.needsWork || field.needsRolling) return `<span class="badge bg-warning text-dark">Needs Work</span>`;
    if ((field.growthState || 0) > 0) return `<span class="badge bg-info text-dark">Growing</span>`;
    return `<span class="badge bg-dark border border-secondary">Empty</span>`;
}

// ── Single map-style progress bar (colour = field state) ───────────────────────

function parseHex(hex) {
    const h = (hex || "#000000").replace("#", "");
    return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
    };
}

function mixHex(a, b, t) {
    const A = parseHex(a);
    const B = parseHex(b);
    const u = Math.min(1, Math.max(0, t));
    const r = Math.round(A.r + (B.r - A.r) * u);
    const g = Math.round(A.g + (B.g - A.g) * u);
    const bch = Math.round(A.b + (B.b - A.b) * u);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bch.toString(16).padStart(2, "0")}`;
}

/** Light → dark green like FS field map while crop grows */
function greenGradientForPercent(pct) {
    return mixHex("#c8e6c9", "#1b5e20", Math.min(1, Math.max(0, Number(pct) || 0) / 100));
}

function contrastForBg(hex) {
    const { r, g, b } = parseHex(hex);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.55 ? "#111" : "#fff";
}

function isGrowingBarField(field) {
    const gs = field.growthState || 0;
    if (gs <= 0) return false;
    if (fieldShowsWithered(field)) return false;
    if (fieldIsAlreadyHarvested(field)) return false;
    if (effectiveHarvestReady(field)) return false;
    if (field.growthLabel === "harvested") return false;
    return true;
}

/** Plowed / cultivated: tilled soil, no standing crop (brown–red on map) */
function isSoilTilledField(field) {
    if ((field.growthState || 0) > 0) return false;
    if (effectiveHarvestReady(field)) return false;
    const gt = String(field.groundType || "").toUpperCase();
    if (gt.includes("PLOWED") || gt.includes("CULTIVATED")) return true;
    if (Number(field.plowLevel) >= 1) {
        const fruit = (field.fruitType || "").toLowerCase();
        const noCrop = !field.fruitType || fruit === "unknown" || fruit === "empty";
        if (noCrop && !fieldIsMulched(field)) return true;
    }
    return false;
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function buildProgressBar(field) {
    if (fieldShowsWithered(field)) {
        return barHTML(100, "#8b0000", "Withered", "#fff");
    }

    if (String(field.growthLabel || "") === "mown_regrowth") {
        const pct = Math.min(100, Math.max(0, field.growthStatePercentage || 0));
        const bg = greenGradientForPercent(pct);
        const fg = contrastForBg(bg);
        return barHTML(pct, bg, "Mown · regrowing", fg);
    }

    if (isGrowingBarField(field)) {
        const pct = Math.min(100, Math.max(0, field.growthStatePercentage || 0));
        let max = Math.max(1, Number(field.maxGrowthState) || 1);
        const ftU = (field.fruitType || "").toUpperCase();
        if (ftU === "GRASS" && max > 4) max = 4;
        const rawGs = Number(field.growthState) || 0;
        // FS25 grass: engine indices above the 4 map stages = mown / regrowth — do not clamp to max or it shows "4/4".
        if (ftU === "GRASS" && rawGs > max) {
            const bg = greenGradientForPercent(Math.min(100, pct));
            const fg = contrastForBg(bg);
            return barHTML(pct, bg, "Mown · regrowing", fg);
        }
        let cur = rawGs;
        if (cur > max) cur = max;
        const bg = greenGradientForPercent(pct);
        const fg = contrastForBg(bg);
        return barHTML(pct, bg, `Growing · Stage ${cur}/${max}`, fg);
    }

    if (effectiveHarvestReady(field)) {
        return barHTML(100, HARVEST_ORANGE, "Ready to harvest", "#000");
    }

    if (isSoilTilledField(field)) {
        return barHTML(100, SOIL_TILLED_BG, "Plowed / cultivated", SOIL_TILLED_FG);
    }

    if (fieldIsMulched(field) && (field.growthState || 0) === 0) {
        return barHTML(100, MULCH_PURPLE, "Mulched", MULCH_PURPLE_FG);
    }

    if (fieldIsAlreadyHarvested(field) || isPostHarvestField(field)) {
        return barHTML(100, "#6d4c41", "Harvested", "#fff");
    }

    if (!field.growthState || field.growthState === 0) {
        return barHTML(100, "#5d4037", "Empty", "#f5f5f5");
    }

    const pct = field.growthStatePercentage || 0;
    let max = Math.max(1, Number(field.maxGrowthState) || 1);
    const ftU = (field.fruitType || "").toUpperCase();
    if (ftU === "GRASS" && max > 4) max = 4;
    const rawGs = Number(field.growthState) || 0;
    if (ftU === "GRASS" && rawGs > max) {
        const bg = greenGradientForPercent(Math.min(100, pct));
        return barHTML(pct, bg, "Mown · regrowing", contrastForBg(bg));
    }
    let cur = rawGs;
    if (cur > max) cur = max;
    const bg = greenGradientForPercent(pct);
    return barHTML(pct, bg, `Stage ${cur}/${max}`, contrastForBg(bg));
}

function barHTML(pct, bg, label, textColour = "white") {
    return `
        <div class="mt-2">
            <div class="progress" style="height:20px;background:#2c2c2c;">
                <div class="progress-bar fw-bold"
                     style="width:${pct}%;background:${bg};color:${textColour};">
                    ${label}
                </div>
            </div>
        </div>`;
}

// ── Soil condition bars ───────────────────────────────────────────────────────
function buildConditions(field) {
    const isPF   = field.isPrecisionFarming;
    const scanned= field.isScanned;

    // ── Nitrogen ──────────────────────────────────────────────────────────────
    let nProgress = 0;
    let nColour   = "#6c757d";
    let nLabel    = field.nitrogenText || "0/2";

    if (isPF) {
        if (!scanned) {
            nLabel    = "Needs Scan";
            nColour   = "#dc3545";
            nProgress = 0;
        } else {
            const ratio = field.targetNitrogen > 0
                        ? field.nitrogenLevel / field.targetNitrogen : 0;
            nProgress = Math.min(100, ratio * 100);
            if      (ratio < 0.25) nColour = "#dc3545";
            else if (ratio < 0.60) nColour = "#fd7e14";
            else if (ratio < 0.90) nColour = "#ffc107";
            else if (ratio <= 1.10) nColour = "#198754";
            else                    nColour = "#0dcaf0";
        }
    } else {
        nProgress = (field.fertilizationLevel / 2) * 100;
        nColour   = field.fertilizationLevel === 0 ? "#dc3545"
                  : field.fertilizationLevel === 1 ? "#ffc107"
                  : "#198754";
    }

    // ── pH / Lime ─────────────────────────────────────────────────────────────
    // Mapped pH: bar range from Lua (soil-type-aware): phLimeBarMin → targetPh (optimal per soil samples).
    let phProgress = 0;
    let phColour   = "#6c757d";
    let phLabel    = field.limeText || (field.needsLime ? "Needed" : "Done");

    if (isPF) {
        if (!scanned) {
            phLabel    = "Needs Scan";
            phColour   = "#dc3545";
            phProgress = 0;
        } else {
            const pv = Number(field.phValue);
            const pvOk = Number.isFinite(pv) ? pv : 0;
            const tgt = Number(field.targetPh);
            const barMax = Number.isFinite(tgt) && tgt > 0 ? tgt
                : (Number(field.phLimeBarMax) > 0 ? Number(field.phLimeBarMax) : 6.5);
            const rawMin = Number(field.phLimeBarMin);
            let barMin = Number.isFinite(rawMin) && rawMin > 0 && rawMin < barMax
                ? rawMin
                : Math.max(4.3, barMax - 1.2);
            if (barMin >= barMax) barMin = Math.max(4.3, barMax - 1.2);
            const span = barMax - barMin;
            phProgress = span > 0
                ? Math.max(0, Math.min(100, ((pvOk - barMin) / span) * 100))
                : (field.needsLime ? 0 : 100);
            let ratio;
            if (field.targetPh > 0) {
                ratio = pvOk / field.targetPh;
            } else {
                ratio = span > 0
                    ? Math.max(0, Math.min(1, (pvOk - barMin) / span))
                    : 0;
            }
            if      (ratio < 0.80) phColour = "#dc3545";
            else if (ratio < 0.90) phColour = "#fd7e14";
            else if (ratio < 0.98) phColour = "#ffc107";
            else if (ratio <= 1.05) phColour = "#198754";
            else                    phColour = "#0dcaf0";
        }
    } else {
        phProgress = field.needsLime ? 0 : 100;
        phColour   = field.needsLime ? "#dc3545" : "#198754";
    }

    return `
        <div class="row g-2">
            <div class="col-6">
                <small class="text-muted">Nitrogen</small><br>
                <strong style="color:${nColour};font-size:0.8rem;">${nLabel}</strong>
                <div class="progress mt-1" style="height:4px;background:#2c2c2c;">
                    <div class="progress-bar" style="width:${nProgress}%;background:${nColour};"></div>
                </div>
            </div>
            <div class="col-6">
                <small class="text-muted">pH / Lime</small><br>
                <strong style="color:${phColour};font-size:0.8rem;">${phLabel}</strong>
                <div class="progress mt-1" style="height:4px;background:#2c2c2c;">
                    <div class="progress-bar" style="width:${phProgress}%;background:${phColour};"></div>
                </div>
            </div>
        </div>`;
}

/** No harvest tips after harvest or when mulched stubble (XML/Lua can leave harvestReady true). */
function shouldSuppressHarvestSuggestions(field) {
    if (fieldIsAlreadyHarvested(field)) return true;
    if (field.growthLabel === "mulched_fallow" || field.fruitType === "mulched_stubble") return true;
    if (field.isMulched === true) return true;
    if (fieldIsMulched(field) && (field.growthState || 0) === 0) return true;
    return false;
}

function escapeFieldHtml(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** Visible tags when the mod detects bales on farmland or loose windrow / swath material. */
function buildForageDetectionBadges(field) {
    const baleN = getBaleCountStrict(field);
    const hasForage = field.hasLooseForage === true;
    const wind = aggregateWindrowDetected(field);
    const baleLoose = aggregateBaleableLoose(field);
    if (baleN <= 0 && !wind && !baleLoose && !hasForage) return "";

    const parts = [];
    if (baleN > 0) {
        parts.push(
            `<span class="badge bg-warning text-dark" title="Bales counted on this farmland (game items)"><i class="bi bi-box-seam me-1"></i>${baleN} bale${baleN === 1 ? "" : "s"}</span>`
        );
    }
    if (field.hasLooseStraw === true) {
        parts.push(
            `<span class="badge bg-info text-dark" title="Loose straw detected on field samples"><i class="bi bi-circle-square me-1"></i>Loose straw</span>`
        );
    }
    if (field.hasLooseGrassWindrow === true) {
        parts.push(
            `<span class="badge bg-info text-dark" title="Grass windrow detected on field samples"><i class="bi bi-circle-square me-1"></i>Grass windrow</span>`
        );
    }
    if (field.hasLooseHayWindrow === true) {
        parts.push(
            `<span class="badge bg-info text-dark" title="Hay / dry grass windrow detected on field samples"><i class="bi bi-circle-square me-1"></i>Hay windrow</span>`
        );
    }
    if (!hasForage && baleLoose) {
        const bl = Number(field.baleableLooseLiters ?? 0);
        const sub = Number.isFinite(bl) && bl > 0 ? ` ~${Math.round(bl)} L` : "present";
        parts.push(
            `<span class="badge bg-info text-dark" title="Loose material a baler can pick up (height-map)"><i class="bi bi-circle-square me-1"></i>Bale loose · ${sub}</span>`
        );
    }
    if (!hasForage && wind) {
        const mat = classifyWindrowMaterial(field);
        const lit = Number(field.windrowLiters ?? 0);
        const matHint =
            mat === "straw"
                ? "Straw"
                : mat === "grass"
                  ? "Grass"
                  : mat === "hay"
                    ? "Hay"
                    : mat === "crop_swath"
                      ? "Swath"
                      : "Windrow";
        const sub =
            lit > 0
                ? ` ~${Math.round(lit)} (probe sum)`
                : "on ground";
        parts.push(
            `<span class="badge bg-success" title="Any loose fill on field samples (includes crop swaths)"><i class="bi bi-wind me-1"></i>${matHint} · ${sub}</span>`
        );
    }
    return `<div class="d-flex flex-wrap gap-1 mt-2 mb-1">${parts.join("")}</div>`;
}

/** Merged weather (XML) exposes currentSeason — WINTER means little/no arable growth in FS. */
function isWinterSeasonFromDashboard() {
    const s = window.dashboard?.weather?.currentSeason;
    if (!s) return false;
    return String(s).toUpperCase() === "WINTER";
}

/**
 * Seasonal context for arable crops: winter readings can look “stale” because growth pauses.
 * Grass is excluded (perennial / may still respond differently).
 */
function getWinterFieldSeasonalNote(field) {
    if (!isWinterSeasonFromDashboard()) return "";
    if (String(field.fruitType || "").toUpperCase() === "GRASS") return "";
    const hasCrop = (field.fruitTypeIndex || 0) > 0 && (field.growthState || 0) > 0;
    if (!hasCrop) return "";
    if (field.harvestReady || fieldIsAlreadyHarvested(field)) return "";
    return "Winter: arable growth is minimal — field readings may look unchanged until spring. Suggestions still reflect soil prep and planning.";
}

/**
 * VPS LLM lines can be cached while field cards already updated (or vice versa). Drop AI text that
 * clearly contradicts harvest/growth badges (e.g. "get the combine" on a harvested bar).
 */
function aiFieldInsightContradictsCard(field, ai) {
    if (!ai || !field) return false;
    const msg = `${String(ai.message || "")} ${String(ai.reasoning || "")}`;
    if (!msg.trim()) return false;
    const lower = msg.toLowerCase();

    const soundsLikeHarvestRun = /\b(combine|harvester|forage harvester)\b/i.test(msg)
        || /\b(bring it in|ready to go|ready to harvest)\b/i.test(lower);

    if (shouldSuppressHarvestSuggestions(field) && soundsLikeHarvestRun) return true;

    const gs = Number(field.growthState || 0);
    const maxGs = Math.max(1, Number(field.maxGrowthState) || 1);
    const midGrow = gs > 0 && gs < maxGs && !fieldIsAlreadyHarvested(field) && !effectiveHarvestReady(field);
    if (midGrow && soundsLikeHarvestRun) return true;

    if (gs >= 1 && !fieldIsAlreadyHarvested(field) && /\b(all plowed|plowed up|ready for a new crop)\b/i.test(lower)) {
        return true;
    }
    return false;
}

/** Hectares come from live Lua + merge; without FS running they are often missing → avoid fake "0.00". */
function formatFieldHectares(field) {
    const ha = Number(field?.hectares);
    if (Number.isFinite(ha) && ha > 0.001) {
        return `${ha.toFixed(2)} ha`;
    }
    return '<span class="text-muted" title="Area is supplied when Farming Simulator is running and the dashboard mod can read field geometry. If the game is closed, area may be unavailable.">—</span>';
}

// ── Suggested Next Step: Layer 1 rules (local) + optional Layer 2 AI (VPS, field_ref) ──
function pickApiFallbackSuggestion(field) {
    if (!field.suggestions || field.suggestions.length === 0) return null;
    let sorted = [...field.suggestions].sort((a, b) => (a.priority || 9) - (b.priority || 9));
    if (shouldSuppressHarvestSuggestions(field)) {
        sorted = sorted.filter(s => {
            const t = (s.type || "").toLowerCase();
            if (t === "harvest") return false;
            const act = (s.action || "").toLowerCase();
            if (act.startsWith("harvest")) return false;
            return true;
        });
    }
    const top = sorted.find(s => s && s.action);
    if (!top) return null;
    return {
        action: top.action,
        reason: top.reason || "",
        source: "rules",
    };
}

function buildSuggestion(field) {
    const seasonalNote = getWinterFieldSeasonalNote(field);
    let rulesLocal = getLocalFieldSuggestion(field);
    const rulesApi = pickApiFallbackSuggestion(field);
    if (
        rulesLocal &&
        rulesLocal.action === RULES_ENGINE_FALLBACK_ACTION &&
        rulesApi
    ) {
        rulesLocal = rulesApi;
    }
    const rules = rulesLocal || rulesApi;

    const aiMap = typeof window !== "undefined" && window.__fieldConsultantByRef ? window.__fieldConsultantByRef : null;
    const ai = lookupFieldConsultantInsight(aiMap, field);
    let useAi = !!(ai && (ai.message || "").trim());
    if (useAi && aiFieldInsightContradictsCard(field, ai)) {
        useAi = false;
    }

    const action = useAi ? String(ai.message).trim() : (rules ? rules.action : "");
    const detail = useAi ? String(ai.reasoning || "").trim() : (rules ? rules.reason : "");
    const layer = useAi ? "ai" : "rules";

    const layerBadge =
        layer === "ai"
            ? `<span class="badge bg-info text-dark ms-1 field-suggestion-layer-ai" title="AI Consultant (VPS + your API key)"><i class="bi bi-stars me-1"></i>AI</span>`
            : `<span class="badge bg-secondary ms-1 field-suggestion-layer-rules" title="Local rules / game data"><i class="bi bi-diagram-3 me-1"></i>Rules</span>`;

    const borderClass = layer === "ai" ? "border-info" : "border-warning";

    if (!action && !seasonalNote) return "";

    if (!action && seasonalNote) {
        return `
        <div class="mt-3 p-2 bg-dark rounded border-start border-info border-3">
            <small class="text-muted d-block">Season</small>
            <span class="text-info small"><i class="bi bi-snow me-1"></i>${escapeFieldHtml(seasonalNote)}</span>
        </div>`;
    }

    return `
        <div class="mt-3 p-2 bg-dark rounded border-start ${borderClass} border-3 field-suggestion-card field-suggestion-layer-${layer}">
            ${seasonalNote ? `<div class="text-info small mb-2 border-bottom border-secondary pb-2">
                <i class="bi bi-snow me-1"></i>${escapeFieldHtml(seasonalNote)}
            </div>` : ""}
            <div class="d-flex align-items-center flex-wrap gap-1 mb-1">
                <small class="text-muted d-block mb-0">Suggested next step</small>
                ${layerBadge}
            </div>
            <span class="${layer === "ai" ? "text-info" : "text-warning"} fw-bold d-block" style="font-size:0.85rem;">
                <i class="bi ${layer === "ai" ? "bi-stars" : "bi-tools"} me-1"></i>${escapeFieldHtml(action)}
            </span>
            ${detail ? `<span class="d-block text-light small mt-1 opacity-75">
                <i class="bi bi-info-circle me-1"></i>${escapeFieldHtml(detail)}
            </span>` : ""}
        </div>`;
}

// ── Filter buttons ────────────────────────────────────────────────────────────
export function filterFields(type) {
    fieldsFilterType = type;
    fieldsSearchTerm = document.getElementById("field-search")?.value || "";
    renderFields(fieldsFilterType, fieldsSearchTerm);

    document.querySelectorAll('[onclick^="dashboard.filterFields"]')
            .forEach(b => b.classList.remove("active"));
    if (window.event?.currentTarget) {
        window.event.currentTarget.classList.add("active");
    }
}

export function searchFields(term) {
    fieldsSearchTerm = term;
    renderFields(fieldsFilterType, fieldsSearchTerm);
}

/** Manual refresh of VPS field consultant map (force=true clears farm memory cache; else rate-limit per farm when state unchanged). */
export function refreshFieldConsultantAI() {
    return refreshFieldConsultantCache({ force: true }).catch((e) => {
        console.warn("[fields] AI consultant refresh", e);
    });
}

// ── Error state ───────────────────────────────────────────────────────────────
function showFieldsApiError() {
    const el = document.getElementById("fields-list");
    if (!el) return;
    // Only show error if we have no data at all
    if (currentFields.length > 0) return;
    el.innerHTML = `
        <div class="col-12 text-center py-5 text-muted">
            <i class="bi bi-wifi-off display-1 mb-3"></i>
            <h4>Cannot reach API</h4>
            <p>Make sure FS25 is running and the FarmDashboard mod is active.</p>
            <small>Retrying every 5 seconds…</small>
        </div>`;
}

// ── Static HTML shell ─────────────────────────────────────────────────────────
function buildFieldsHTML() {
    return `
        <div class="row mb-4">
            <div class="col-12 text-center">
                <h2 class="text-farm-accent">
                    <i class="bi bi-geo-alt me-2"></i>Field Management
                </h2>
                <p class="lead text-muted">Live field data — refreshes every 5 seconds</p>
            </div>
        </div>

        <div class="row mb-4">
            <div class="col-md-3">
                <div class="card bg-farm-primary text-white border-0">
                    <div class="card-body text-center">
                        <h5 class="card-title">Total Fields</h5>
                        <h2 class="display-4" id="total-fields-count">—</h2>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card bg-success text-white border-0">
                    <div class="card-body text-center">
                        <h5 class="card-title">Total Area</h5>
                        <h2 class="display-4" id="total-area">—</h2>
                        <small>hectares</small>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card bg-warning border-0">
                    <div class="card-body text-center">
                        <h5 class="card-title fw-semibold text-farm-warning">Needs Work</h5>
                        <h2 class="display-4 fw-bold text-farm-warning" id="fields-need-work">—</h2>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card bg-info text-white border-0">
                    <div class="card-body text-center">
                        <h5 class="card-title">Harvest Ready</h5>
                        <h2 class="display-4" id="fields-harvest-ready">—</h2>
                    </div>
                </div>
            </div>
        </div>

        <div class="row ai-insights-slot-after-kpis justify-content-center">
            <div class="col-12" id="ai-insights-slot-section"></div>
        </div>

        <div class="row mb-3">
            <div class="col-md-6 d-flex gap-2 flex-wrap align-items-center">
                <button type="button" class="btn btn-outline-success btn-sm" onclick="dashboard.refreshFieldConsultantAI()" title="Refresh AI field tips (per-farm memory when unchanged; max once per 8 min per farm+state unless forced)">
                    <i class="bi bi-stars me-1"></i>AI field tips
                </button>
                <button class="btn btn-outline-primary active"
                        onclick="dashboard.filterFields('all')">All</button>
                <button class="btn btn-outline-warning"
                        onclick="dashboard.filterFields('harvest')">
                    <i class="bi bi-scissors me-1"></i>Harvest Ready
                </button>
                <button class="btn btn-outline-danger"
                        onclick="dashboard.filterFields('needswork')">
                    <i class="bi bi-exclamation-triangle me-1"></i>Needs Work
                </button>
                <button class="btn btn-outline-info"
                        onclick="dashboard.filterFields('growing')">
                    <i class="bi bi-flower1 me-1"></i>Growing
                </button>
                <button class="btn btn-outline-secondary"
                        onclick="dashboard.filterFields('empty')">Empty</button>
            </div>
            <div class="col-md-6">
                <div class="input-group">
                    <span class="input-group-text bg-secondary text-white">
                        <i class="bi bi-search"></i>
                    </span>
                    <input type="text" id="field-search"
                           class="form-control bg-secondary border-secondary text-white"
                           placeholder="Search fields or crops…"
                           oninput="dashboard.searchFields(this.value)">
                </div>
            </div>
        </div>

        <div class="row mb-2 d-none" id="field-ai-thinking-row" aria-live="polite">
            <div class="col-12">
                <div class="alert alert-dark border-secondary py-2 px-3 mb-0 d-flex align-items-center gap-2">
                    <div class="spinner-grow spinner-grow-sm text-info" role="status"></div>
                    <span class="small text-muted mb-0">AI thinking… loading field suggestions from your host.</span>
                </div>
            </div>
        </div>

        <div class="row" id="fields-list">
            <div class="col-12 text-center py-5">
                <div class="spinner-border text-primary" role="status"></div>
                <p class="mt-3 text-muted">Loading field data…</p>
            </div>
        </div>`;
}

// ── Utility ───────────────────────────────────────────────────────────────────
function formatCropName(name) {
    if (name == null || String(name).trim() === "") return "Empty";
    const n = String(name).trim().toLowerCase();
    if (n === "empty" || n === "unknown") return "Empty";
    if (n === "mulched_stubble") return "Mulched stubble";
    if (n === "beetroot") return "Sugar beet";
    return String(name).replace(/_/g, " ")
               .replace(/\b\w/g, c => c.toUpperCase());
}