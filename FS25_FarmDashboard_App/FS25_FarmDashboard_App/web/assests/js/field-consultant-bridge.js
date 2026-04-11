/**
 * Throttled fetch of /api/v1/consultant/insights → per-field AI lines (field_ref map).
 * Requires Farm Dashboard link key + AI backend URL (same as AI Farm bot panel).
 * BYOK: X-AI-API-Key from Electron store (Dashboard Settings).
 */

import { getFieldStableId } from "./rules-engine.js";

const MIN_INTERVAL_MS = 8 * 60 * 1000; // 8 minutes — avoid hammering VPS (same farm + same state only)
const LS_URL = "farmdash_ai_manager_base_url";
const LS_KEY = "farmdash_ai_integration_key";

/** In-memory consultant map per server+farm — instant restore when switching farms if field state unchanged */
const fieldConsultantFarmCache = new Map();

let inFlight = false;
let debounceId = null;
/** Last successful *network* fetch for throttle (same cache key + same state hash) */
let lastNetworkFetchAt = 0;
let lastNetworkKey = "";
let lastNetworkStateHash = "";

function emitFieldConsultantLoading(loading) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("field-consultant-loading", { detail: { loading: !!loading } })
    );
  } catch {
    /* ignore */
  }
}

function dashDebug(label, phase, payload) {
  if (typeof globalThis.dashAiDebug === "function") {
    globalThis.dashAiDebug(label, phase, payload);
  }
}

async function getBase() {
  const ls = (localStorage.getItem(LS_URL) || "").replace(/\/$/, "");
  if (ls) return ls;
  try {
    const { ipcRenderer } = require("electron");
    const c = await ipcRenderer.invoke("get-ai-manager-connection");
    if (c?.baseUrl) return String(c.baseUrl).replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  return "http://127.0.0.1:8080";
}

async function getIntegrationKey() {
  const ls = localStorage.getItem(LS_KEY) || "";
  if (ls) return ls;
  try {
    const { ipcRenderer } = require("electron");
    const c = await ipcRenderer.invoke("get-ai-manager-connection");
    return (c?.integrationKey || "").trim();
  } catch {
    return "";
  }
}

async function getByokHeaders() {
  try {
    const { ipcRenderer } = require("electron");
    const c = await ipcRenderer.invoke("get-consultant-byok-credentials");
    if (!c?.apiKey) return {};
    const h = { "X-AI-API-Key": c.apiKey };
    if (c.provider === "gemini" || c.provider === "openai") {
      h["X-AI-Provider"] = c.provider;
    }
    return h;
  } catch {
    return {};
  }
}

/**
 * Normalize LLM field_ref for map keys (must match backend _normalize_field_ref where possible).
 */
export function normalizeFieldRefKey(ref) {
  if (ref == null || ref === "") return "";
  let s = String(ref).trim();
  if (!s) return "";
  s = s.replace(/^field\s*#?\s*/i, "");
  s = s.replace(/^parcel\s*#?\s*/i, "");
  s = s.replace(/^farmland\s*#?\s*/i, "");
  s = s.replace(/^#+/, "").trim();
  if (!s) return "";
  const first = s.split(/\s+/)[0] || s;
  return first.length > 64 ? first.slice(0, 64) : first;
}

/** Register insight under all plausible string keys for numeric ids. */
function addInsightKeys(map, rawKey, ins) {
  const k = normalizeFieldRefKey(rawKey);
  if (!k) return;
  if (!map[k]) map[k] = ins;
  const n = Number(k);
  if (Number.isFinite(n)) {
    const a = String(n);
    const b = String(Math.trunc(n));
    if (!map[a]) map[a] = ins;
    if (b !== a && !map[b]) map[b] = ins;
  }
}

/** Pydantic/JSON may send category as "Field" or edge-case variants; field map only accepts Field. */
function insightCategoryIsField(cat) {
  if (cat == null) return false;
  const raw =
    typeof cat === "object" && cat !== null && "value" in cat ? (cat).value : cat;
  const s = String(raw).trim().replace(/^["']|["']$/g, "");
  return s.toLowerCase() === "field";
}

export function indexFieldConsultantInsights(insights) {
  const map = {};
  if (!Array.isArray(insights)) return map;
  for (const ins of insights) {
    if (!ins || !insightCategoryIsField(ins.category)) continue;
    if (normalizeFieldRefKey(ins.field_ref) === "") continue;
    addInsightKeys(map, ins.field_ref, ins);
  }
  return map;
}

/**
 * Match AI insight to a field using string-safe keys (farmlandId, id, stable id).
 */
/**
 * serverId + farmId — cache key for per-farm AI insight maps.
 */
function getConsultantFarmCacheKey() {
  const sid =
    (typeof window !== "undefined" &&
      window.dashboard &&
      window.dashboard.activeServerId) ||
    (typeof localStorage !== "undefined" ? localStorage.getItem("dashboard_active_server") : "") ||
    "";
  const farmId =
    typeof window !== "undefined" && window.dashboard && window.dashboard.activeFarmId != null
      ? String(window.dashboard.activeFarmId)
      : "1";
  return `${sid || ""}::${farmId}`;
}

/**
 * Stable fingerprint of active-farm field agronomic state for client-side deduplication (saves LLM tokens).
 * Include anything that should invalidate cached AI lines when it changes.
 */
function computeActiveFarmFieldsStateHash() {
  try {
    const d = typeof window !== "undefined" ? window.dashboard : null;
    if (!d) return "";
    let rows = d.fields;
    if (!Array.isArray(rows) || rows.length === 0) {
      rows = Array.isArray(d.allFields) ? d.allFields : [];
    }
    const farmId = Number(d.activeFarmId ?? 1);
    const filtered = rows.filter((f) => {
      if (!f || typeof f !== "object") return false;
      const oid = Number(f.ownerFarmId ?? f.farmId ?? 0);
      return oid === farmId;
    });
    const sig = filtered
      .map((f) => ({
        id: f.farmlandId ?? f.id,
        fruitType: f.fruitType,
        growthState: f.growthState,
        growthLabel: f.growthLabel,
        needsPlowing: f.needsPlowing,
        needsLime: f.needsLime,
        needsCultivation: f.needsCultivation,
        needsWork: f.needsWork,
        harvestReady: f.harvestReady,
        isWithered: f.isWithered,
        nitrogenLevel: f.nitrogenLevel,
        phValue: f.phValue,
        weedLevel: f.weedLevel,
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return JSON.stringify(sig);
  } catch (e) {
    return "";
  }
}

/**
 * Restore consultant map from per-farm memory if state matches. Updates DOM only when key/hash differs from last apply.
 * @returns {boolean} true if no network call is needed (cache served or already up to date)
 */
function tryApplyFieldConsultantFarmCache(cacheKey, stateHash, force) {
  if (force || !stateHash) return false;
  const entry = fieldConsultantFarmCache.get(cacheKey);
  if (!entry || entry.stateHash !== stateHash) return false;

  const prevK = typeof window !== "undefined" ? window.__fieldConsultantAppliedKey : null;
  const prevH = typeof window !== "undefined" ? window.__fieldConsultantAppliedHash : null;
  if (prevK === cacheKey && prevH === stateHash) {
    return true;
  }

  function apply() {
    if (typeof window === "undefined") return;
    window.__fieldConsultantByRef = { ...entry.byRef };
    window.__fieldConsultantLlmUsed = !!entry.llmUsed;
    window.__lastFieldStateHash = stateHash;
    window.__fieldConsultantAppliedKey = cacheKey;
    window.__fieldConsultantAppliedHash = stateHash;
    window.dispatchEvent(new CustomEvent("field-consultant-updated"));
  }
  if (typeof globalThis.dashFlushDomWork === "function") {
    globalThis.dashFlushDomWork(apply);
  } else {
    apply();
  }
  if (typeof globalThis.pipelineLog === "function") {
    globalThis.pipelineLog("renderer_ok", "field consultant restored from memory (farm cache)", {
      cacheKey,
      insightKeys: Object.keys(entry.byRef || {}).length,
    });
  }
  return true;
}

export function lookupFieldConsultantInsight(map, field) {
  if (!map || !field) return null;
  const candidates = [];
  const push = (v) => {
    if (v == null || v === "") return;
    candidates.push(v);
  };
  push(field.farmlandId);
  push(field.id);
  push(getFieldStableId(field));

  const tried = new Set();
  for (const v of candidates) {
    const k = normalizeFieldRefKey(v);
    if (!k || tried.has(k)) continue;
    tried.add(k);
    if (map[k]) return map[k];
    const n = Number(v);
    if (Number.isFinite(n)) {
      const a = String(n);
      const b = String(Math.trunc(n));
      if (map[a]) return map[a];
      if (map[b]) return map[b];
    }
  }
  return null;
}

function _parseInsightPriorityNum(p) {
  const raw = p && typeof p === "object" && p !== null && "value" in p ? (p).value : p;
  const t = String(raw ?? "").toLowerCase();
  if (t === "high") return 3;
  if (t === "low") return 1;
  return 2;
}

/** Rough urgency for tie-break (matches field card signals only; no FS rules import). */
function _fieldUrgencyTieBreak(field) {
  if (!field) return 0;
  let s = 0;
  const fruit = String(field.fruitType ?? "").toUpperCase();
  if (field.isWithered && fruit !== "GRASS") s += 100;
  if (field.harvestReady) s += 80;
  if (field.needsWork || field.needsRolling) s += 40;
  const w = Number(field.weedLevel ?? 0);
  if (w >= 0.5) s += 15;
  if (field.needsPlowing || field.needsLime || field.needsCultivation) s += 10;
  return s;
}

/**
 * Pick the single highest-priority field insight for the Smart suggestions panel (no extra LLM call).
 * Uses the same per-field map as the field cards (`__fieldConsultantByRef`).
 */
export function pickDoThisFirstFromFieldInsights(fields) {
  const map =
    typeof window !== "undefined" && window.__fieldConsultantByRef
      ? window.__fieldConsultantByRef
      : null;
  if (!map || !Array.isArray(fields) || fields.length === 0) return null;
  const candidates = [];
  for (const field of fields) {
    const ins = lookupFieldConsultantInsight(map, field);
    if (!ins || !String(ins.message ?? "").trim()) continue;
    candidates.push({ field, ins });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const pa = _parseInsightPriorityNum(a.ins.priority);
    const pb = _parseInsightPriorityNum(b.ins.priority);
    if (pb !== pa) return pb - pa;
    const ua = _fieldUrgencyTieBreak(a.field);
    const ub = _fieldUrgencyTieBreak(b.field);
    if (ub !== ua) return ub - ua;
    const ida = Number(a.field.farmlandId ?? a.field.id ?? 0);
    const idb = Number(b.field.farmlandId ?? b.field.id ?? 0);
    return ida - idb;
  });
  return candidates[0];
}

export async function refreshFieldConsultantCache({ force = false } = {}) {
  const now = Date.now();

  const intKey = await getIntegrationKey();
  if (!intKey) {
    if (typeof window !== "undefined") {
      window.__fieldConsultantByRef = {};
      window.dispatchEvent(new CustomEvent("field-consultant-updated"));
    }
    dashDebug("field-consultant-bridge", "skip", { reason: "no_integration_key" });
    return { skipped: true, reason: "no_integration_key" };
  }

  const cacheKey = getConsultantFarmCacheKey();
  const stateHash = computeActiveFarmFieldsStateHash();

  if (force) {
    fieldConsultantFarmCache.delete(cacheKey);
  }

  if (!force && stateHash && tryApplyFieldConsultantFarmCache(cacheKey, stateHash, false)) {
    dashDebug("field-consultant-bridge", "skip", { reason: "farm_cache_hit" });
    return { skipped: true, reason: "farm_cache_hit" };
  }

  if (inFlight) {
    dashDebug("field-consultant-bridge", "skip", { reason: "in_flight" });
    return { skipped: true, reason: "in_flight" };
  }

  if (!force) {
    if (
      lastNetworkKey === cacheKey &&
      lastNetworkStateHash === stateHash &&
      lastNetworkFetchAt > 0 &&
      now - lastNetworkFetchAt < MIN_INTERVAL_MS
    ) {
      dashDebug("field-consultant-bridge", "skip", {
        reason: "throttle",
        msSinceLastOk: now - lastNetworkFetchAt,
        minIntervalMs: MIN_INTERVAL_MS,
      });
      return { skipped: true, reason: "throttle" };
    }
    if (
      stateHash &&
      typeof window !== "undefined" &&
      window.__fieldConsultantAppliedKey === cacheKey &&
      window.__lastFieldStateHash === stateHash
    ) {
      console.log("[AI Farm] Field state unchanged, skipping LLM request to save tokens.");
      dashDebug("field-consultant-bridge", "skip", { reason: "state_unchanged" });
      return { skipped: true, reason: "state_unchanged" };
    }
  }

  inFlight = true;
  emitFieldConsultantLoading(true);
  const hashWhenQueued = stateHash;
  const requestCacheKey = cacheKey;
  try {
    const extra = await getByokHeaders();
    const base = await getBase();
    if (typeof globalThis.pipelineLog === "function") {
      globalThis.pipelineLog("renderer_out", "GET /api/v1/consultant/insights (field map)", { base });
    }
    const qs = new URLSearchParams();
    const sid =
      (typeof window !== "undefined" &&
        window.dashboard &&
        window.dashboard.activeServerId) ||
      (typeof localStorage !== "undefined" ? localStorage.getItem("dashboard_active_server") : "") ||
      "";
    if (sid) qs.set("serverId", sid);
    const farmId =
      (typeof window !== "undefined" &&
        window.dashboard &&
        window.dashboard.activeFarmId != null &&
        String(window.dashboard.activeFarmId)) ||
      "";
    if (farmId) qs.set("farmId", farmId);
    qs.set("view", "fields");
    qs.set("context", "fields");
    const url = `${base}/api/v1/consultant/insights?${qs.toString()}`;
    const reqHeaders = {
      "X-FarmDash-Key": encodeURIComponent(intKey),
      Accept: "application/json",
      ...extra,
    };
    dashDebug("field-consultant-bridge", "request", {
      url,
      method: "GET",
      headers:
        typeof globalThis.dashRedactHeaders === "function"
          ? globalThis.dashRedactHeaders(reqHeaders)
          : reqHeaders,
    });
    const r = await fetch(url, {
      method: "GET",
      headers: reqHeaders,
      cache: "no-store",
    });
    if (typeof globalThis.pipelineLog === "function") {
      globalThis.pipelineLog("renderer_out", "consultant/insights response (field map)", { httpStatus: r.status });
    }

    if (!r.ok) {
      let errText = "";
      try {
        errText = await r.text();
      } catch (e) {
        errText = String(e);
      }
      dashDebug("field-consultant-bridge", "error", { status: r.status, body: errText.slice(0, 4000) });
      try {
        let detErr = errText.slice(0, 500);
        try {
          const jErr = JSON.parse(errText);
          if (jErr && jErr.detail) detErr = String(jErr.detail);
        } catch (eJ) {}
        if (typeof globalThis.dashReportConsultantProblem === "function") {
          globalThis.dashReportConsultantProblem("field-map-insights", {
            status: r.status,
            detail: detErr,
            bodySnippet: errText.slice(0, 800),
          });
        }
      } catch (eRep) {}
      if (typeof globalThis.pipelineLog === "function") {
        globalThis.pipelineLog("renderer_err", "consultant/insights HTTP error (field map)", { status: r.status });
      }
      return { ok: false, status: r.status };
    }

    let data;
    try {
      data = await r.json();
    } catch (parseErr) {
      dashDebug("field-consultant-bridge", "error", { parse: String(parseErr) });
      console.warn("[field-consultant-bridge] Invalid JSON body", parseErr);
      return { ok: false, error: "invalid_json" };
    }
    dashDebug("field-consultant-bridge", "response", { httpStatus: r.status, body: data });

    const list = (data && data.insights) || [];
    const byRef = indexFieldConsultantInsights(list);
    const indexedKeys = Object.keys(byRef);
    if (list.length > 0 && indexedKeys.length === 0 && data.llm_used) {
      const sample = list.slice(0, 3).map((x) => ({
        category: x && x.category,
        field_ref: x && x.field_ref,
        messageLen: x && x.message ? String(x.message).length : 0,
      }));
      console.error(
        "[field-consultant-bridge] LLM returned insights but none are usable for the field map. " +
          "Need category Field + numeric field_ref (farmlandId/id). Sample:",
        sample
      );
    }

    try {
      if (typeof globalThis.dashReportConsultantProblem === "function") {
        globalThis.dashReportConsultantProblem("field-map-insights", {
          status: r.status,
          llm_used: !!data.llm_used,
          detail: "activeServerId=" + (sid || "(none)"),
        });
      }
    } catch (eWarn) {}

    const stillOnRequestedFarm = getConsultantFarmCacheKey() === requestCacheKey;
    const cacheStateHash = stillOnRequestedFarm
      ? computeActiveFarmFieldsStateHash()
      : hashWhenQueued;

    function applyFieldConsultantDom() {
      if (typeof window === "undefined") return;
      if (getConsultantFarmCacheKey() !== requestCacheKey) {
        dashDebug("field-consultant-bridge", "skip", { reason: "response_stale_farm_switch" });
        return;
      }
      window.__fieldConsultantByRef = byRef;
      window.__fieldConsultantLlmUsed = !!data.llm_used;
      window.__lastFieldStateHash = cacheStateHash;
      window.__fieldConsultantAppliedKey = requestCacheKey;
      window.__fieldConsultantAppliedHash = cacheStateHash;
      window.dispatchEvent(new CustomEvent("field-consultant-updated"));
    }
    if (typeof globalThis.dashFlushDomWork === "function") {
      globalThis.dashFlushDomWork(applyFieldConsultantDom);
    } else {
      applyFieldConsultantDom();
    }

    fieldConsultantFarmCache.set(requestCacheKey, {
      byRef: { ...byRef },
      llmUsed: !!data.llm_used,
      stateHash: cacheStateHash,
    });
    lastNetworkFetchAt = Date.now();
    lastNetworkKey = requestCacheKey;
    lastNetworkStateHash = cacheStateHash;
    if (typeof globalThis.pipelineLog === "function") {
      globalThis.pipelineLog("renderer_ok", "field consultant cache updated", {
        insightCount: list.length,
        llm_used: !!data.llm_used,
      });
    }
    return { ok: true, llm_used: !!data.llm_used };
  } catch (e) {
    dashDebug("field-consultant-bridge", "error", { exception: String(e?.message || e), stack: e?.stack });
    if (typeof globalThis.pipelineLog === "function") {
      globalThis.pipelineLog("renderer_err", "field consultant fetch failed", { error: String(e?.message || e) });
    }
    console.warn("[field-consultant-bridge]", e);
    return { ok: false, error: String(e.message || e) };
  } finally {
    inFlight = false;
    emitFieldConsultantLoading(false);
  }
}

/**
 * Debounced field-map consultant fetch. `{ force: true }` clears this farm’s memory entry and bypasses throttle.
 */
export function scheduleFieldConsultantFetch(options) {
  const force = options && options.force;
  if (debounceId) clearTimeout(debounceId);
  debounceId = setTimeout(() => {
    debounceId = null;
    var idle = typeof globalThis.dashScheduleIdle === "function" ? globalThis.dashScheduleIdle : function (fn, t) {
      setTimeout(fn, 0);
    };
    idle(function () {
      refreshFieldConsultantCache({ force: !!force }).catch(() => {});
    }, 1500);
  }, 800);
}

/**
 * Strict per-field LLM (server sends only one parcel JSON). Prefer throttling if calling many times.
 */
export async function fetchConsultantInsightSingleField(fieldRef) {
  const ref = fieldRef != null ? String(fieldRef).trim() : "";
  if (!ref) return { ok: false, error: "missing_field_ref" };
  const intKey = await getIntegrationKey();
  if (!intKey) return { ok: false, reason: "no_integration_key" };
  const base = await getBase();
  const extra = await getByokHeaders();
  const qs = new URLSearchParams();
  const sid =
    (typeof window !== "undefined" &&
      window.dashboard &&
      window.dashboard.activeServerId) ||
    (typeof localStorage !== "undefined" ? localStorage.getItem("dashboard_active_server") : "") ||
    "";
  if (sid) qs.set("serverId", sid);
  const farmId =
    (typeof window !== "undefined" &&
      window.dashboard &&
      window.dashboard.activeFarmId != null &&
      String(window.dashboard.activeFarmId)) ||
    "";
  if (farmId) qs.set("farmId", farmId);
  qs.set("fieldRef", ref);
  const url = `${base}/api/v1/consultant/insights?${qs.toString()}`;
  const h = {
    "X-FarmDash-Key": encodeURIComponent(intKey),
    Accept: "application/json",
    ...extra,
  };
  if (typeof globalThis.dashAiDebug === "function") {
    globalThis.dashAiDebug("field-consultant-single-field", "request", {
      url,
      headers: typeof globalThis.dashRedactHeaders === "function" ? globalThis.dashRedactHeaders(h) : h,
    });
  }
  const r = await fetch(url, { method: "GET", headers: h, cache: "no-store" });
  if (!r.ok) {
    if (typeof globalThis.dashAiDebug === "function") {
      globalThis.dashAiDebug("field-consultant-single-field", "error", { status: r.status });
    }
    return { ok: false, status: r.status };
  }
  const data = await r.json();
  if (typeof globalThis.dashAiDebug === "function") {
    globalThis.dashAiDebug("field-consultant-single-field", "response", { body: data });
  }
  const list = (data && data.insights) || [];
  return { ok: true, insights: list, llm_used: !!data.llm_used };
}

if (typeof window !== "undefined") {
  window.pickDoThisFirstFromFieldInsights = pickDoThisFirstFromFieldInsights;
}

/* Prefetch field AI map after load (does not wait for Fields tab). Throttle still applies after first success. */
if (typeof window !== "undefined") {
  window.addEventListener("load", function () {
    var idle = typeof globalThis.dashScheduleIdle === "function" ? globalThis.dashScheduleIdle : function (fn, t) {
      setTimeout(fn, t || 0);
    };
    idle(function () {
      try {
        if (!localStorage.getItem(LS_KEY)) return;
        scheduleFieldConsultantFetch();
      } catch (e) {
        /* ignore */
      }
    }, 2000);
  });
}
