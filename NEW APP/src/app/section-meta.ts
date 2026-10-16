import { isModPageSectionId, type ModPageSectionId, type SectionId } from "@/types/dashboard";
import { companionPageEntry, companionPageKeyFromSection } from "@/sections/mods/registry";

/** Built-in sections; `mod-<key>` pages take their meta from the companion page registry. */
type FixedSectionId = Exclude<SectionId, ModPageSectionId>;

export {
  detectModPresence,
  modSectionActive,
  type ModPresence,
} from "@/lib/modPresence";

export const DASHBOARD_PICTURES_BASE = "/assests/img/Dashboard%20PIctures";
export const NAV_ICONS_BASE = "/assests/img/nav";

/** Atmospheric backdrop per section. */
export const SECTION_BACKGROUNDS: Record<FixedSectionId, string | null> = {
  overview: `${DASHBOARD_PICTURES_BASE}/Background.png`,
  livestock: `${DASHBOARD_PICTURES_BASE}/livestock.png`,
  fields: `${DASHBOARD_PICTURES_BASE}/fields.png`,
  vehicles: `${DASHBOARD_PICTURES_BASE}/vehicles.png`,
  pastures: `${DASHBOARD_PICTURES_BASE}/pastures.png`,
  productions: `${DASHBOARD_PICTURES_BASE}/productions.png`,
  economy: `${DASHBOARD_PICTURES_BASE}/economy.png`,
  storage: `${DASHBOARD_PICTURES_BASE}/Storage.png`,
  redtape: `${DASHBOARD_PICTURES_BASE}/RedTape.png`,
  ads: `${DASHBOARD_PICTURES_BASE}/Ads.png`,
  invoices: `${DASHBOARD_PICTURES_BASE}/Invoices.png`,
  hirepurchasing: `${DASHBOARD_PICTURES_BASE}/HirePurchasing.png`,
  moisture: `${DASHBOARD_PICTURES_BASE}/fields.png`,
  /** No atmospheric photo — fleet overview needs a clean canvas for pins. */
  map: null,
  npcfavor: `${DASHBOARD_PICTURES_BASE}/Background.png`,
  worldevents: `${DASHBOARD_PICTURES_BASE}/Background.png`,
  prostaff: `${DASHBOARD_PICTURES_BASE}/Background.png`,
  fertilizerdepot: `${DASHBOARD_PICTURES_BASE}/Storage.png`,
};

export interface SectionNavMeta {
  labelKey: string;
  /** English label used when `labelKey` is not in the catalog yet. */
  labelFallback?: string;
  /** Fallback glyph when icon asset missing. */
  glyph: string;
  glyphKind: "symbol" | "initial";
  /** Sidebar / nav icon under /assests/img/nav/ */
  icon?: string;
  settingsKey?: string;
  /** When true, only shown when modPresence says so. */
  modGated?: boolean;
}

function navIcon(file: string): string {
  return `${NAV_ICONS_BASE}/${file}`;
}

export const SECTION_NAV_META: Record<FixedSectionId, SectionNavMeta> = {
  overview: {
    labelKey: "nav.overview",
    glyph: "⌂",
    glyphKind: "symbol",
    icon: navIcon("nav-overview.png"),
  },
  /** Legacy — not in NAV_SECTIONS; hash redirects to pastures. */
  livestock: {
    labelKey: "nav.section.pastures",
    glyph: "PA",
    glyphKind: "initial",
    settingsKey: "pastures",
    icon: navIcon("nav-pastures.png"),
  },
  fields: {
    labelKey: "nav.section.fields",
    glyph: "FD",
    glyphKind: "initial",
    settingsKey: "fields",
    icon: navIcon("nav-fields.png"),
  },
  vehicles: {
    labelKey: "nav.section.vehicles",
    glyph: "VH",
    glyphKind: "initial",
    settingsKey: "vehicles",
    icon: navIcon("nav-vehicles.png"),
  },
  pastures: {
    labelKey: "nav.section.pastures",
    glyph: "PA",
    glyphKind: "initial",
    settingsKey: "pastures",
    icon: navIcon("nav-pastures.png"),
  },
  productions: {
    labelKey: "nav.section.productions",
    glyph: "PR",
    glyphKind: "initial",
    settingsKey: "productions",
    icon: navIcon("nav-productions.png"),
  },
  storage: {
    labelKey: "nav.section.storage",
    glyph: "ST",
    glyphKind: "initial",
    settingsKey: "storage",
    icon: navIcon("nav-storage.png"),
  },
  economy: {
    labelKey: "nav.section.economy",
    glyph: "$",
    glyphKind: "symbol",
    settingsKey: "economy",
    icon: navIcon("nav-economy.png"),
  },
  redtape: {
    labelKey: "nav.mod.redtape",
    glyph: "RT",
    glyphKind: "initial",
    modGated: true,
    icon: navIcon("nav-redtape.png"),
  },
  ads: {
    labelKey: "nav.mod.ads",
    glyph: "AD",
    glyphKind: "initial",
    modGated: true,
    icon: navIcon("nav-ads.png"),
  },
  invoices: {
    labelKey: "nav.mod.invoices",
    glyph: "IN",
    glyphKind: "initial",
    modGated: true,
    icon: navIcon("nav-invoices.png"),
  },
  hirepurchasing: {
    labelKey: "nav.mod.hirepurchasing",
    glyph: "HP",
    glyphKind: "initial",
    modGated: true,
    icon: navIcon("nav-hirepurchasing.png"),
  },
  npcfavor: {
    labelKey: "nav.mod.npcfavor",
    glyph: "NF",
    glyphKind: "initial",
    modGated: true,
    icon: navIcon("nav-overview.png"),
  },
  worldevents: {
    labelKey: "nav.mod.worldevents",
    glyph: "WE",
    glyphKind: "initial",
    modGated: true,
    icon: navIcon("nav-overview.png"),
  },
  prostaff: {
    labelKey: "nav.mod.prostaff",
    glyph: "PS",
    glyphKind: "initial",
    modGated: true,
    icon: navIcon("nav-overview.png"),
  },
  fertilizerdepot: {
    labelKey: "nav.mod.fertilizerdepot",
    glyph: "FD",
    glyphKind: "initial",
    modGated: true,
    icon: navIcon("nav-fertilizerdepot.png"),
  },
  /** Kept for hash/legacy backgrounds; moisture redirects to Fields (not in MOD_NAV). */
  moisture: {
    labelKey: "nav.section.fields",
    glyph: "FD",
    glyphKind: "initial",
    settingsKey: "fields",
    icon: navIcon("nav-fields.png"),
  },
  map: {
    labelKey: "nav.section.map",
    glyph: "⌖",
    glyphKind: "symbol",
    icon: navIcon("nav-map.png"),
  },
};

export const TOPBAR_ICONS = {
  settings: navIcon("nav-settings.png"),
  notifications: navIcon("nav-notifications.png"),
} as const;

const MOD_PAGE_FALLBACK_META: SectionNavMeta = {
  labelKey: "nav.modsGroup",
  labelFallback: "Mods",
  glyph: "M",
  glyphKind: "initial",
  modGated: true,
};

export function sectionNavMeta(id: SectionId): SectionNavMeta {
  if (!isModPageSectionId(id)) return SECTION_NAV_META[id];
  const entry = companionPageEntry(companionPageKeyFromSection(id));
  if (!entry) return MOD_PAGE_FALLBACK_META;
  return {
    labelKey: `companionPage.${entry.key}.title`,
    labelFallback: entry.title,
    glyph: entry.glyph,
    glyphKind: "initial",
    modGated: true,
  };
}

export function sectionBackground(id: SectionId): string | null {
  if (isModPageSectionId(id)) return `${DASHBOARD_PICTURES_BASE}/Background.png`;
  return SECTION_BACKGROUNDS[id];
}

export function sectionVisible(id: SectionId, enabled: Partial<Record<string, boolean>>): boolean {
  const meta = sectionNavMeta(id);
  // Mod tabs are payload-gated only (see modSectionActive) — not Settings toggles.
  if (meta.modGated) return true;
  if (!meta.settingsKey) return true;
  return enabled[meta.settingsKey] !== false;
}
