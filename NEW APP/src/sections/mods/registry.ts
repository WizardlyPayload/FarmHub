/**
 * The one list of dedicated companion-mod pages. Each entry drives its sidebar MODS item (shown only
 * when the mod is detected), its `#mod-<key>` route and the "Open full page" links from section embeds.
 */

import type { ModPageSectionId } from "@/types/dashboard";
import type { CompanionPageEntry, CompanionPagesPayload } from "./types";

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
  { key: "palletDegradation", catalogId: "palletDegradation", title: "Pallet Degradation", glyph: "PD", group: "storage",
    load: () => import("@/sections/mods/palletDegradation").then((m) => m.Page) },
  { key: "realSilo", catalogId: "realSilo", title: "RealSilo", glyph: "RS", group: "storage",
    load: () => import("@/sections/mods/realSilo").then((m) => m.Page) },
  // Construction
  { key: "everythingConstructable", catalogId: "everythingConstructable", title: "Everything Constructable", glyph: "EC", group: "construction",
    load: () => import("@/sections/mods/everythingConstructable").then((m) => m.Page) },
  // Fields
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

export function companionPageDetected(entry: CompanionPageEntry, payload: DetectPayload): boolean {
  const pages = (payload?.companionPages as CompanionPagesPayload | null | undefined)?.pages;
  if (pages && pages[entry.key]?.detected === true) return true;
  return detectedCatalogIds(payload).has(entry.catalogId);
}

/** Detected pages in sidebar order (group order, then title). */
export function visibleCompanionPages(payload: DetectPayload): CompanionPageEntry[] {
  const pages = (payload?.companionPages as CompanionPagesPayload | null | undefined)?.pages ?? {};
  const ids = detectedCatalogIds(payload);
  return COMPANION_PAGES.filter((e) => pages[e.key]?.detected === true || ids.has(e.catalogId));
}
