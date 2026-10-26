type SoilSummary = {
  enabled?: unknown;
  reason?: unknown;
  modLoaded?: unknown;
};

type PresenceMod = {
  id?: unknown;
  detected?: unknown;
};

type SoilPayload = {
  collectorModules?: Record<string, unknown>;
  realisticFarming?: {
    soilFertilizer?: SoilSummary | null;
    presence?: { mods?: unknown } | null;
  } | null;
};

const TERMINAL_REASONS = new Set([
  "mod-absent",
  "pf-conflict",
  "settings-disabled",
  "provider-removed",
]);

/** An enabled collector without a completed soil result must not drive field advice. */
export function isSoilCollectionPending(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const data = payload as SoilPayload;
  if (data.collectorModules?.rfSoilFertilizer !== true) return false;

  const soil = data.realisticFarming?.soilFertilizer;
  if (soil?.enabled === true) return false;
  if (soil?.modLoaded === false) return false;
  if (typeof soil?.reason === "string" && TERMINAL_REASONS.has(soil.reason)) {
    return false;
  }

  const mods = data.realisticFarming?.presence?.mods;
  if (Array.isArray(mods)) {
    const entry = (mods as PresenceMod[]).find((mod) => mod?.id === "FS25_SoilFertilizer");
    if (entry?.detected === false) return false;
  }
  return true;
}
