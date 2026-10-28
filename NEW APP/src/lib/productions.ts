/** Production chain helpers — ported from modules/productions.js */

import {
  lookupFillTypeNameFromEconomy,
  type EconomyLike,
} from "@/lib/fillTypeResolve";
import {
  britishLabel,
  formatFillQuantity,
  type FillPhysicsMap,
  type FillUnitMode,
  type UnitDisplayInfo,
} from "@/lib/fill-units";

const INCLUDE_PUBLIC_STORAGE_KEY = "farmdash_productions_include_public_v1";

export function readIncludePublicPref(): boolean {
  try {
    return localStorage.getItem(INCLUDE_PUBLIC_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeIncludePublicPref(on: boolean) {
  try {
    localStorage.setItem(INCLUDE_PUBLIC_STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export interface ProductionSlotIO {
  fillType?: string;
  recipeAmount?: number | string;
}

export interface ProductionSlot {
  name?: string;
  isActive?: boolean;
  status?: string;
  cyclesPerHour?: number;
  inputs?: ProductionSlotIO[];
  outputs?: ProductionSlotIO[];
}

export interface ProductionChain {
  id?: string | number;
  name?: string;
  ownerFarmId?: number;
  isActive?: boolean;
  isPublic?: boolean;
  isOwned?: boolean;
  inputFillLevels?: Record<string, number>;
  outputFillLevels?: Record<string, number>;
  productions?: ProductionSlot[];
  [key: string]: unknown;
}

export interface ProductionPayload {
  chains?: ProductionChain[] | Record<string, ProductionChain>;
  [key: string]: unknown;
}

export function normalizeProductionChains(production: ProductionPayload | null | undefined): ProductionChain[] {
  if (!production) return [];
  const c = production.chains;
  if (Array.isArray(c)) return c;
  if (c && typeof c === "object") return Object.values(c);
  return [];
}

export function isPublicProductionChain(chain: ProductionChain | null | undefined): boolean {
  if (!chain) return false;
  if (chain.isPublic === true) return true;
  if (chain.isOwned === false) return true;
  const oid = Number(chain.ownerFarmId);
  return !Number.isFinite(oid) || oid <= 0;
}

export function getPublicChains(
  production: ProductionPayload | null | undefined,
): ProductionChain[] {
  return normalizeProductionChains(production).filter(isPublicProductionChain);
}

export function getOwnedChainsForFarm(
  production: ProductionPayload | null | undefined,
  farmId: number | null | undefined,
  _farmInfo?: unknown
): ProductionChain[] {
  const all = normalizeProductionChains(production);
  if (all.length === 0) return [];

  let fid = Number(farmId);
  if (!Number.isFinite(fid) || fid <= 0) fid = 1;

  // Strict active-farm only — do not fall back to other player farms
  // (that leaked farm 2 chains onto every farm view).
  return all.filter(
    (ch) => !isPublicProductionChain(ch) && Number(ch.ownerFarmId) === fid
  );
}

/** Owned chains for the farm, optionally including map/public productions. */
export function getChainsForFarmView(
  production: ProductionPayload | null | undefined,
  farmId: number | null | undefined,
  farmInfo: unknown,
  includePublic = false,
): ProductionChain[] {
  const owned = getOwnedChainsForFarm(production, farmId, farmInfo);
  if (!includePublic) return owned;
  const publicChains = getPublicChains(production);
  const seen = new Set(owned.map((c) => String(c.id ?? c.name)));
  const merged = owned.slice();
  for (const ch of publicChains) {
    const key = String(ch.id ?? ch.name);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(ch);
  }
  return merged;
}

/** Production storage getFillLevels() values are litres, including values below 1 L. */
export function formatFillAmount(
  v: unknown,
  fillKey?: unknown,
  mode: FillUnitMode = "litres",
  physics?: FillPhysicsMap | null,
  unitDisplay?: UnitDisplayInfo | null,
): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (mode === "british" || mode === "imperial") {
    return formatFillQuantity(n, fillKey, mode, physics, unitDisplay);
  }
  if (Math.abs(n) >= 1000) {
    return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} L`;
  }
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })} L`;
}

export function sortedFillEntries(map: Record<string, number> | null | undefined): [string, number][] {
  if (!map || typeof map !== "object") return [];
  return Object.keys(map)
    .sort((a, b) => a.localeCompare(b))
    .map((k) => [k, map[k]] as [string, number]);
}

function humanizeFillKey(raw: string): string {
  return String(raw || "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const productionTitlesByEconomy = new WeakMap<EconomyLike, Map<string, string>>();

function productionFillTitle(raw: string, economy: EconomyLike | null | undefined): string | null {
  if (!economy) return null;
  const catalog = economy.fillTypeCatalog || economy.marketPrices?.fillTypesByIndex;
  const titles = economy.fillTypeTitles || economy.marketPrices?.fillTypeTitles;
  if (!catalog || !titles) return null;

  if (/^\d+$/.test(raw)) {
    const direct = titles[raw];
    return typeof direct === "string" && direct.trim() ? direct.trim() : null;
  }

  let byCode = productionTitlesByEconomy.get(economy);
  if (!byCode) {
    byCode = new Map<string, string>();
    for (const [index, code] of Object.entries(catalog)) {
      const title = titles[index];
      if (typeof code === "string" && typeof title === "string" && title.trim()) {
        byCode.set(code.toUpperCase(), title.trim());
      }
    }
    productionTitlesByEconomy.set(economy, byCode);
  }
  return byCode.get(raw.toUpperCase()) || null;
}

/** Resolve sparse fill-type keys (index or enum name) to a readable label. */
export function formatProductionFillLabel(
  rawKey: string,
  economy?: EconomyLike | null | undefined,
  mode: FillUnitMode = "litres",
): string {
  const raw = String(rawKey || "").trim();
  if (!raw) return "?";
  if (mode === "british") {
    const renamed = britishLabel(raw);
    if (renamed) return renamed;
  }
  const title = productionFillTitle(raw, economy);
  if (title) {
    if (mode === "british") {
      const renamed = britishLabel(title);
      if (renamed) return renamed;
    }
    return title;
  }
  if (/^\d+$/.test(raw) && economy) {
    const fromEcon = lookupFillTypeNameFromEconomy(Number(raw), economy);
    if (fromEcon) {
      if (mode === "british") {
        const renamed = britishLabel(fromEcon);
        if (renamed) return renamed;
      }
      return humanizeFillKey(fromEcon);
    }
  }
  return humanizeFillKey(raw);
}

function chainSearchBlob(chain: ProductionChain): string {
  const parts: string[] = [
    String(chain.name || ""),
    String(chain.id ?? ""),
  ];
  for (const k of Object.keys(chain.inputFillLevels || {})) parts.push(k);
  for (const k of Object.keys(chain.outputFillLevels || {})) parts.push(k);
  for (const slot of chain.productions || []) {
    parts.push(String(slot.name || ""), String(slot.status || ""));
    for (const row of slot.inputs || []) parts.push(String(row.fillType || ""));
    for (const row of slot.outputs || []) parts.push(String(row.fillType || ""));
  }
  return parts.join(" ").toLowerCase();
}

export function filterChainsBySearch(
  chains: ProductionChain[],
  search: string,
): ProductionChain[] {
  const q = search.trim().toLowerCase();
  if (!q) return chains;
  return chains.filter((chain) => chainSearchBlob(chain).includes(q));
}

export function isProductionCollectorDisabled(
  collectorModules: Record<string, boolean> | null | undefined,
): boolean {
  return !!(collectorModules && collectorModules.production === false);
}
