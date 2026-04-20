/**
 * Rules-only build: no LLM / hosted consultant HTTP. Per-field cards use `rules-engine` + empty `__fieldConsultantByRef`.
 * Keeps the same exports so `fields.js` and legacy listeners keep working.
 */

import { getFieldStableId } from "./rules-engine.js";

export const FARMDASH_FIELD_CONSULTANT_NETWORK_ENABLED = false;

export function deriveSuggestionTier() {
  return "rules";
}

export function normalizeFieldRefKey(ref) {
  if (ref == null || ref === "") return "";
  const original = String(ref).trim();
  if (!original) return "";
  let s = original;
  s = s.replace(/^field\s*#?\s*/i, "");
  s = s.replace(/^parcel\s*#?\s*/i, "");
  s = s.replace(/^farmland\s*#?\s*/i, "");
  s = s.replace(/^#+/, "").trim();
  if (!s) return "";
  const first = (s.split(/\s+/)[0] || s).trim();
  let out = first.length > 64 ? first.slice(0, 64) : first;
  if (/^\d+$/.test(out)) return out;
  const m = original.match(/\b(\d{1,7})\b/);
  if (m) return m[1];
  return out;
}

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
    if (!ins || typeof ins !== "object") continue;
    const ref = ins.field_ref != null ? ins.field_ref : ins.fieldRef;
    const k = normalizeFieldRefKey(ref);
    if (k) addInsightKeys(map, k, ins);
  }
  return map;
}

export function getConsultantFarmCacheKey() {
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

export function computeActiveFarmFieldsStateHash() {
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
        maxGrowthState: f.maxGrowthState,
        growthLabel: f.growthLabel,
        hectares: f.hectares,
        isHarvested: !!(f.isHarvested || f.growthLabel === "harvested"),
        needsPlowing: f.needsPlowing,
        needsLime: f.needsLime,
        needsCultivation: f.needsCultivation,
        needsWork: f.needsWork,
        harvestReady: f.harvestReady,
        isWithered: f.isWithered,
        nitrogenLevel: f.nitrogenLevel,
        phValue: f.phValue,
        weedLevel: f.weedLevel,
        baleCountOnField: f.baleCountOnField,
        baleCount: f.baleCount,
        hasWindrow: f.hasWindrow,
        windrowLiters: f.windrowLiters,
        needsBaling: f.needsBaling,
        baleableLooseLiters: f.baleableLooseLiters,
        looseStrawLiters: f.looseStrawLiters,
        looseGrassWindrowLiters: f.looseGrassWindrowLiters,
        looseDryGrassWindrowLiters: f.looseDryGrassWindrowLiters,
        hasLooseStraw: f.hasLooseStraw === true,
        hasLooseGrassWindrow: f.hasLooseGrassWindrow === true,
        hasLooseHayWindrow: f.hasLooseHayWindrow === true,
        hasLooseForage: f.hasLooseForage === true,
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return JSON.stringify(sig);
  } catch {
    return "";
  }
}

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

export function lookupFieldConsultantInsight(map, field) {
  if (!map || !field) return null;
  const candidates = [];
  const push = (v) => {
    if (v == null || v === "") return;
    candidates.push(v);
  };
  push(field.farmlandId);
  push(field.id);
  try {
    push(getFieldStableId(field));
  } catch {
    /* ignore */
  }
  for (const v of candidates) {
    const k = normalizeFieldRefKey(v);
    if (k && map[k]) return map[k];
  }
  return null;
}

export function pickDoThisFirstFromFieldInsights() {
  return null;
}

export async function refreshFieldConsultantCache() {
  if (typeof window !== "undefined") {
    window.__fieldConsultantByRef = {};
    window.__fieldConsultantLlmUsed = false;
    window.__fieldConsultantSuggestionTier = "rules";
    window.__fieldConsultantAppliedKey = getConsultantFarmCacheKey();
    window.__fieldConsultantAppliedHash = computeActiveFarmFieldsStateHash();
    window.dispatchEvent(new CustomEvent("field-consultant-updated"));
  }
  emitFieldConsultantLoading(false);
  return { ok: true, skipped: true, reason: "rules_only" };
}

export function scheduleFieldConsultantFetch() {
  /* no network */
}

export async function fetchConsultantInsightSingleField() {
  return { ok: false, reason: "rules_only" };
}

export function hydrateFieldConsultantFromDiskEntry() {
  return false;
}

if (typeof window !== "undefined") {
  window.pickDoThisFirstFromFieldInsights = pickDoThisFirstFromFieldInsights;
  window.farmdashDeriveSuggestionTier = deriveSuggestionTier;
}
