/** Active only when a known unit-display mod is loaded (and its choices say so). */
export type FillUnitMode = "litres" | "british" | "imperial";

export interface FillPhysics {
  /** Kilograms per litre (Giants `physics#massPerLiter`). */
  kg: number;
  liquid?: boolean;
}

export type FillPhysicsMap = Record<string, FillPhysics>;

export interface UnitDisplayMod {
  id?: string;
  style?: string;
}

/** Choices from FastFarm Dad Imperial System Conversion Settings. */
export interface ImperialUnitSettings {
  present?: boolean;
  settingsAvailable?: boolean;
  ownsFillUnits?: boolean;
  liquid?: "liters" | "gallons";
  crops?: "liters" | "imperial";
  weight?: "metric" | "imperial";
  weightScale?: "auto" | "pounds" | "tons";
  measure?: "metric" | "imperial";
}

export interface UnitDisplayInfo {
  british?: boolean;
  britishFillUnits?: { present?: boolean; active?: boolean; ownsFillUnits?: boolean; version?: string } | null;
  imperial?: ImperialUnitSettings | null;
  unitConverter?: { present?: boolean; settingsKnown?: boolean; settings?: Record<string, unknown> } | null;
  saveUnitProfiles?: {
    applyState?: "effective" | "partial" | "pending" | "unavailable";
    effective?: {
      money?: number;
      miles?: boolean;
      fahrenheit?: boolean;
      acre?: boolean;
      use24HourTime?: boolean;
    };
  } | null;
  mods?: UnitDisplayMod[];
}

const FALLBACK_KG: Record<string, number> = {
  WHEAT: 0.78,
  BARLEY: 0.68,
  OAT: 0.5,
  CANOLA: 0.6,
  SORGHUM: 0.85,
  SUNFLOWER: 0.35,
  SOYBEAN: 0.7,
  MAIZE: 0.8,
  CORN: 0.8,
  POTATO: 0.75,
  SUGARBEET: 0.7,
  BEETROOT: 0.52,
  CARROT: 0.64,
  PARSNIP: 0.58,
  COTTON: 0.23,
  GREENBEAN: 0.42,
  PEA: 0.72,
  SPINACH: 0.13,
  SUGARCANE: 0.18,
  WOODCHIPS: 0.35,
  SUGARBEET_CUT: 0.7,
  SILAGE: 0.45,
  GRASS: 0.3,
  GRASS_WINDROW: 0.3,
  DRYGRASS: 0.07,
  DRYGRASS_WINDROW: 0.07,
  HAY: 0.07,
  STRAW: 0.06,
  RICE: 0.79,
  RICELONGGRAIN: 0.77,
  STONE: 1.6,
  FORAGE: 0.3,
  SEEDS: 0.35,
  FERTILIZER: 0.8,
  LIME: 1.2,
  MANURE: 0.7,
  MUCK: 0.7,
  PIGFOOD: 0.65,
  MINERAL_FEED: 0.65,
  SNOW: 0.3,
  CHAFF: 0.3,
  FLOUR: 0.4,
  SUGAR: 1,
  WOOL: 0.76,
  EGG: 0.2,
};

const LIQUID_NAMES = new Set([
  "MILK",
  "GOATMILK",
  "BUFFALOMILK",
  "MILK_BOTTLED",
  "GOATMILK_BOTTLED",
  "BUFFALOMILK_BOTTLED",
  "WATER",
  "DIESEL",
  "DEF",
  "LIQUIDFERTILIZER",
  "LIQUID_FERTILIZER",
  "HERBICIDE",
  "LIQUIDMANURE",
  "LIQUID_MANURE",
  "SLURRY",
  "DIGESTATE",
  "LIQUIDSEEDTREATMENT",
  "HONEY",
  "SUNFLOWER_OIL",
  "CANOLA_OIL",
  "OLIVE_OIL",
  "RICE_OIL",
  "GRAPEJUICE",
]);

const BRITISH_LABELS: Record<string, string> = {
  CANOLA: "OSR",
  MAIZE: "Maize",
  CORN: "Maize",
  MANURE: "Muck",
};

/** US bushel crops from Imperial System Conversion Settings. */
const BUSHEL_CROPS = new Set([
  "WHEAT",
  "BARLEY",
  "OAT",
  "CANOLA",
  "SORGHUM",
  "SOYBEAN",
  "MAIZE",
  "CORN",
  "RYE",
  "SPELT",
  "BUCKWHEAT",
  "LINSEED",
  "FLAX",
  "TRITICALE",
  "SEEDS",
]);

const LITERS_PER_GALLON = 3.78541;
const LITERS_PER_BUSHEL = 35.2391;
const KG_PER_POUND = 0.453592;
const LBS_PER_US_TON = 2000;
const KG_PER_US_TON = 907.185;

function imperialActive(imperial: ImperialUnitSettings | null | undefined): boolean {
  if (!imperial || !imperial.present) return false;
  return (
    imperial.liquid === "gallons" ||
    imperial.crops === "imperial" ||
    imperial.weight === "imperial"
  );
}

/** Prefer British Fill Units, then Imperial System when any imperial choice is on. */
export function fillUnitsActive(unitDisplay: UnitDisplayInfo | null | undefined): FillUnitMode {
  if (unitDisplay?.british) return "british";
  if (imperialActive(unitDisplay?.imperial || null)) return "imperial";
  return "litres";
}

const LIQUID_UNITS = new Set(["liters", "gallons"]);
const CROP_UNITS = new Set(["liters", "imperial"]);
const WEIGHT_UNITS = new Set(["metric", "imperial"]);

function recognizedImperialChoice(imperial: ImperialUnitSettings | null | undefined): boolean {
  if (!imperial) return false;
  return (
    (imperial.liquid != null && LIQUID_UNITS.has(imperial.liquid)) ||
    (imperial.crops != null && CROP_UNITS.has(imperial.crops)) ||
    (imperial.weight != null && WEIGHT_UNITS.has(imperial.weight))
  );
}

/** A false british flag, an empty object, an unread provider, or an invalid enum is not ownership. */
export function fillProviderOwnsUnits(unitDisplay: UnitDisplayInfo | null | undefined): boolean {
  if (!unitDisplay || typeof unitDisplay !== "object") return false;
  if (unitDisplay.british === true) return true;
  const imperial = unitDisplay.imperial;
  if (!imperial || imperial.present !== true || imperial.settingsAvailable === false) return false;
  return recognizedImperialChoice(imperial);
}

export function fillUnitOwnerId(unitDisplay: UnitDisplayInfo | null | undefined): string | null {
  if (!fillProviderOwnsUnits(unitDisplay)) return null;
  const style = unitDisplay?.british === true ? "british" : "imperial";
  const match = unitDisplay?.mods?.find((mod) => mod?.style === style);
  return match?.id || (style === "british" ? "British Fill Units" : "Imperial System");
}

/**
 * Precedence: an explicit Settings choice (litres / british / imperial) wins; Automatic (null) follows the
 * loaded unit mod (British Fill Units before Imperial System); with neither, litres.
 */
export function effectiveFillUnitMode(
  unitDisplay: UnitDisplayInfo | null | undefined,
  viewerMode?: FillUnitMode | null,
): FillUnitMode {
  if (viewerMode === "british" || viewerMode === "imperial" || viewerMode === "litres") return viewerMode;
  if (fillProviderOwnsUnits(unitDisplay)) return fillUnitsActive(unitDisplay);
  return "litres";
}

/** US factors from Imperial System Conversion Settings 1.1.0.0. Used only for a manual choice with no owning provider. */
const MANUAL_US_IMPERIAL: ImperialUnitSettings = {
  present: true,
  settingsAvailable: true,
  ownsFillUnits: true,
  liquid: "gallons",
  crops: "imperial",
  weight: "imperial",
  weightScale: "auto",
};

function imperialPolicy(unitDisplay: UnitDisplayInfo | null | undefined): ImperialUnitSettings {
  const imperial = unitDisplay?.imperial;
  if (
    imperial &&
    imperial.present === true &&
    imperial.settingsAvailable !== false &&
    imperial.ownsFillUnits !== false &&
    (imperial.liquid != null || imperial.crops != null || imperial.weight != null)
  ) {
    return imperial;
  }
  return MANUAL_US_IMPERIAL;
}

/** Store selectors return these when metadata is absent; a fresh `{}` per read would re-render forever. */
const EMPTY_UNIT_DISPLAY: UnitDisplayInfo = Object.freeze<UnitDisplayInfo>({});
const EMPTY_FILL_PHYSICS: FillPhysicsMap = Object.freeze<FillPhysicsMap>({});

type CompanionUnitPage = Record<string, unknown> & { detected?: unknown; modName?: unknown; settings?: unknown; gameUnits?: unknown };

function detectedUnitPage(pagesRoot: unknown, key: string): CompanionUnitPage | null {
  const pages = pagesRoot && typeof pagesRoot === "object" ? (pagesRoot as { pages?: unknown }).pages : null;
  const page = pages && typeof pages === "object" ? (pages as Record<string, unknown>)[key] : null;
  if (!page || typeof page !== "object" || Array.isArray(page)) return null;
  return (page as CompanionUnitPage).detected === true ? (page as CompanionUnitPage) : null;
}

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function imperialFromPage(page: CompanionUnitPage): ImperialUnitSettings | null {
  const s = page.settings && typeof page.settings === "object" ? (page.settings as Record<string, unknown>) : null;
  if (!s) return null;
  const out: ImperialUnitSettings = {
    present: true,
    settingsAvailable: true,
    liquid: pick(s.liquid, ["liters", "gallons"] as const),
    crops: pick(s.crops, ["liters", "imperial"] as const),
    weight: pick(s.weight, ["metric", "imperial"] as const),
    weightScale: pick(s.weightScale, ["auto", "pounds", "tons"] as const),
    measure: pick(s.measure, ["metric", "imperial"] as const),
  };
  out.ownsFillUnits = out.liquid != null || out.crops != null || out.weight != null;
  return out.ownsFillUnits ? out : null;
}

function gameUnitsProfile(pages: Array<CompanionUnitPage | null>): UnitDisplayInfo["saveUnitProfiles"] {
  for (const page of pages) {
    const g = page?.gameUnits && typeof page.gameUnits === "object" ? (page.gameUnits as Record<string, unknown>) : null;
    if (!g) continue;
    const effective: NonNullable<NonNullable<UnitDisplayInfo["saveUnitProfiles"]>["effective"]> = {};
    if (typeof g.useAcre === "boolean") effective.acre = g.useAcre;
    if (typeof g.useMiles === "boolean") effective.miles = g.useMiles;
    if (typeof g.useFahrenheit === "boolean") effective.fahrenheit = g.useFahrenheit;
    if (Object.keys(effective).length > 0) return { applyState: "effective", effective };
  }
  return null;
}

/**
 * The mod's own `unitDisplay` export, filled in from the British Fill Units / Imperial System companion pages
 * when that export did not recognise the mod (other ModHub folder names). A reading the export already has is
 * never overridden. Areas, speed and temperature use the game unit flags those pages carry only when Save Unit
 * Profiles gave no live reading.
 */
export function withCompanionUnitPages(raw: UnitDisplayInfo, companionPages: unknown): UnitDisplayInfo {
  const british = detectedUnitPage(companionPages, "britishFillUnits");
  const imperialPage = detectedUnitPage(companionPages, "imperialSystem");
  if (!british && !imperialPage) return raw;
  const next: UnitDisplayInfo = { ...raw };
  const mods = [...(Array.isArray(raw.mods) ? raw.mods : [])];
  let changed = false;
  const addMod = (page: CompanionUnitPage, style: string, fallback: string) => {
    if (mods.some((m) => m?.style === style)) return;
    mods.push({ id: typeof page.modName === "string" && page.modName ? page.modName : fallback, style });
  };
  if (british && raw.british !== true && raw.britishFillUnits?.present !== true) {
    next.british = true;
    addMod(british, "british", "British Fill Units");
    changed = true;
  }
  if (imperialPage && raw.imperial?.present !== true) {
    const imperial = imperialFromPage(imperialPage);
    if (imperial) {
      next.imperial = imperial;
      addMod(imperialPage, "imperial", "Imperial System");
      changed = true;
    }
  }
  if (!raw.saveUnitProfiles?.effective) {
    const profile = gameUnitsProfile([british, imperialPage]);
    if (profile) {
      next.saveUnitProfiles = profile;
      changed = true;
    }
  }
  if (!changed) return raw;
  next.mods = mods;
  return next;
}

type UnitPayload = { unitDisplay?: unknown; companionPages?: unknown };
const UNIT_DISPLAY_CACHE = new WeakMap<object, { raw: unknown; pages: unknown; out: UnitDisplayInfo }>();

export function unitDisplayFromPayload(payload: UnitPayload | null | undefined): UnitDisplayInfo {
  if (!payload || typeof payload !== "object") return EMPTY_UNIT_DISPLAY;
  const rawValue = payload.unitDisplay;
  const pages = payload.companionPages;
  const cached = UNIT_DISPLAY_CACHE.get(payload);
  if (cached && cached.raw === rawValue && cached.pages === pages) return cached.out;
  const raw = rawValue && typeof rawValue === "object" ? (rawValue as UnitDisplayInfo) : EMPTY_UNIT_DISPLAY;
  const out = withCompanionUnitPages(raw, pages);
  UNIT_DISPLAY_CACHE.set(payload, { raw: rawValue, pages, out });
  return out;
}

export function physicsFromPayload(
  payload: { fillTypePhysics?: unknown } | null | undefined,
): FillPhysicsMap {
  const raw = payload?.fillTypePhysics;
  if (!raw || typeof raw !== "object") return EMPTY_FILL_PHYSICS;
  return raw as FillPhysicsMap;
}

export function normalizeFillKey(raw: unknown): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function britishLabel(raw: unknown): string | null {
  const key = normalizeFillKey(raw);
  if (!key) return null;
  if (BRITISH_LABELS[key]) return BRITISH_LABELS[key];
  const stripped = key.replace(/_?\d+$/, "");
  return BRITISH_LABELS[stripped] || null;
}

function physicsEntry(key: string, physics: FillPhysicsMap | null | undefined): FillPhysics | null {
  if (!key) return null;
  const row = physics?.[key];
  const kg = Number(row?.kg);
  if (!Number.isFinite(kg) || kg <= 0) return null;
  return row ?? null;
}

export function lookupFillPhysics(
  fillKey: unknown,
  physics: FillPhysicsMap | null | undefined,
): { kgPerL: number; liquid: boolean } | null {
  const key = normalizeFillKey(fillKey);
  if (!key || key === "UNKNOWN") return null;
  const stripped = key.replace(/_?\d+$/, "");
  const exported = physicsEntry(key, physics) || physicsEntry(stripped, physics);
  if (exported) {
    return { kgPerL: Number(exported.kg), liquid: exported.liquid === true };
  }
  const liquid = LIQUID_NAMES.has(key) || LIQUID_NAMES.has(stripped);
  const kg = FALLBACK_KG[key] ?? FALLBACK_KG[stripped];
  if (liquid && !(kg > 0)) return { kgPerL: 1, liquid: true };
  if (!(kg > 0)) return liquid ? { kgPerL: 1, liquid: true } : null;
  return { kgPerL: kg, liquid };
}

export function formatMassKg(kg: number): string {
  if (!Number.isFinite(kg)) return "—";
  const abs = Math.abs(kg);
  if (abs < 1000) {
    const digits = abs >= 100 || abs === 0 ? 0 : abs >= 10 ? 1 : 2;
    return `${kg.toLocaleString(undefined, { maximumFractionDigits: digits })} kg`;
  }
  const tonnes = kg / 1000;
  const tAbs = Math.abs(tonnes);
  const digits = tAbs >= 100 ? 0 : tAbs >= 10 ? 1 : 2;
  return `${tonnes.toLocaleString(undefined, { maximumFractionDigits: digits })} t`;
}

export function formatLitres(liters: number): string {
  if (!Number.isFinite(liters)) return "—";
  return `${liters.toLocaleString(undefined, { maximumFractionDigits: 0 })} L`;
}

function formatGallons(liters: number): string {
  const gal = liters / LITERS_PER_GALLON;
  return `${Math.round(gal).toLocaleString(undefined, { maximumFractionDigits: 0 })} US gal`;
}

function formatBushels(liters: number): string {
  const bu = liters / LITERS_PER_BUSHEL;
  return `${Math.round(bu).toLocaleString(undefined, { maximumFractionDigits: 0 })} US bu`;
}

function formatImperialWeight(kg: number, scale: ImperialUnitSettings["weightScale"]): string {
  const lbs = kg / KG_PER_POUND;
  let useTons = false;
  if (scale === "pounds") useTons = false;
  else if (scale === "tons") useTons = true;
  else useTons = lbs >= LBS_PER_US_TON;
  if (useTons) {
    const tons = kg / KG_PER_US_TON;
    return `${tons.toLocaleString(undefined, { maximumFractionDigits: 1 })} US tn`;
  }
  return `${Math.round(lbs).toLocaleString(undefined, { maximumFractionDigits: 0 })} lbs`;
}

type ImperialCategory = "liquid" | "grain" | "drybulk" | "count";

function classifyImperialFill(
  fillKey: unknown,
  physics?: FillPhysicsMap | null,
): ImperialCategory {
  const key = normalizeFillKey(fillKey);
  const stripped = key.replace(/_?\d+$/, "");
  if (!key) return "drybulk";
  if (key === "METHANE" || key === "ELECTRICCHARGE" || key === "AIR") return "count";
  const spec = lookupFillPhysics(fillKey, physics);
  if (spec?.liquid || LIQUID_NAMES.has(key) || LIQUID_NAMES.has(stripped)) return "liquid";
  if (BUSHEL_CROPS.has(key) || BUSHEL_CROPS.has(stripped)) return "grain";
  if (
    key.includes("EGG") ||
    key.includes("WOOL") ||
    key.includes("BALE") ||
    key.includes("PALLET") ||
    key.includes("CARTON")
  ) {
    return "count";
  }
  return "drybulk";
}

function formatImperialQuantity(
  liters: number,
  fillKey: unknown,
  imperial: ImperialUnitSettings,
  physics?: FillPhysicsMap | null,
): string {
  const cat = classifyImperialFill(fillKey, physics);
  if (cat === "count") return formatLitres(liters);
  if (cat === "liquid") {
    return imperial.liquid === "gallons" ? formatGallons(liters) : formatLitres(liters);
  }
  if (cat === "grain") {
    return imperial.crops === "imperial" ? formatBushels(liters) : formatLitres(liters);
  }
  if (imperial.crops !== "imperial") return formatLitres(liters);
  const spec = lookupFillPhysics(fillKey, physics);
  if (!spec?.kgPerL || !(spec.kgPerL > 0)) return formatLitres(liters);
  return formatImperialWeight(liters * spec.kgPerL, imperial.weightScale || "auto");
}

/** Solids: kg under 1 t, tonnes from 1 t. Liquids stay litres. Unknown solids stay litres. */
export function formatFillQuantity(
  liters: number,
  fillKey: unknown,
  mode: FillUnitMode,
  physics?: FillPhysicsMap | null,
  unitDisplay?: UnitDisplayInfo | null,
): string {
  if (!Number.isFinite(liters)) return "—";
  if (mode === "imperial") {
    return formatImperialQuantity(liters, fillKey, imperialPolicy(unitDisplay), physics);
  }
  if (mode !== "british") return formatLitres(liters);
  const spec = lookupFillPhysics(fillKey, physics);
  if (!spec || spec.liquid || !Number.isFinite(spec.kgPerL) || !(spec.kgPerL > 0)) return formatLitres(liters);
  return formatMassKg(liters * spec.kgPerL);
}

/** FS prices are per 1,000 L. Solids in British mode are per tonne. */
export function fillPriceAmount(
  pricePer1000L: number,
  fillKey: unknown,
  mode: FillUnitMode,
  physics?: FillPhysicsMap | null,
  unitDisplay?: UnitDisplayInfo | null,
): { amount: number; unit: string } {
  const price = Number(pricePer1000L);
  if (!Number.isFinite(price) || price <= 0) return { amount: 0, unit: "" };
  if (mode === "imperial") {
    const policy = imperialPolicy(unitDisplay);
    const cat = classifyImperialFill(fillKey, physics);
    if (cat === "liquid" && policy.liquid === "gallons") {
      return { amount: price * (LITERS_PER_GALLON / 1000), unit: "/ US gal" };
    }
    if (cat === "grain" && policy.crops === "imperial") {
      return { amount: price * (LITERS_PER_BUSHEL / 1000), unit: "/ US bu" };
    }
    if (cat === "drybulk" && policy.crops === "imperial") {
      const spec = lookupFillPhysics(fillKey, physics);
      if (spec?.kgPerL && Number.isFinite(spec.kgPerL) && spec.kgPerL > 0) {
        return { amount: price * (KG_PER_US_TON / (1000 * spec.kgPerL)), unit: "/ US tn" };
      }
    }
    return { amount: price, unit: "/ 1,000 L" };
  }
  if (mode !== "british") return { amount: price, unit: "/ 1,000 L" };
  const spec = lookupFillPhysics(fillKey, physics);
  if (!spec || spec.liquid || !Number.isFinite(spec.kgPerL) || !(spec.kgPerL > 0)) return { amount: price, unit: "/ 1,000 L" };
  return { amount: price / spec.kgPerL, unit: "/ t" };
}

export function formatFillPrice(
  pricePer1000L: number,
  fillKey: unknown,
  mode: FillUnitMode,
  physics: FillPhysicsMap | null | undefined,
  formatMoney: (amount: number) => string,
  unitDisplay?: UnitDisplayInfo | null,
): string {
  const priced = fillPriceAmount(pricePer1000L, fillKey, mode, physics, unitDisplay);
  if (!(priced.amount > 0)) return "—";
  const money = formatMoney(priced.amount);
  if (!priced.unit || (mode !== "british" && mode !== "imperial")) return money;
  return `${money} ${priced.unit}`;
}

/** Sum known forage rows into one mass. A mixed total with no breakdown stays in litres. */
export function formatMixedFood(
  parts: Array<{ fill: string; liters: number }>,
  totalLiters: number,
  mode: FillUnitMode,
  physics?: FillPhysicsMap | null,
  _unitDisplay?: UnitDisplayInfo | null,
): string {
  const total = Number(totalLiters);
  if (mode === "imperial") {
    // Mixed forage is not one commodity; keep litres rather than guess bushels/lbs.
    return formatLitres(total);
  }
  if (mode !== "british") return formatLitres(total);
  let kg = 0;
  let partLiters = 0;
  for (const part of parts) {
    const liters = Number(part.liters);
    if (!(liters > 0)) continue;
    const spec = lookupFillPhysics(part.fill, physics);
    if (!spec || spec.liquid || !(spec.kgPerL > 0)) continue;
    kg += liters * spec.kgPerL;
    partLiters += liters;
  }
  if (!(partLiters > 0)) return formatLitres(total);
  const extra = Math.max(0, (Number.isFinite(total) ? total : 0) - partLiters);
  if (extra > 0) return formatLitres(total);
  return formatMassKg(kg);
}
