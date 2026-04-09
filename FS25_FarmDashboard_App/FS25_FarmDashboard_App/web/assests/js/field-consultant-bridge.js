/**
 * Throttled fetch of /api/v1/consultant/insights → per-field AI lines (field_ref map).
 * Requires Farm Dashboard link key + AI backend URL (same as AI Farm bot panel).
 * BYOK: X-AI-API-Key from Electron store (Dashboard Settings).
 */

import { getFieldStableId } from "./rules-engine.js";

const MIN_INTERVAL_MS = 8 * 60 * 1000; // 8 minutes — avoid hammering VPS
const LS_URL = "farmdash_ai_manager_base_url";
const LS_KEY = "farmdash_ai_integration_key";

let lastFetchAt = 0;
let inFlight = false;
let debounceId = null;

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

export function indexFieldConsultantInsights(insights) {
  const map = {};
  if (!Array.isArray(insights)) return map;
  for (const ins of insights) {
    if (!ins || String(ins.category) !== "Field") continue;
    if (normalizeFieldRefKey(ins.field_ref) === "") continue;
    addInsightKeys(map, ins.field_ref, ins);
  }
  return map;
}

/**
 * Match AI insight to a field using string-safe keys (farmlandId, id, stable id).
 */
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

export async function refreshFieldConsultantCache({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastFetchAt < MIN_INTERVAL_MS) {
    return { skipped: true };
  }
  if (inFlight) {
    return { skipped: true };
  }

  const intKey = await getIntegrationKey();
  if (!intKey) {
    if (typeof window !== "undefined") {
      window.__fieldConsultantByRef = {};
      window.dispatchEvent(new CustomEvent("field-consultant-updated"));
    }
    return { skipped: true, reason: "no_integration_key" };
  }

  inFlight = true;
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
    qs.set("context", "fields");
    const r = await fetch(`${base}/api/v1/consultant/insights?${qs.toString()}`, {
      method: "GET",
      headers: {
        "X-FarmDash-Key": encodeURIComponent(intKey),
        Accept: "application/json",
        ...extra,
      },
      cache: "no-store",
    });
    if (typeof globalThis.pipelineLog === "function") {
      globalThis.pipelineLog("renderer_out", "consultant/insights response (field map)", { httpStatus: r.status });
    }

    if (!r.ok) {
      if (typeof globalThis.pipelineLog === "function") {
        globalThis.pipelineLog("renderer_err", "consultant/insights HTTP error (field map)", { status: r.status });
      }
      return { ok: false, status: r.status };
    }

    let data;
    try {
      data = await r.json();
    } catch (parseErr) {
      console.warn("[field-consultant-bridge] Invalid JSON body", parseErr);
      return { ok: false, error: "invalid_json" };
    }

    const list = (data && data.insights) || [];
    const byRef = indexFieldConsultantInsights(list);

    if (typeof window !== "undefined") {
      window.__fieldConsultantByRef = byRef;
      window.__fieldConsultantLlmUsed = !!data.llm_used;
      window.dispatchEvent(new CustomEvent("field-consultant-updated"));
    }
    lastFetchAt = Date.now();
    if (typeof globalThis.pipelineLog === "function") {
      globalThis.pipelineLog("renderer_ok", "field consultant cache updated", {
        insightCount: list.length,
        llm_used: !!data.llm_used,
      });
    }
    return { ok: true, llm_used: !!data.llm_used };
  } catch (e) {
    if (typeof globalThis.pipelineLog === "function") {
      globalThis.pipelineLog("renderer_err", "field consultant fetch failed", { error: String(e?.message || e) });
    }
    console.warn("[field-consultant-bridge]", e);
    return { ok: false, error: String(e.message || e) };
  } finally {
    inFlight = false;
  }
}

export function scheduleFieldConsultantFetch() {
  if (debounceId) clearTimeout(debounceId);
  debounceId = setTimeout(() => {
    debounceId = null;
    refreshFieldConsultantCache({ force: false }).catch(() => {});
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
  qs.set("fieldRef", ref);
  const r = await fetch(`${base}/api/v1/consultant/insights?${qs.toString()}`, {
    method: "GET",
    headers: {
      "X-FarmDash-Key": encodeURIComponent(intKey),
      Accept: "application/json",
      ...extra,
    },
    cache: "no-store",
  });
  if (!r.ok) return { ok: false, status: r.status };
  const data = await r.json();
  const list = (data && data.insights) || [];
  return { ok: true, insights: list, llm_used: !!data.llm_used };
}
