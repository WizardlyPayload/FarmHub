import type { ComponentType } from "preact";

export type CompanionPageGroup = "finance" | "fields" | "livestock" | "storage" | "construction" | "fleet" | "units";

export type CompanionPageProps = { entry: CompanionPageEntry };

export type CompanionPageEntry = {
  /** `<modKey>`: payload key under `companionPages.pages`, i18n prefix `companionPage.<key>.*`. */
  key: string;
  /** Companion catalog id used for detection (`companionMods.mods[].id`). */
  catalogId: string;
  /** English fallback for the sidebar label / page title. */
  title: string;
  /** Two-letter sidebar glyph. */
  glyph: string;
  group: CompanionPageGroup;
  load: () => Promise<ComponentType<CompanionPageProps>>;
};

/** Plain page object exported by `src/companionPages/<ModKey>Collector.lua`. */
export type CompanionPageData = {
  key?: string;
  detected?: boolean;
  modName?: string;
  version?: string;
  readState?: "ok" | "partial" | "settings-only" | "detection-only" | "failed" | "unknown" | string;
  error?: string;
  sampledAt?: number;
  byFarm?: Record<string, Record<string, unknown>>;
  [field: string]: unknown;
};

export type CompanionPagesPayload = {
  enabled?: boolean;
  schema?: number;
  pages?: Record<string, CompanionPageData>;
};
