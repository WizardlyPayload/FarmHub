// FS25 FarmDashboard | fields.js | v2.0.0

import {
    getLocalFieldSuggestion,
    RULES_ENGINE_FALLBACK_KIND,
    getSuggestionOrderCatalog,
    getBaleCountStrict,
    aggregateWindrowDetected,
    aggregateBaleableLoose,
    classifyWindrowMaterial,
    fieldShowsNonBaleForageBadges,
    MIN_FORAGE_WORKFLOW_LITERS,
    nitrogenTargetForDisplay,
} from "../rules-engine.js";
import {
    refreshFieldRulesCache,
    scheduleFieldRulesCacheRefresh,
} from "../field-rules-cache.js";
import { buildToolGuidanceLines } from "../field-suggestion-tools.js";
import { buildFieldDisplayClusters, syntheticFieldFromCluster } from "../field-clusters.js";
import { t } from "../i18n/i18n.js";

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
/** Skip re-render when /api/fields body and client scope (farm/server) unchanged */
let lastFieldsPayloadKey = null;
let fieldRulesCacheListenerRegistered = false;
/** One row per field card (merged cluster or single field). */
let displayFieldRows = [];
const OPTIONAL_ORGANIC_SKIP_STORAGE_KEY = "farmdash_optional_organic_skip_v1";

function readOptionalOrganicSkipMap() {
    try {
        const raw = localStorage.getItem(OPTIONAL_ORGANIC_SKIP_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
        return {};
    }
}

function writeOptionalOrganicSkipMap(map) {
    try {
        localStorage.setItem(OPTIONAL_ORGANIC_SKIP_STORAGE_KEY, JSON.stringify(map || {}));
    } catch (e) {
        /* ignore */
    }
}

function optionalOrganicSkipKeyForField(field) {
    if (!field) return "";
    const id = String(field.farmlandId ?? field.id ?? "");
    if (!id) return "";
    const cyc = [
        String(field.fruitType || ""),
        String(field.growthLabel || ""),
        String(field.growthState ?? ""),
        String(field.isHarvested ? 1 : 0),
    ].join("|");
    return `${id}::${cyc}`;
}

function getFieldClusterPrefForActiveServer() {
    const sid =
        typeof window !== "undefined" && window.dashboard && window.dashboard.activeServerId != null
            ? String(window.dashboard.activeServerId)
            : "";
    const by =
        (typeof window !== "undefined" && window.dashboard && window.dashboard.fieldClusterPrefsByServer) || {};
    const raw = sid ? by[sid] : null;
    if (!raw || typeof raw !== "object") return { autoMerge: true, manualGroups: [] };
    return {
        autoMerge: raw.autoMerge !== false,
        manualGroups: Array.isArray(raw.manualGroups) ? raw.manualGroups : [],
    };
}

function rebuildDisplayFieldRows() {
    const clusters = buildFieldDisplayClusters(currentFields, getFieldClusterPrefForActiveServer());
    displayFieldRows = clusters.map((c) => syntheticFieldFromCluster(c)).filter(Boolean);
}

function ensureFieldRulesCacheListener() {
    if (fieldRulesCacheListenerRegistered || typeof window === "undefined") return;
    fieldRulesCacheListenerRegistered = true;
    window.addEventListener("farmdash-field-rules-cache-updated", () => {
        if (document.getElementById("fields-list")) {
            renderFields(fieldsFilterType, fieldsSearchTerm);
        }
    });
}

/** Mirrors getAPIBaseURL in apiStorage — cannot import apiStorage here (it imports this module). */
function resolveFarmdashApiBase() {
  if (typeof window !== "undefined" && window.location && /^https?:$/i.test(window.location.protocol || "")) {
    return window.location.origin;
  }
  return "http://127.0.0.1:8766";
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
    ensureFieldRulesCacheListener();
    try {
        const m = typeof window !== "undefined" ? window.__fieldRulesInsightByRef : null;
        const empty = !m || typeof m !== "object" || Object.keys(m).length === 0;
        if (empty) scheduleFieldRulesCacheRefresh();
    } catch (e) {
        /* ignore */
    }

    document.getElementById("section-content-dynamic").innerHTML = buildFieldsHTML();
    document.getElementById("section-content").classList.remove("d-none");

    // Stop any previous refresh loop
    stopFieldsRefresh();

    if (window.dashboard?.fields && Array.isArray(window.dashboard.fields)) {
        currentFields = window.dashboard.fields;
        rebuildDisplayFieldRows();
    }

    // Initial load; live updates come from RealtimeConnector (/api/data → updateFieldsData).
    // Light safety poll only while this tab is open (avoids duplicate full fetch every 5s).
    loadFieldsData();
    fieldsRefreshTimer = setInterval(loadFieldsData, 45000);
}

// Called by navigation when leaving the section
export function showFieldsErrorState() {
    stopFieldsRefresh();
}

/** Call after farm switch so the next load is not skipped by a stale payload fingerprint. */
export function invalidateFieldsClientCache() {
    lastFieldsPayloadKey = null;
}

/** Stop the Fields-tab poll when leaving the section (otherwise /api/fields + renders keep running in background). */
export function stopFieldsRefresh() {
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

        const clusterKey = JSON.stringify(
            (typeof window !== "undefined" && window.dashboard && window.dashboard.fieldClusterPrefsByServer) || {}
        );
        const scopeKey =
            JSON.stringify(fields) +
            "|" +
            String(farmId) +
            "|" +
            String(serverId ?? "") +
            "|" +
            clusterKey;
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

        rebuildDisplayFieldRows();
        renderFields(fieldsFilterType, fieldsSearchTerm);
        updateFieldStats();
        updateLandingCount();

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
    rebuildDisplayFieldRows();
    renderFields(fieldsFilterType, fieldsSearchTerm);
}

function updateLandingCount() {
    // Landing card counts are centralized in navigation.updateLandingPageCounts().
    if (window.dashboard && typeof window.dashboard.updateLandingPageCounts === "function") {
        window.dashboard.updateLandingPageCounts();
    }
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ── Render field cards ────────────────────────────────────────────────────────
function renderFields(filterType = "all", searchTerm = "") {
    const container = document.getElementById("fields-list");
    if (!container) return;

    if (displayFieldRows.length === 0 && currentFields.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-5 text-muted">
                <i class="bi bi-hourglass-split display-1 mb-3"></i>
                <h4>${escapeFieldHtml(t("fields.waitingDataTitle"))}</h4>
                <p>${escapeFieldHtml(t("fields.waitingDataBody"))}</p>
            </div>`;
        return;
    }

    const rows = displayFieldRows.length ? displayFieldRows : currentFields;
    let filtered = rows.filter((f) => {
        // Status filter
        const status = getFieldStatus(f);
        if (filterType !== "all" && status !== filterType) return false;
        // Search filter
        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            const idStr = (f._clusterFieldIds || []).join(" ");
            return (
                (f.name || "").toLowerCase().includes(q) ||
                (f.fruitType || "").toLowerCase().includes(q) ||
                idStr.includes(q)
            );
        }
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="col-12 text-center py-4 text-muted">${escapeFieldHtml(
            t("fields.noFilterMatch")
        )}</div>`;
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
    if (gl === "growing" || gl === "mown_regrowth") return false;
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
    const pfBadges   = buildPfBadges(field);
    const clusterNote =
        Array.isArray(field._clusterFields) && field._clusterFields.length > 1
            ? `<div class="small text-muted mb-2">${escapeFieldHtml(
                  t("fields.clusterMerged", {
                      count: field._clusterFields.length,
                      lead: Number(field._clusterFieldIds?.[0] ?? field.farmlandId ?? field.id),
                  })
              )}</div>`
            : "";

    const clusterAttr = field._displayClusterId ? ` data-cluster-id="${escapeFieldHtml(field._displayClusterId)}"` : "";

    return `
        <div class="col-md-6 col-lg-4 mb-4 field-card" data-status="${status}"${clusterAttr}>
            <div class="card bg-secondary h-100 shadow-sm">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">
                        <i class="bi bi-geo-alt-fill text-primary me-1"></i>
                        ${field.name || t("fields.fieldNameFallback", { id: field.id })}
                        ${pfBadges}
                    </h5>
                    ${badge}
                </div>
                <div class="card-body">
                    ${clusterNote}
                    <div class="row mb-2">
                        <div class="col-6">
                            <small class="text-muted d-block">${escapeFieldHtml(t("fields.cardArea"))}</small>
                            <strong>${formatFieldHectares(field)}</strong>
                        </div>
                        <div class="col-6">
                            <small class="text-muted d-block">${escapeFieldHtml(t("fields.cardCrop"))}</small>
                            <strong>${formatCropName(field.fruitType)}</strong>
                        </div>
                    </div>
                    ${buildForageDetectionBadges(field)}
                    ${buildWindrowVolumeBadge(field)}
                    ${progress}
                    <div class="mt-3">${conditions}</div>
                    ${suggestion}
                </div>
            </div>
        </div>`;
}

function buildPfBadges(field) {
    if (!field?.isPrecisionFarming) return "";
    const pfBadge = `<span class="badge bg-info text-dark ms-1" title="${escapeFieldHtml(t("fields.pfMappingTitle"))}">
            <i class="bi bi-cpu me-1"></i>PF
        </span>`;
    const scanBadge = field.isScanned
        ? `<span class="badge bg-success ms-1">${escapeFieldHtml(t("fields.scanned"))}</span>`
        : `<span class="badge bg-danger ms-1">${escapeFieldHtml(t("fields.needsScan"))}</span>`;
    return `${pfBadge}${scanBadge}`;
}

// ── Status badge ──────────────────────────────────────────────────────────────
function buildStatusBadge(field) {
    if (fieldShowsWithered(field))
        return `<span class="badge bg-danger">${escapeFieldHtml(t("fields.badgeWithered"))}</span>`;
    if (field.isHarvested)
        return `<span class="badge" style="background:#8d6e63">${escapeFieldHtml(t("fields.badgeHarvested"))}</span>`;
    if (isMulchedEmptyField(field)) {
        return `<span class="badge" style="background:${MULCH_PURPLE};color:${MULCH_PURPLE_FG}">${escapeFieldHtml(
            t("fields.badgeMulched")
        )}</span>`;
    }
    if (effectiveHarvestReady(field))
        return `<span class="badge" style="background:#ff9800;color:#000">${escapeFieldHtml(
            t("fields.badgeReady")
        )}</span>`;
    if (field.needsWork || field.needsRolling)
        return `<span class="badge bg-warning text-dark">${escapeFieldHtml(t("fields.badgeNeedsWork"))}</span>`;
    if ((field.growthState || 0) > 0)
        return `<span class="badge bg-info text-dark">${escapeFieldHtml(t("fields.badgeGrowing"))}</span>`;
    return `<span class="badge bg-dark border border-secondary">${escapeFieldHtml(t("fields.badgeEmpty"))}</span>`;
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

/** Grass: map shows 4 growth steps; higher engine stages = after cut / regrowth. */
function grassStageCapForBar(field) {
    let max = Math.max(1, Number(field.maxGrowthState) || 4);
    if ((field.fruitType || "").toUpperCase() === "GRASS" && max > 4) max = 4;
    return max;
}

/** Prefer mod `grassRingStage` (1–4) so mown regrowth never shows e.g. 5/4 vs the map. */
function grassRingCurMax(field) {
    const ftU = (field.fruitType || "").toUpperCase();
    if (ftU !== "GRASS") return null;
    const max = grassStageCapForBar(field);
    const ring = Number(field.grassRingStage);
    if (Number.isFinite(ring) && ring > 0) {
        return { cur: Math.min(ring, max), max };
    }
    const rawGs = Number(field.growthState) || 0;
    if (rawGs > max) {
        return { cur: ((rawGs - 1) % max) + 1, max };
    }
    return { cur: Math.min(rawGs, max), max };
}

/**
 * Mown / second-growth bars — always show engine stage vs map cap (not only “mown · regrowing”).
 * Spinach uses the same when the save reports regrowth-style labels.
 */
function tryRegrowthProgressBar(field) {
    const ftU = (field.fruitType || "").toUpperCase();
    const gl = String(field.growthLabel || "").toLowerCase();
    const rawGs = Number(field.growthState) || 0;
    const pct = Math.min(100, Math.max(0, field.growthStatePercentage || 0));
    const bg = greenGradientForPercent(pct);
    const fg = contrastForBg(bg);

    if (ftU === "GRASS") {
        const cap = grassStageCapForBar(field);
        const rm = grassRingCurMax(field);
        const cur = rm ? rm.cur : Math.min(rawGs, cap);
        if (gl === "mown_regrowth" || rawGs > cap) {
            return barHTML(pct, bg, t("fields.barMownRegrowing", { cur, max: cap }), fg);
        }
    }
    if (ftU === "SPINACH" && (gl === "mown_regrowth" || gl.includes("regrow") || gl.includes("mown"))) {
        const cap = Math.max(1, Number(field.maxGrowthState) || 1);
        return barHTML(pct, bg, t("fields.barSpinachRegrowing", { cur: rawGs, max: cap }), fg);
    }
    return null;
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function buildProgressBar(field) {
    if (fieldShowsWithered(field)) {
        return barHTML(100, "#8b0000", t("fields.badgeWithered"), "#fff");
    }

    const regrowthBar = tryRegrowthProgressBar(field);
    if (regrowthBar) return regrowthBar;

    if (isGrowingBarField(field)) {
        const pct = Math.min(100, Math.max(0, field.growthStatePercentage || 0));
        let max = Math.max(1, Number(field.maxGrowthState) || 1);
        const ftU = (field.fruitType || "").toUpperCase();
        if (ftU === "GRASS" && max > 4) max = 4;
        const rawGs = Number(field.growthState) || 0;
        const rm = ftU === "GRASS" ? grassRingCurMax(field) : null;
        let cur = rm ? rm.cur : rawGs;
        if (!rm && cur > max) cur = max;
        const bg = greenGradientForPercent(pct);
        const fg = contrastForBg(bg);
        const label =
            ftU === "SPINACH"
                ? t("fields.barSpinachGrowing", { cur, max })
                : t("fields.barGrowingStage", { cur, max });
        return barHTML(pct, bg, label, fg);
    }

    if (effectiveHarvestReady(field)) {
        return barHTML(100, HARVEST_ORANGE, t("fields.barReadyToHarvest"), "#000");
    }

    if (isSoilTilledField(field)) {
        return barHTML(100, SOIL_TILLED_BG, t("fields.barPlowedCultivated"), SOIL_TILLED_FG);
    }

    if (fieldIsMulched(field) && (field.growthState || 0) === 0) {
        return barHTML(100, MULCH_PURPLE, t("fields.badgeMulched"), MULCH_PURPLE_FG);
    }

    if (fieldIsAlreadyHarvested(field) || isPostHarvestField(field)) {
        return barHTML(100, "#6d4c41", t("fields.barHarvested"), "#fff");
    }

    if (!field.growthState || field.growthState === 0) {
        return barHTML(100, "#5d4037", t("fields.badgeEmpty"), "#f5f5f5");
    }

    const pct = field.growthStatePercentage || 0;
    let max = Math.max(1, Number(field.maxGrowthState) || 1);
    const ftU = (field.fruitType || "").toUpperCase();
    if (ftU === "GRASS" && max > 4) max = 4;
    const rawGs = Number(field.growthState) || 0;
    if (ftU === "GRASS" && rawGs > max) {
        const cap = grassStageCapForBar(field);
        const rm = grassRingCurMax(field);
        const cur = rm ? rm.cur : ((rawGs - 1) % cap) + 1;
        const bg = greenGradientForPercent(Math.min(100, pct));
        return barHTML(
            pct,
            bg,
            t("fields.barMownRegrowing", { cur, max: cap }),
            contrastForBg(bg)
        );
    }
    let cur = rawGs;
    if (ftU === "GRASS") {
        const rm = grassRingCurMax(field);
        if (rm) cur = rm.cur;
    }
    if (cur > max) cur = max;
    const bg = greenGradientForPercent(pct);
    const tail =
        ftU === "SPINACH"
            ? t("fields.barSpinachStage", { cur, max })
            : t("fields.growingStageShort", { cur, max });
    return barHTML(pct, bg, tail, contrastForBg(bg));
}

function barHTML(pct, bg, label, textColour = "white") {
    return `
        <div class="mt-2">
            <div class="progress field-progress-track" style="height:20px;background:#2c2c2c;">
                <div class="progress-bar field-progress-fill"
                     style="width:${pct}%;background:${bg};"></div>
                <span class="field-progress-label fw-bold" style="color:${textColour};">
                    ${label}
                </span>
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
            nLabel    = t("fields.needsScan");
            nColour   = "#dc3545";
            nProgress = 0;
        } else {
            const tn = nitrogenTargetForDisplay(field);
            const ratio = tn > 0 ? field.nitrogenLevel / tn : 0;
            nProgress = Math.min(100, ratio * 100);
            if      (ratio < 0.25) nColour = "#dc3545";
            else if (ratio < 0.60) nColour = "#fd7e14";
            else if (ratio < 0.90) nColour = "#ffc107";
            else if (ratio <= 1.10) nColour = "#198754";
            else                    nColour = "#0dcaf0";
            const nl = Number(field.nitrogenLevel ?? 0);
            if (tn > 0) {
                const gap = Math.max(0, tn - nl);
                nLabel =
                    gap > 1
                        ? t("fields.pfNitrogenLevelsNeedGap", {
                              current: Math.round(nl),
                              target: Math.round(tn),
                              gap: Math.round(gap),
                          })
                        : t("fields.pfNitrogenLevels", {
                              current: Math.round(nl),
                              target: Math.round(tn),
                          });
            }
        }
    } else {
        const fl = Number(field.fertilizationLevel ?? 0);
        nProgress = (fl / 2) * 100;
        nColour   = fl === 0 ? "#dc3545"
                  : fl === 1 ? "#ffc107"
                  : "#198754";
        nLabel = t("fields.fertilizationLevel", { cur: fl });
    }

    // ── pH / Lime ─────────────────────────────────────────────────────────────
    // Mapped pH: bar range from Lua (soil-type-aware): phLimeBarMin → targetPh (optimal per soil samples).
    let phProgress = 0;
    let phColour   = "#6c757d";
    let phLabel    = field.limeText || (field.needsLime ? t("fields.phNeeded") : t("fields.phDone"));

    if (isPF) {
        if (!scanned) {
            phLabel    = t("fields.needsScan");
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
            if (Number.isFinite(tgt) && tgt > 0) {
                const gap = tgt - pvOk;
                phLabel =
                    gap > 0.05
                        ? t("fields.phTargetGap", {
                              current: pvOk.toFixed(1),
                              target: tgt.toFixed(1),
                              gap: gap.toFixed(1),
                          })
                        : t("fields.phTargetOk", {
                              current: pvOk.toFixed(1),
                              target: tgt.toFixed(1),
                          });
            }
        }
    } else {
        phProgress = field.needsLime ? 0 : 100;
        phColour   = field.needsLime ? "#dc3545" : "#198754";
        phLabel = field.needsLime ? t("fields.limeNeededSoil") : t("fields.limeOk");
    }

    return `
        <div class="row g-2">
            <div class="col-6">
                <small class="text-muted">${escapeFieldHtml(t("fields.soilNitrogen"))}</small><br>
                <strong style="color:${nColour};font-size:0.8rem;">${escapeFieldHtml(nLabel)}</strong>
                <div class="progress mt-1" style="height:4px;background:#2c2c2c;">
                    <div class="progress-bar" style="width:${nProgress}%;background:${nColour};"></div>
                </div>
            </div>
            <div class="col-6">
                <small class="text-muted">${escapeFieldHtml(t("fields.soilPhLime"))}</small><br>
                <strong style="color:${phColour};font-size:0.8rem;">${escapeFieldHtml(phLabel)}</strong>
                <div class="progress mt-1" style="height:4px;background:#2c2c2c;">
                    <div class="progress-bar" style="width:${phProgress}%;background:${phColour};"></div>
                </div>
            </div>
        </div>`;
}

/** No harvest tips after harvest or when mulched stubble (XML/Lua can leave harvestReady true). */
function shouldSuppressHarvestSuggestions(field) {
    if (fieldIsAlreadyHarvested(field)) return true;
    /** Same bar/badge bucket as ``buildProgressBar`` "Harvested" — stubble pipeline, not ready-to-cut. */
    if (isPostHarvestField(field)) return true;
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

/**
 * Mod export: `windrowLiters` + `windrowType` (Straw / Grass / Hay). Shown only when both are meaningful.
 */
function buildWindrowVolumeBadge(field) {
    const L = Number(field?.windrowLiters ?? 0);
    if (!Number.isFinite(L) || L < MIN_FORAGE_WORKFLOW_LITERS) return "";
    const typ = field?.windrowType;
    if (typ == null || typ === "") return "";
    const raw = String(typ).trim();
    if (!raw) return "";
    const tl = raw.toLowerCase();
    let badgeClass = "bg-warning text-dark";
    let emoji = "🌾";
    if (tl === "grass") {
        badgeClass = "bg-success";
        emoji = "🌿";
    } else if (tl === "hay") {
        badgeClass = "bg-info text-dark";
        emoji = "🍂";
    } else if (tl === "straw") {
        badgeClass = "bg-warning text-dark";
        emoji = "🌾";
    } else {
        badgeClass = "bg-secondary";
        emoji = "🌾";
    }
    const label = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    const vol = Math.round(L).toLocaleString(undefined, { maximumFractionDigits: 0 });
    return `<div class="d-flex flex-wrap gap-1 mt-2 mb-1">
        <span class="badge ${badgeClass}" title="${escapeFieldHtml(t("fields.windrowBadgeTitle"))}">
            <span aria-hidden="true">${emoji}</span>
            <span class="ms-1">${escapeFieldHtml(label)}: ${escapeFieldHtml(vol)} L</span>
        </span>
    </div>`;
}

/** Visible tags when the mod detects bales on farmland or loose windrow / swath material. */
function buildForageDetectionBadges(field) {
    const baleN = getBaleCountStrict(field);
    const hasForage = field.hasLooseForage === true;
    const wind = aggregateWindrowDetected(field);
    const baleLoose = aggregateBaleableLoose(field);
    const ls = Number(field?.looseStrawLiters ?? 0);
    const lg = Number(field?.looseGrassWindrowLiters ?? 0);
    const lh = Number(field?.looseDryGrassWindrowLiters ?? 0);
    const combinedLooseLiters = ls + lg + lh;
    const hasMeaningfulLooseForage = combinedLooseLiters >= MIN_FORAGE_WORKFLOW_LITERS;
    const windrowLiters = Number(field?.windrowLiters ?? 0);
    const hasMeaningfulWindrowLiters =
        Number.isFinite(windrowLiters) && windrowLiters >= MIN_FORAGE_WORKFLOW_LITERS;
    if (baleN <= 0 && !hasForage && !fieldShowsNonBaleForageBadges(field)) return "";
    const showWindrowBadge = wind && (hasMeaningfulWindrowLiters || hasMeaningfulLooseForage);

    const parts = [];
    if (baleN > 0) {
        const baleLabel =
            baleN === 1 ? t("fields.baleCount", { count: baleN }) : t("fields.baleCountPlural", { count: baleN });
        parts.push(
            `<span class="badge bg-warning text-dark" title="${escapeFieldHtml(t("fields.balesOnFieldTitle"))}"><i class="bi bi-box-seam me-1"></i>${escapeFieldHtml(baleLabel)}</span>`
        );
    }
    if (field.hasLooseStraw === true && ls >= MIN_FORAGE_WORKFLOW_LITERS) {
        parts.push(
            `<span class="badge bg-info text-dark" title="${escapeFieldHtml(t("fields.looseStrawTitle"))}"><i class="bi bi-circle-square me-1"></i>${escapeFieldHtml(t("fields.looseStraw"))}</span>`
        );
    }
    const hasGrassWindrow = field.hasLooseGrassWindrow === true && lg >= MIN_FORAGE_WORKFLOW_LITERS;
    const hasHayWindrow = field.hasLooseHayWindrow === true && lh >= MIN_FORAGE_WORKFLOW_LITERS;
    // Never show both on the same field: prefer whichever loose windrow amount is larger.
    if (hasGrassWindrow || hasHayWindrow) {
        const showGrass = hasGrassWindrow && (!hasHayWindrow || lg >= lh);
        if (showGrass) {
            parts.push(
                `<span class="badge bg-info text-dark" title="${escapeFieldHtml(t("fields.grassWindrowTitle"))}"><i class="bi bi-circle-square me-1"></i>${escapeFieldHtml(t("fields.grassWindrow"))}</span>`
            );
        } else {
            parts.push(
                `<span class="badge bg-info text-dark" title="${escapeFieldHtml(t("fields.hayWindrowTitle"))}"><i class="bi bi-circle-square me-1"></i>${escapeFieldHtml(t("fields.hayWindrow"))}</span>`
            );
        }
    }
    if (!hasForage && baleLoose) {
        const bl = Number(field.baleableLooseLiters ?? 0);
        const sub =
            Number.isFinite(bl) && bl > 0
                ? t("fields.baleLooseLiters", { liters: Math.round(bl) })
                : t("fields.baleLoosePresent");
        parts.push(
            `<span class="badge bg-info text-dark" title="${escapeFieldHtml(t("fields.baleLooseTitle"))}"><i class="bi bi-circle-square me-1"></i>${escapeFieldHtml(sub)}</span>`
        );
    }
    if (!hasForage && showWindrowBadge) {
        const mat = classifyWindrowMaterial(field);
        const lit = hasMeaningfulWindrowLiters ? windrowLiters : combinedLooseLiters;
        const matHint =
            mat === "straw"
                ? t("fields.windrowMatStraw")
                : mat === "grass"
                  ? t("fields.windrowMatGrass")
                  : mat === "hay"
                    ? t("fields.windrowMatHay")
                    : mat === "crop_swath"
                      ? t("fields.windrowMatSwath")
                      : t("fields.windrowMatGeneric");
        const sub =
            lit > 0
                ? t("fields.windrowProbeSum", { liters: Math.round(lit) })
                : t("fields.windrowOnGround");
        parts.push(
            `<span class="badge bg-success" title="${escapeFieldHtml(t("fields.windrowAnyTitle"))}"><i class="bi bi-wind me-1"></i>${escapeFieldHtml(matHint)} · ${escapeFieldHtml(sub)}</span>`
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
    return t("fields.winterSeasonNote");
}

/** Hectares come from live Lua + merge; without FS running they are often missing → avoid fake "0.00". */
function formatFieldHectares(field) {
    const ha = Number(field?.hectares);
    if (Number.isFinite(ha) && ha > 0.001) {
        return `${ha.toFixed(2)} ha`;
    }
    return `<span class="text-muted" title="${escapeFieldHtml(t("fields.hectaresUnavailableTitle"))}">—</span>`;
}

// ── Suggested next step: offline rules + game suggestions[] ──
const SUGGESTION_TECH_TOKEN_RE =
    /\b(rollerLevel|plowLevel|needsPlowing|needsWork|mulchLevel|stubbleShredLevel|weedLevel|stoneLevel|sprayLevel|fruitTypeIndex)\b/gi;

function sanitizeSuggestionCopy(str) {
    if (str == null || typeof str !== "string") return str;
    return str
        .replace(SUGGESTION_TECH_TOKEN_RE, "")
        .replace(/\s{2,}/g, " ")
        .replace(/\s+([.,;:])/g, "$1")
        .trim();
}

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
        action: sanitizeSuggestionCopy(top.action),
        reason: sanitizeSuggestionCopy(top.reason || ""),
        source: "rules",
    };
}

function buildSuggestion(field) {
    const seasonalNote = getWinterFieldSeasonalNote(field);
    const gameSettings =
        (typeof window !== "undefined" && window.dashboard && window.dashboard.gameSettings) || {};
    const skippedOptionalOrganic = readOptionalOrganicSkipMap();
    let rulesLocal = getLocalFieldSuggestion(field, { gameSettings, skippedOptionalOrganic });
    const rulesApi = pickApiFallbackSuggestion(field);
    if (
        rulesLocal &&
        rulesLocal.kind === RULES_ENGINE_FALLBACK_KIND &&
        rulesApi
    ) {
        rulesLocal = rulesApi;
    }
    const rules = rulesLocal || rulesApi;

    const action = rules ? rules.action : "";

    const dash = typeof window !== "undefined" ? window.dashboard : null;
    const toolLines = action
            ? buildToolGuidanceLines(
                  dash?.vehicles,
                  Number(dash?.activeFarmId) || 1,
                  action,
                  field,
                  rules?.actionKey
              )
            : [];
    const fleetPrefix = `${t("tools.useFromYourFleet")}:`;
    const buyPrefix = `${t("tools.buyLeaseSuggestion")}:`;
    const fleetLines = toolLines.filter((line) => String(line).startsWith(fleetPrefix));
    const buyLeaseLines = toolLines.filter((line) => String(line).startsWith(buyPrefix));
    /** e.g. `tools.typicalToolsFallback` — no fleet/shop prefix; must still render or “lost” suggestions */
    const otherToolLines = toolLines.filter(
        (line) =>
            String(line).trim().length > 0 &&
            !String(line).startsWith(fleetPrefix) &&
            !String(line).startsWith(buyPrefix)
    );
    const rulesReason = rules && typeof rules.reason === "string" ? rules.reason.trim() : "";
    const showOrganicSkip = rules?.actionKey === "rules.action.optionalOrganicFirst";
    const organicSkipKey = showOrganicSkip ? optionalOrganicSkipKeyForField(field) : "";

    const layerBadge = `<span class="badge bg-secondary ms-1 field-suggestion-layer-rules" title="${escapeFieldHtml(
        t("fields.rulesLayerBadgeTitle")
    )}"><i class="bi bi-diagram-3 me-1"></i>${escapeFieldHtml(t("fields.rulesBadge"))}</span>`;

    const borderClass = "border-warning";

    if (!action && !seasonalNote) return "";

    if (!action && seasonalNote) {
        return `
        <div class="mt-3 p-2 bg-dark rounded border-start border-info border-3">
            <small class="text-muted d-block">${escapeFieldHtml(t("fields.season"))}</small>
            <span class="text-info small"><i class="bi bi-snow me-1"></i>${escapeFieldHtml(seasonalNote)}</span>
        </div>`;
    }

    return `
        <div class="mt-3 p-2 bg-dark rounded border-start ${borderClass} border-3 field-suggestion-card field-suggestion-layer-rules">
            ${seasonalNote ? `<div class="text-info small mb-2 border-bottom border-secondary pb-2">
                <i class="bi bi-snow me-1"></i>${escapeFieldHtml(seasonalNote)}
            </div>` : ""}
            <div class="d-flex align-items-center flex-wrap gap-1 mb-1">
                <small class="text-muted d-block mb-0">${escapeFieldHtml(t("fields.suggestedNextStep"))}</small>
                ${layerBadge}
            </div>
            <span class="text-warning fw-bold d-block" style="font-size:0.85rem;">
                <i class="bi bi-tools me-1"></i>${escapeFieldHtml(action)}
            </span>
            ${
                rulesReason
                    ? `<div class="text-muted small mt-2 lh-sm">${escapeFieldHtml(rulesReason)}</div>`
                    : ""
            }
            ${
                fleetLines.length || buyLeaseLines.length || otherToolLines.length
                    ? `<div class="mt-2 pt-2 border-top border-secondary">
                    ${
                        fleetLines.length
                            ? `<small class="text-secondary text-uppercase d-block mb-1" style="letter-spacing:0.04em;">${escapeFieldHtml(
                                  t("tools.useFromYourFleet")
                              )}</small>
                        ${fleetLines
                            .map(
                                (line) =>
                                    `<div class="small text-light opacity-90 lh-sm mb-1"><i class="bi bi-wrench-adjustable me-1 text-warning"></i>${escapeFieldHtml(
                                        line.replace(fleetPrefix, "").trim()
                                    )}</div>`
                            )
                            .join("")}`
                            : ""
                    }
                    ${
                        buyLeaseLines.length
                            ? `<small class="text-secondary text-uppercase d-block mb-1 mt-2" style="letter-spacing:0.04em;">${escapeFieldHtml(
                                  t("tools.buyLeaseSuggestion")
                              )}</small>
                        ${buyLeaseLines
                            .map(
                                (line) =>
                                    `<div class="small text-light opacity-90 lh-sm mb-1"><i class="bi bi-wrench-adjustable me-1 text-warning"></i>${escapeFieldHtml(
                                        line.replace(buyPrefix, "").trim()
                                    )}</div>`
                            )
                            .join("")}`
                            : ""
                    }
                    ${
                        otherToolLines.length
                            ? `<small class="text-secondary text-uppercase d-block mb-1 ${fleetLines.length || buyLeaseLines.length ? "mt-2" : ""}" style="letter-spacing:0.04em;">${escapeFieldHtml(
                                  t("tools.generalEquipmentHint")
                              )}</small>
                        ${otherToolLines
                            .map(
                                (line) =>
                                    `<div class="small text-light opacity-90 lh-sm mb-1"><i class="bi bi-info-circle me-1 text-info"></i>${escapeFieldHtml(
                                        String(line).trim()
                                    )}</div>`
                            )
                            .join("")}`
                            : ""
                    }
                </div>`
                    : ""
            }
            ${
                showOrganicSkip && organicSkipKey
                    ? `<div class="mt-2">
                    <button type="button"
                        class="btn btn-outline-secondary btn-sm"
                        onclick="dashboard.skipOptionalOrganicStep('${escapeFieldHtml(organicSkipKey)}')">
                        <i class="bi bi-skip-forward me-1"></i>${escapeFieldHtml(t("fields.skipOptionalOrganicStep"))}
                    </button>
                </div>`
                    : ""
            }
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

export function skipOptionalOrganicStep(skipKey) {
    if (!skipKey) return;
    const map = readOptionalOrganicSkipMap();
    map[String(skipKey)] = true;
    writeOptionalOrganicSkipMap(map);
    renderFields(fieldsFilterType, fieldsSearchTerm);
}

/** Rebuild field-card rules cache and re-paint when the event fires. */
export function refreshFieldRulesOnCards() {
    return refreshFieldRulesCache().catch((e) => {
        console.warn("[fields] rules refresh", e);
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
            <h4>${escapeFieldHtml(t("fields.apiErrorTitle"))}</h4>
            <p>${escapeFieldHtml(t("fields.apiErrorBody"))}</p>
            <small>${escapeFieldHtml(t("fields.apiErrorRetrying"))}</small>
        </div>`;
}

// ── Static HTML shell ─────────────────────────────────────────────────────────
function buildFieldsHTML() {
    return `
        <div class="row mb-4">
            <div class="col-12 text-center">
                <h2 class="text-farm-accent">
                    <i class="bi bi-geo-alt me-2"></i>${escapeFieldHtml(t("fields.title"))}
                </h2>
                <p class="lead text-muted">${escapeFieldHtml(t("fields.subtitle"))}</p>
            </div>
        </div>

        <div class="row mb-4">
            <div class="col-md-3">
                <div class="card bg-farm-primary text-white border-0">
                    <div class="card-body text-center">
                        <h5 class="card-title">${escapeFieldHtml(t("fields.totalFields"))}</h5>
                        <h2 class="display-4" id="total-fields-count">—</h2>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card bg-success text-white border-0">
                    <div class="card-body text-center">
                        <h5 class="card-title">${escapeFieldHtml(t("fields.totalArea"))}</h5>
                        <h2 class="display-4" id="total-area">—</h2>
                        <small>${escapeFieldHtml(t("fields.hectares"))}</small>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card bg-warning border-0">
                    <div class="card-body text-center">
                        <h5 class="card-title fw-semibold text-farm-warning">${escapeFieldHtml(t("fields.needsWork"))}</h5>
                        <h2 class="display-4 fw-bold text-farm-warning" id="fields-need-work">—</h2>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card bg-info text-white border-0">
                    <div class="card-body text-center">
                        <h5 class="card-title">${escapeFieldHtml(t("fields.harvestReady"))}</h5>
                        <h2 class="display-4" id="fields-harvest-ready">—</h2>
                    </div>
                </div>
            </div>
        </div>

        <div class="row mb-3">
            <div class="col-md-6 d-flex gap-2 flex-wrap align-items-center">
                <button type="button" class="btn btn-outline-success btn-sm" onclick="dashboard.refreshFieldRulesOnCards()" title="${escapeFieldHtml(t("fields.refreshRulesTitle"))}">
                    <i class="bi bi-tools me-1"></i>${escapeFieldHtml(t("fields.refreshRules"))}
                </button>
                <button class="btn btn-outline-primary active"
                        onclick="dashboard.filterFields('all')">${escapeFieldHtml(t("fields.filterAll"))}</button>
                <button class="btn btn-outline-warning"
                        onclick="dashboard.filterFields('harvest')">
                    <i class="bi bi-scissors me-1"></i>${escapeFieldHtml(t("fields.filterHarvestReady"))}
                </button>
                <button class="btn btn-outline-danger"
                        onclick="dashboard.filterFields('needswork')">
                    <i class="bi bi-exclamation-triangle me-1"></i>${escapeFieldHtml(t("fields.filterNeedsWork"))}
                </button>
                <button class="btn btn-outline-info"
                        onclick="dashboard.filterFields('growing')">
                    <i class="bi bi-flower1 me-1"></i>${escapeFieldHtml(t("fields.filterGrowing"))}
                </button>
                <button class="btn btn-outline-secondary"
                        onclick="dashboard.filterFields('empty')">${escapeFieldHtml(t("fields.filterEmpty"))}</button>
            </div>
            <div class="col-md-6">
                <div class="input-group">
                    <span class="input-group-text bg-secondary text-white">
                        <i class="bi bi-search"></i>
                    </span>
                    <input type="text" id="field-search"
                           class="form-control bg-secondary border-secondary text-white"
                           placeholder="${escapeFieldHtml(t("fields.searchPlaceholder"))}"
                           oninput="dashboard.searchFields(this.value)">
                </div>
            </div>
        </div>

        <div class="row" id="fields-list">
            <div class="col-12 text-center py-5">
                <div class="spinner-border text-primary" role="status"></div>
                <p class="mt-3 text-muted">${escapeFieldHtml(t("fields.loadingData"))}</p>
            </div>
        </div>`;
}

// ── Utility ───────────────────────────────────────────────────────────────────
function formatCropName(name) {
    if (name == null || String(name).trim() === "") return t("fields.formatCropEmpty");
    const n = String(name).trim().toLowerCase();
    if (n === "empty" || n === "unknown") return t("fields.formatCropEmpty");
    if (n === "mulched_stubble") return t("fields.formatCropMulchedStubble");
    if (n === "beetroot") return t("fields.formatCropBeetroot");
    return String(name).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}