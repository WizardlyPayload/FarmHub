/**
 * Persist Smart suggestions + per-field AI map across app restarts (localStorage).
 * When dashboard data matches saved hashes, skips GET /consultant/insights to reduce API usage.
 */
import {
  computeActiveFarmFieldsStateHash,
  getConsultantFarmCacheKey,
  hydrateFieldConsultantFromDiskEntry,
} from "./field-consultant-bridge.js";

const LS_KEY = "farmdash_ai_consultant_disk_v1";
const MAX_SCOPES = 8;

function getDashboard() {
  return typeof window !== "undefined" ? window.dashboard : null;
}

/** Broad snapshot: fields hash + save identity + coarse vehicle/animal/production/economy signals (matches consultant inputs). */
export function computeConsultantFullStateHash() {
  const fieldsH = computeActiveFarmFieldsStateHash();
  const d = getDashboard();
  if (!d) return fieldsH || "";
  try {
    const vehicles = (Array.isArray(d.vehicles) ? d.vehicles : [])
      .map((v) => ({
        id: v.id ?? v.uniqueId,
        fuel: v.fuelLevel ?? v.fuel,
        damage: v.damage,
        op: v.operatingTime ?? v.lifetimeEngineHours,
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const animals = Array.isArray(d.animals) ? d.animals : Array.isArray(d.husbandryData) ? d.husbandryData : [];
    const animSig = animals
      .map((a) => ({ subType: a.subType ?? a.animalType, num: a.numAnimals ?? a.count }))
      .sort((a, b) => String(a.subType).localeCompare(String(b.subType)));
    const pastures = (Array.isArray(d.pastures) ? d.pastures : []).map((p) => ({
      id: p.id ?? p.pastureId,
      animals: p.animalCount ?? p.numAnimals,
    }));
    const prod = d.production && typeof d.production === "object" ? Object.keys(d.production).length : 0;
    const econ = d.economy && typeof d.economy === "object" ? d.economy : {};
    const digest = {
      fieldsH,
      savegameName: d.savegameName ?? null,
      mapTitle: d.mapTitle ?? null,
      money: d.money ?? 0,
      activeFarmId: d.activeFarmId ?? 1,
      vehicles,
      animals: animSig,
      pastures,
      productionKeys: prod,
      economyBalance: econ.balance ?? econ.money ?? d.money,
      weatherSeason: d.weather?.currentSeason ?? "",
    };
    return JSON.stringify(digest);
  } catch {
    return fieldsH || "";
  }
}

function loadDoc() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { version: 1, entries: {} };
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return { version: 1, entries: {} };
    if (!j.entries || typeof j.entries !== "object") j.entries = {};
    return j;
  } catch {
    return { version: 1, entries: {} };
  }
}

function pruneEntries(entries) {
  const keys = Object.keys(entries);
  if (keys.length <= MAX_SCOPES) return entries;
  const scored = keys.map((k) => ({
    k,
    t: entries[k]?.savedAt || 0,
  }));
  scored.sort((a, b) => b.t - a.t);
  const next = {};
  for (let i = 0; i < MAX_SCOPES && i < scored.length; i++) {
    next[scored[i].k] = entries[scored[i].k];
  }
  return next;
}

export function saveConsultantDiskCache() {
  const d = getDashboard();
  if (!d) return;
  const scope = getConsultantFarmCacheKey();
  const fullHash = computeConsultantFullStateHash();
  const fieldHash = computeActiveFarmFieldsStateHash();
  if (!fullHash || !fieldHash) return;

  const fieldByRef =
    typeof window !== "undefined" && window.__fieldConsultantByRef && typeof window.__fieldConsultantByRef === "object"
      ? window.__fieldConsultantByRef
      : {};

  let views = {};
  if (typeof window.__farmdashInsightCacheGetAll === "function") {
    views = window.__farmdashInsightCacheGetAll() || {};
  }
  if (Object.keys(fieldByRef).length === 0 && Object.keys(views).length === 0) {
    return;
  }

  const doc = loadDoc();
  doc.entries = pruneEntries(doc.entries);
  doc.entries[scope] = {
    fullStateHash: fullHash,
    fieldStateHash: fieldHash,
    field: {
      cacheKey: scope,
      stateHash: fieldHash,
      byRef: { ...fieldByRef },
      llmUsed: !!window.__fieldConsultantLlmUsed,
    },
    views,
    savedAt: Date.now(),
  };
  doc.entries = pruneEntries(doc.entries);

  try {
    const s = JSON.stringify(doc);
    if (s.length > 4_500_000) {
      console.warn("[consultant-disk-cache] payload too large, not saving");
      return;
    }
    localStorage.setItem(LS_KEY, s);
  } catch (e) {
    console.warn("[consultant-disk-cache] save failed", e?.message || e);
  }
}

/** Skip repeat hydrate for the same server+farm+full snapshot (farm switch or data change resets). */
let lastDiskHydrateAttemptKey = "";
let saveTimer = null;

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveConsultantDiskCache();
  }, 400);
}

/**
 * After first merged data: restore caches if hashes match live dashboard.
 */
export function hydrateConsultantDiskCacheIfFresh() {
  const scope = getConsultantFarmCacheKey();
  const full = computeConsultantFullStateHash();
  if (!full) return false;
  const attemptKey = `${scope}|${full}`;
  if (lastDiskHydrateAttemptKey === attemptKey) return false;

  const doc = loadDoc();
  const ent = doc.entries[scope];
  if (!ent || ent.fullStateHash !== full) {
    return false;
  }
  const fh = computeActiveFarmFieldsStateHash();
  if (!ent.field || ent.field.stateHash !== fh || !ent.field.byRef) {
    return false;
  }

  const ok = hydrateFieldConsultantFromDiskEntry({
    cacheKey: ent.field.cacheKey || scope,
    stateHash: ent.field.stateHash,
    byRef: ent.field.byRef,
    llmUsed: ent.field.llmUsed,
  });
  if (!ok) {
    return false;
  }

  if (typeof window.__farmdashInsightCacheMergeFromDisk === "function" && ent.views && typeof ent.views === "object") {
    window.__farmdashInsightCacheMergeFromDisk(ent.views);
  }

  lastDiskHydrateAttemptKey = attemptKey;
  window.__farmdashConsultantDiskHydrated = true;
  window.__farmdashSkipPreloadAiInsights = hasFullInsightDiskCoverage(ent.views);

  try {
    document.dispatchEvent(new CustomEvent("consultant-disk-cache-hydrated", { detail: { scope } }));
  } catch {
    /* ignore */
  }
  if (typeof globalThis.pipelineLog === "function") {
    globalThis.pipelineLog("renderer_ok", "consultant disk cache hydrated (no API until data changes)", {
      scope,
      viewsRestored: ent.views ? Object.keys(ent.views).length : 0,
    });
  }
  return true;
}

function hasFullInsightDiskCoverage(views) {
  if (!views || typeof views !== "object") return false;
  const d = getDashboard();
  const farmId = d?.activeFarmId != null ? String(d.activeFarmId) : "1";
  const need = ["fields", "vehicles", "pastures", "livestock", "productions", "economy", "home"];
  for (const v of need) {
    const k = `${farmId}:${v === "home" ? "home" : v}`;
    if (!views[k]?.insights) return false;
  }
  return true;
}

function bindLifecycle() {
  window.addEventListener("beforeunload", () => saveConsultantDiskCache());
  window.addEventListener("pagehide", () => saveConsultantDiskCache());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveConsultantDiskCache();
  });

  window.addEventListener("field-consultant-updated", () => scheduleSave());
  document.addEventListener("consultant-insights-fetched", () => scheduleSave());
}

bindLifecycle();

try {
  window.__farmdashHydrateConsultantDisk = hydrateConsultantDiskCacheIfFresh;
} catch {
  /* ignore */
}

export { scheduleSave as scheduleConsultantDiskSave };
