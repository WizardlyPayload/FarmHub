/**
 * RF companion version pins + About compatibility status.
 * Keep in sync with docs/COMPATIBILITY.md (Release agent).
 */

import type { RealisticFarmingPayload, RealisticFarmingPresenceMod } from "@/types/dashboard";
import { detectedPresenceMods, getPresence } from "./cores";

/** Tested companion pins from local Realistic-Farming workspace (2026-09-07). */
export const RF_TESTED_MODS: ReadonlyArray<{
  id: string;
  title: string;
  testedVersion: string;
  surface: string;
}> = [
  { id: "FS25_SoilFertilizer", title: "Soil Fertilizer", testedVersion: "2.5.0.126", surface: "Fields soil" },
  { id: "FS25_SeasonalCropStress", title: "Seasonal Crop Stress", testedVersion: "1.2.5.142", surface: "Fields moisture" },
  { id: "FS25_FertilizerDepot", title: "Fertilizer Depot", testedVersion: "1.0.4.33", surface: "Fertilizer Depot tab" },
  { id: "FS25_TaxMod", title: "Tax Mod", testedVersion: "1.1.6.31", surface: "Economy" },
  { id: "FS25_MarketDynamics", title: "Market Dynamics", testedVersion: "1.3.1.34", surface: "Economy" },
  { id: "FS25_FuelCosts", title: "Fuel Costs", testedVersion: "1.0.0.1", surface: "Economy" },
  { id: "FS25_WorkerCosts", title: "Worker Costs", testedVersion: "2.2.3.76", surface: "Economy" },
  { id: "FS25_IncomeMod", title: "Income Mod", testedVersion: "2.1.8.31", surface: "Economy" },
  { id: "FS25_WorkplaceTriggers", title: "Workplace Triggers", testedVersion: "1.1.2.0", surface: "Economy" },
  { id: "FS25_DairyCore", title: "Dairy Core", testedVersion: "1.0.5.39", surface: "Pastures" },
  { id: "FS25_NPCFavor", title: "NPC Favor", testedVersion: "1.2.7.101", surface: "NPC Favor tab" },
  { id: "FS25_RandomWorldEvents", title: "Random World Events", testedVersion: "2.2.0.1", surface: "World Events tab" },
  { id: "FS25_ProStaffCoOp", title: "Pro Staff Co-Op", testedVersion: "1.0.0.25", surface: "Pro Staff tab" },
  { id: "FS25_WeatherGuard", title: "Weather Guard", testedVersion: "1.0.0.0", surface: "Weather" },
  { id: "FS25_TimeGuard", title: "Time Guard", testedVersion: "1.0.1.0", surface: "Calendar badge" },
  { id: "FS25_FarmTablet", title: "Farm Tablet", testedVersion: "2.6.0.11", surface: "Presence" },
  { id: "FS25_StateLedger", title: "State Ledger", testedVersion: "1.0.1.0", surface: "Presence" },
  { id: "FS25_NetworkSync", title: "Network Sync", testedVersion: "2.0.1.0", surface: "Presence" },
  { id: "FS25_SettingsHub", title: "Settings Hub", testedVersion: "1.0.1.0", surface: "Presence" },
  { id: "FS25_MasterHUD", title: "Master HUD", testedVersion: "1.0.1.1", surface: "Presence" },
  { id: "FS25_RFSoilScanner", title: "Soil Scanner", testedVersion: "1.0.0.4", surface: "Presence" },
];

const TESTED_BY_ID = new Map(RF_TESTED_MODS.map((m) => [m.id.toLowerCase(), m]));

export type RfCompatStatus = "ok" | "untested" | "unknown" | "missing";

export interface RfCompatRow {
  id: string;
  title: string;
  testedVersion: string;
  detectedVersion: string | null;
  detected: boolean;
  status: RfCompatStatus;
  surface: string;
}

/** Parse dotted FS25-style versions (e.g. 2.4.7.0). Non-numeric segments → 0. */
export function parseRfVersion(raw: string | null | undefined): number[] | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const parts = s.split(/[.+_-]/).map((p) => {
    const n = parseInt(p.replace(/[^0-9].*$/, ""), 10);
    return Number.isFinite(n) ? n : 0;
  });
  return parts.length ? parts : null;
}

/** Compare a.b.c.d style versions. Returns -1 / 0 / 1, or null if either side unparsable. */
export function compareRfVersions(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  const pa = parseRfVersion(a);
  const pb = parseRfVersion(b);
  if (!pa || !pb) return null;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

export function compatStatusFor(
  detected: boolean,
  detectedVersion: string | null | undefined,
  testedVersion: string,
): RfCompatStatus {
  if (!detected) return "missing";
  if (!detectedVersion) return "unknown";
  const cmp = compareRfVersions(detectedVersion, testedVersion);
  if (cmp == null) return "unknown";
  if (cmp > 0) return "untested";
  return "ok";
}

function indexDetected(
  mods: RealisticFarmingPresenceMod[],
): Map<string, RealisticFarmingPresenceMod> {
  const map = new Map<string, RealisticFarmingPresenceMod>();
  for (const m of mods) {
    if (!m?.id) continue;
    map.set(String(m.id).toLowerCase(), m);
  }
  return map;
}

/** Full matrix for About — every pinned companion, merged with live presence. */
export function buildRfCompatibilityRows(
  rf: RealisticFarmingPayload | null | undefined,
): RfCompatRow[] {
  const live = indexDetected(getPresence(rf)?.mods ?? []);
  return RF_TESTED_MODS.map((pin) => {
    const hit = live.get(pin.id.toLowerCase());
    const detected = hit?.detected === true;
    const detectedVersion = hit?.version != null ? String(hit.version) : null;
    return {
      id: pin.id,
      title: hit?.title || pin.title,
      testedVersion: pin.testedVersion,
      detectedVersion,
      detected,
      status: compatStatusFor(detected, detectedVersion, pin.testedVersion),
      surface: pin.surface,
    };
  });
}

/** Detected-only rows for compact About chips (matches Overview). */
export function buildDetectedRfCompatRows(
  rf: RealisticFarmingPayload | null | undefined,
): RfCompatRow[] {
  const detected = detectedPresenceMods(rf);
  return detected.map((m) => {
    const pin = TESTED_BY_ID.get(String(m.id).toLowerCase());
    const testedVersion = pin?.testedVersion ?? "—";
    const detectedVersion = m.version != null ? String(m.version) : null;
    return {
      id: m.id,
      title: m.title || pin?.title || m.id,
      testedVersion,
      detectedVersion,
      detected: true,
      status: pin
        ? compatStatusFor(true, detectedVersion, pin.testedVersion)
        : "unknown",
      surface: pin?.surface ?? "—",
    };
  });
}

export function countDetectedRfMods(rf: RealisticFarmingPayload | null | undefined): number {
  return detectedPresenceMods(rf).length;
}
