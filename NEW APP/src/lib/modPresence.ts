/** Payload-driven mod tab detection for the dynamic Mods sidebar group. */

import type { SectionId } from "@/types/dashboard";
import type { RealisticFarmingPayload } from "@/types/dashboard";
import { MOD_NAV_SECTIONS } from "@/types/dashboard";
import { isRedTapeModActive, type RedTapePayload } from "@/lib/redTape";
import { getMoistureEnvironmentInfo, getBaleMoistureForFarm } from "@/lib/moisture";
import { summarizeAdsFleet } from "@/lib/vehicleAds";
import { getDisplayFleet, normalizeVehicleList, isStorageItem } from "@/lib/vehicles";
import { isInvoicesModActive, type InvoicesPayload } from "@/lib/invoices";
import {
  isHirePurchasingModActive,
  type HirePurchasingPayload,
} from "@/lib/hirePurchasing";

export interface ModPresence {
  redtape: boolean;
  ads: boolean;
  moisture: boolean;
  invoices: boolean;
  hirepurchasing: boolean;
  /** RF suite — NPC Favor tab */
  npcfavor: boolean;
  /** RF suite — Random World Events tab */
  worldevents: boolean;
  /** RF suite — Pro Staff Co-Op tab */
  prostaff: boolean;
  /** RF suite — Fertilizer Depot tab */
  fertilizerdepot: boolean;
  /** Any RF companion/core detected (Overview chips). */
  realisticFarming: boolean;
}

const INVOICES_MOD_TOKENS = ["fs25_invoices", "invoices"];
const HIRE_PURCHASING_MOD_TOKENS = ["fs25_hirepurchasing", "hirepurchasing", "hire purchasing"];
const RF_NPC_TOKENS = ["fs25_npcfavor", "npcfavor", "npc favor"];
const RF_RWE_TOKENS = ["fs25_randomworldevents", "randomworldevents", "random world events"];
const RF_PROSTAFF_TOKENS = ["fs25_prostaffcoop", "prostaff", "pro staff"];
const RF_DEPOT_TOKENS = ["fs25_fertilizerdepot", "fertilizerdepot", "fertilizer depot"];
const RF_ANY_TOKENS = [
  "fs25_soilfertilizer",
  "fs25_seasonalcropstress",
  "fs25_fertilizerdepot",
  "fs25_taxmod",
  "fs25_marketdynamics",
  "fs25_fuelcosts",
  "fs25_workercosts",
  "fs25_incomemod",
  "fs25_workplacetriggers",
  "fs25_dairycore",
  "fs25_npcfavor",
  "fs25_randomworldevents",
  "fs25_prostaffcoop",
  "fs25_weatherguard",
  "fs25_timeguard",
  "fs25_farmtablet",
  "fs25_stateledger",
  "fs25_networksync",
  "fs25_settingshub",
  "fs25_masterhud",
  "fs25_rfsoilscanner",
];

function fieldMoistureActive(fields: unknown): boolean {
  if (!Array.isArray(fields)) return false;
  return fields.some((f) => {
    if (!f || typeof f !== "object") return false;
    const m = (f as { moisture?: { enabled?: boolean; percent?: number | null } }).moisture;
    if (!m || m.enabled === false) return false;
    return m.enabled === true || m.percent != null;
  });
}

/** Match careerSavegame / merged `mods[]` entries against known third-party mod names. */
export function careerModsInclude(
  mods: unknown,
  tokens: string[],
): boolean {
  if (!Array.isArray(mods) || mods.length === 0) return false;
  const needles = tokens.map((t) => t.toLowerCase());
  return mods.some((row) => {
    if (!row || typeof row !== "object") return false;
    const r = row as { modName?: unknown; title?: unknown; name?: unknown };
    const hay = `${r.modName ?? ""} ${r.title ?? ""} ${r.name ?? ""}`.toLowerCase();
    return needles.some((n) => hay.includes(n));
  });
}

function rfSectionEnabled(
  rf: RealisticFarmingPayload | null | undefined,
  key: keyof RealisticFarmingPayload,
): boolean {
  if (!rf || typeof rf !== "object") return false;
  const block = rf[key];
  if (!block || typeof block !== "object") return false;
  return (block as { enabled?: boolean }).enabled === true;
}

/** Detect which mod-gated sidebar tabs should appear for the active farm/payload.
 *  Invoices / Hire Purchasing tabs appear when the Lua export sets `enabled: true`
 *  (third-party mod soft-detected via g_modIsLoaded even before manager data exists),
 *  or when the savegame mods list indicates the mod is loaded.
 */
export function detectModPresence(
  payload: {
    redTape?: unknown;
    invoices?: unknown;
    hirePurchasing?: unknown;
    realisticFarming?: RealisticFarmingPayload | null;
    weather?: { moisture?: { enabled?: boolean } } | null;
    baleInventory?: unknown;
    fields?: unknown;
    vehicles?: unknown;
    adsSummary?: { enabled?: boolean } | null;
    mods?: unknown;
  } | null | undefined,
  farmId: number,
): ModPresence {
  const redtape = isRedTapeModActive(payload?.redTape as RedTapePayload | null);

  const env = getMoistureEnvironmentInfo(payload?.weather as { moisture?: { enabled?: boolean } });
  const baleMoist = getBaleMoistureForFarm(
    payload?.baleInventory as { moisture?: { byFarm?: Record<string, { enabled?: boolean }> } },
    farmId,
  );
  const moisture = !!(env || baleMoist || fieldMoistureActive(payload?.fields));

  const fleet = getDisplayFleet(payload?.vehicles, farmId);
  const adsFromFleet = summarizeAdsFleet(fleet);
  const motorizedWithAds = normalizeVehicleList(payload?.vehicles).some((v) => {
    if (isStorageItem(v)) return false;
    if (v.isMotorized === false) return false;
    const ads = v.ads as { enabled?: boolean } | undefined;
    return ads?.enabled === true;
  });
  const ads =
    adsFromFleet.enabled || motorizedWithAds || payload?.adsSummary?.enabled === true;

  const invoicesPayload = payload?.invoices as InvoicesPayload | null | undefined;
  const hirePayload = payload?.hirePurchasing as HirePurchasingPayload | null | undefined;
  const rf = payload?.realisticFarming;

  // Prefer Lua soft-detect (`enabled: true`). Career mods[] is a fallback when the export
  // is still mid-cycle or an older FarmDashboard zip omitted the section.
  // Do NOT use collectorModules — those flags mean "FD collector slot on", not "third-party mod loaded".
  const invoices =
    isInvoicesModActive(invoicesPayload) ||
    careerModsInclude(payload?.mods, INVOICES_MOD_TOKENS);

  const hirepurchasing =
    isHirePurchasingModActive(hirePayload) ||
    careerModsInclude(payload?.mods, HIRE_PURCHASING_MOD_TOKENS);

  const npcfavor =
    rfSectionEnabled(rf, "npcFavor") || careerModsInclude(payload?.mods, RF_NPC_TOKENS);
  const worldevents =
    rfSectionEnabled(rf, "worldEvents") || careerModsInclude(payload?.mods, RF_RWE_TOKENS);
  const prostaff =
    rfSectionEnabled(rf, "proStaff") || careerModsInclude(payload?.mods, RF_PROSTAFF_TOKENS);
  const fertilizerdepot =
    rfSectionEnabled(rf, "fertilizerDepot") || careerModsInclude(payload?.mods, RF_DEPOT_TOKENS);

  const realisticFarming =
    rf?.presence?.enabled === true ||
    rfSectionEnabled(rf, "soilFertilizer") ||
    rfSectionEnabled(rf, "cropStress") ||
    rfSectionEnabled(rf, "tax") ||
    rfSectionEnabled(rf, "marketDynamics") ||
    rfSectionEnabled(rf, "fuelCosts") ||
    rfSectionEnabled(rf, "workerCosts") ||
    rfSectionEnabled(rf, "income") ||
    rfSectionEnabled(rf, "workplaceTriggers") ||
    rfSectionEnabled(rf, "dairy") ||
    npcfavor ||
    worldevents ||
    prostaff ||
    fertilizerdepot ||
    rfSectionEnabled(rf, "weatherGuard") ||
    rfSectionEnabled(rf, "timeGuard") ||
    careerModsInclude(payload?.mods, RF_ANY_TOKENS);

  return {
    redtape,
    ads,
    moisture,
    invoices,
    hirepurchasing,
    npcfavor,
    worldevents,
    prostaff,
    fertilizerdepot,
    realisticFarming,
  };
}

export function modSectionActive(id: SectionId, presence: ModPresence): boolean {
  if (!(MOD_NAV_SECTIONS as string[]).includes(id)) return true;
  if (id === "redtape") return presence.redtape;
  if (id === "ads") return presence.ads;
  if (id === "invoices") return presence.invoices;
  if (id === "hirepurchasing") return presence.hirepurchasing;
  if (id === "npcfavor") return presence.npcfavor;
  if (id === "worldevents") return presence.worldevents;
  if (id === "prostaff") return presence.prostaff;
  if (id === "fertilizerdepot") return presence.fertilizerdepot;
  return false;
}
