/**
 * The one list of dedicated companion-mod pages. Each entry drives its sidebar MODS item (shown only
 * when the mod is detected), its `#mod-<key>` route and the "Open full page" links from section embeds.
 */

import type { ModPageSectionId } from "@/types/dashboard";
import type { CompanionPageEntry, CompanionPagesPayload } from "./types";
import { sectionHasFeature } from "@/platform/demo-source";

export type { CompanionPageEntry, CompanionPageGroup, CompanionPageProps } from "./types";

export const COMPANION_PAGES: CompanionPageEntry[] = [
  // Finance
  { key: "enhancedLoanSystem", catalogId: "enhancedLoanSystem", title: "Enhanced Loan System", glyph: "EL", group: "finance",
    load: () => import("@/sections/mods/enhancedLoanSystem").then((m) => m.Page) },
  { key: "iNeedALoan", catalogId: "iNeedALoan", title: "I Need A Loan", glyph: "NL", group: "finance",
    load: () => import("@/sections/mods/iNeedALoan").then((m) => m.Page) },
  { key: "automaticLoanRepay", catalogId: "automaticLoanRepay", title: "Automatic Loan Repay", glyph: "LR", group: "finance",
    load: () => import("@/sections/mods/automaticLoanRepay").then((m) => m.Page) },
  { key: "realisticDieselPrice", catalogId: "realisticDieselPrice", title: "Realistic Diesel Price", glyph: "RD", group: "finance",
    load: () => import("@/sections/mods/realisticDieselPrice").then((m) => m.Page) },
  { key: "fluctuatingDieselPrice", catalogId: "fluctuatingDieselPrice", title: "Fluctuating Diesel Price", glyph: "FD", group: "finance",
    load: () => import("@/sections/mods/fluctuatingDieselPrice").then((m) => m.Page) },
  { key: "dynamicMarket", catalogId: "dynamicMarket", title: "Dynamic Market", glyph: "DM", group: "finance",
    load: () => import("@/sections/mods/dynamicMarket").then((m) => m.Page) },
  { key: "betterContracts", catalogId: "betterContracts", title: "Better Contracts", glyph: "BC", group: "finance",
    load: () => import("@/sections/mods/betterContracts").then((m) => m.Page) },
  { key: "cropContracts", catalogId: "cropContracts", title: "Crop Contracts", glyph: "CC", group: "finance",
    load: () => import("@/sections/mods/cropContracts").then((m) => m.Page) },
  { key: "netWorthTracker", catalogId: "netWorthTracker", title: "Net Worth Tracker", glyph: "NW", group: "finance",
    load: () => import("@/sections/mods/netWorthTracker").then((m) => m.Page) },
  { key: "realLandFinance", catalogId: "realLandFinance", title: "Real Land Finance", glyph: "LF", group: "finance",
    load: () => import("@/sections/mods/realLandFinance").then((m) => m.Page) },
  { key: "financeYourFleet", catalogId: "financeYourFleet", title: "Finance Your Fleet", glyph: "FY", group: "finance",
    load: () => import("@/sections/mods/financeYourFleet").then((m) => m.Page) },
  { key: "realisticFarmFinanceLoans", catalogId: "realisticFarmFinanceLoans", title: "Realistic Farm Finance loans", glyph: "RL", group: "finance",
    load: () => import("@/sections/mods/realisticFarmFinanceLoans").then((m) => m.Page) },
  { key: "futuresMarketPositions", catalogId: "futuresMarketPositions", title: "Futures Market", glyph: "FM", group: "finance",
    load: () => import("@/sections/mods/futuresMarketPositions").then((m) => m.Page) },
  { key: "farmReputation", catalogId: "farmReputation", title: "Farm Reputation", glyph: "FR", group: "finance",
    load: () => import("@/sections/mods/farmReputation").then((m) => m.Page) },
  { key: "snowContracts", catalogId: "snowContracts", title: "Snow Contracts", glyph: "SC", group: "finance",
    load: () => import("@/sections/mods/snowContracts").then((m) => m.Page) },
  { key: "grassContracts", catalogId: "grassContracts", title: "Grass Contracts", glyph: "GC", group: "finance",
    load: () => import("@/sections/mods/grassContracts").then((m) => m.Page) },
  // Livestock
  { key: "seasonalMilkProduction", catalogId: "seasonalMilkProduction", title: "Seasonal Milk Production", glyph: "SM", group: "livestock",
    load: () => import("@/sections/mods/seasonalMilkProduction").then((m) => m.Page) },
  { key: "seasonalWoolProduction", catalogId: "seasonalWoolProduction", title: "Seasonal Wool Production", glyph: "SW", group: "livestock",
    load: () => import("@/sections/mods/seasonalWoolProduction").then((m) => m.Page) },
  { key: "realisticAnimalLosses", catalogId: "realisticAnimalLosses", title: "Realistic Animal Losses", glyph: "AL", group: "livestock",
    load: () => import("@/sections/mods/realisticAnimalLosses").then((m) => m.Page) },
  { key: "animalFoodOverview", catalogId: "animalFoodOverview", title: "Animal Food Overview", glyph: "FO", group: "livestock",
    load: () => import("@/sections/mods/animalFoodOverview").then((m) => m.Page) },
  { key: "animalFoodCalculator", catalogId: "animalFoodCalculator", title: "Animal Food Calculator", glyph: "FC", group: "livestock",
    load: () => import("@/sections/mods/animalFoodCalculator").then((m) => m.Page) },
  // Storage and production
  { key: "factoryProfitCalculator", catalogId: "factoryProfitCalculator", title: "Factory Profit Calculator", glyph: "FP", group: "storage",
    load: () => import("@/sections/mods/factoryProfitCalculator").then((m) => m.Page) },
  { key: "productionControl", catalogId: "productionControl", title: "Production Control", glyph: "PC", group: "storage",
    load: () => import("@/sections/mods/productionControl").then((m) => m.Page) },
  { key: "productionSupplyManager", catalogId: "productionSupplyManager", title: "Production Supply Manager", glyph: "PS", group: "storage",
    load: () => import("@/sections/mods/productionSupplyManager").then((m) => m.Page) },
  { key: "invoicesProductionSalesOffers", catalogId: "invoicesProductionSalesOffers", title: "Invoices - Production Sales", glyph: "IS", group: "storage",
    load: () => import("@/sections/mods/invoicesProductionSalesOffers").then((m) => m.Page) },
  { key: "productionsManager", catalogId: "productionsManager", title: "Productions Manager", glyph: "PM", group: "storage",
    load: () => import("@/sections/mods/productionsManager").then((m) => m.Page) },
  { key: "palletDegradation", catalogId: "palletDegradation", title: "Pallet Degradation", glyph: "PD", group: "storage",
    load: () => import("@/sections/mods/palletDegradation").then((m) => m.Page) },
  { key: "realSilo", catalogId: "realSilo", title: "RealSilo", glyph: "RS", group: "storage",
    load: () => import("@/sections/mods/realSilo").then((m) => m.Page) },
  { key: "baleBatchTracker", catalogId: "baleBatchTracker", title: "Bale Batch Tracker", glyph: "BB", group: "storage",
    load: () => import("@/sections/mods/baleBatchTracker").then((m) => m.Page) },
  // Construction
  { key: "everythingConstructable", catalogId: "everythingConstructable", title: "Everything Constructable", glyph: "EC", group: "construction",
    load: () => import("@/sections/mods/everythingConstructable").then((m) => m.Page) },
  // Fields
  { key: "harvestLedger", catalogId: "harvestLedger", title: "Harvest Ledger", glyph: "HL", group: "fields",
    load: () => import("@/sections/mods/harvestLedger").then((m) => m.Page) },
  { key: "realisticCropRotation", catalogId: "realisticCropRotation", title: "Realistic Crop Rotation", glyph: "CR", group: "fields",
    load: () => import("@/sections/mods/realisticCropRotation").then((m) => m.Page) },
  { key: "restrictedPeriods", catalogId: "restrictedPeriods", title: "Restricted Periods", glyph: "RP", group: "fields",
    load: () => import("@/sections/mods/restrictedPeriods").then((m) => m.Page) },
  { key: "regionalCropCalendar", catalogId: "regionalCropCalendar", title: "Regional Crop Calendar", glyph: "RC", group: "fields",
    load: () => import("@/sections/mods/regionalCropCalendar").then((m) => m.Page) },
  { key: "moistureSystem", catalogId: "moistureSystem", title: "Moisture System", glyph: "MS", group: "fields",
    load: () => import("@/sections/mods/moistureSystem").then((m) => m.Page) },
  { key: "fieldLeasing", catalogId: "fieldLeasing", title: "Field Leasing", glyph: "FL", group: "fields",
    load: () => import("@/sections/mods/fieldLeasing").then((m) => m.Page) },
  { key: "smartCropControl", catalogId: "smartCropControl", title: "Smart Crop Control", glyph: "CC", group: "fields",
    load: () => import("@/sections/mods/smartCropControl").then((m) => m.Page) },
  // Fleet
  { key: "puncturedTires", catalogId: "puncturedTires", title: "Punctured Tires", glyph: "PT", group: "fleet",
    load: () => import("@/sections/mods/puncturedTires").then((m) => m.Page) },
  { key: "vehicleInspectionHU", catalogId: "vehicleInspectionHU", title: "Vehicle Inspection (HU)", glyph: "HU", group: "fleet",
    load: () => import("@/sections/mods/vehicleInspectionHU").then((m) => m.Page) },
  { key: "tuvSystem", catalogId: "tuvSystem", title: "TUV System", glyph: "TV", group: "fleet",
    load: () => import("@/sections/mods/tuvSystem").then((m) => m.Page) },
  { key: "implementUsageCounter", catalogId: "implementUsageCounter", title: "Implement Usage Counter", glyph: "UC", group: "fleet",
    load: () => import("@/sections/mods/implementUsageCounter").then((m) => m.Page) },
  // Units
  { key: "imperialSystem", catalogId: "imperialSystem", title: "Imperial System", glyph: "IS", group: "units",
    load: () => import("@/sections/mods/imperialSystem").then((m) => m.Page) },
];

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

export function modPageSection(key: string): ModPageSectionId {
  return `mod-${key}`;
}

export function companionPageKeyFromSection(section: string | null | undefined): string | null {
  if (!section || !section.startsWith("mod-")) return null;
  const key = section.slice(4);
  return KEY_PATTERN.test(key) ? key : null;
}

export function companionPageEntry(key: string | null | undefined): CompanionPageEntry | undefined {
  if (!key) return undefined;
  return COMPANION_PAGES.find((e) => e.key === key);
}

export function companionPageForCatalogId(catalogId: string | null | undefined): CompanionPageEntry | undefined {
  if (!catalogId) return undefined;
  return COMPANION_PAGES.find((e) => e.catalogId === catalogId);
}

type DetectPayload = {
  dataSource?: unknown;
  companionMods?: unknown;
  companionPages?: unknown;
} | null | undefined;

function detectedCatalogIds(payload: DetectPayload): Set<string> {
  const out = new Set<string>();
  const cm = payload?.companionMods as { mods?: unknown } | null | undefined;
  const mods = Array.isArray(cm?.mods) ? cm!.mods : [];
  for (const row of mods) {
    if (row && typeof row === "object") {
      const r = row as { id?: unknown; detected?: unknown };
      if (typeof r.id === "string" && r.detected === true) out.add(r.id);
    }
  }
  return out;
}

function hasCurrentCatalog(payload: DetectPayload): boolean {
  const cm = payload?.companionMods as { mods?: unknown } | null | undefined;
  return Array.isArray(cm?.mods);
}

export function companionPageDetected(entry: CompanionPageEntry, payload: DetectPayload): boolean {
  const pages = (payload?.companionPages as CompanionPagesPayload | null | undefined)?.pages;
  const active = hasCurrentCatalog(payload)
    ? detectedCatalogIds(payload).has(entry.catalogId)
    : pages?.[entry.key]?.detected === true;
  if (payload?.dataSource === "recorded-demo") {
    return active && sectionHasFeature(payload, modPageSection(entry.key));
  }
  return active;
}

/** Detected pages in sidebar order (group order, then title). */
export function visibleCompanionPages(payload: DetectPayload): CompanionPageEntry[] {
  return COMPANION_PAGES.filter((entry) => companionPageDetected(entry, payload));
}
