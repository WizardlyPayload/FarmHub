/** Merged dashboard payload — mirrors dataMerger.js mergedCore (read-only on client). */

export interface ServerInfo {
  mapName?: string;
  saveSlot?: string;
  mapId?: string;
  mapBounds?: unknown;
  configWarning?: string;
}

/** FarmTablet Soil / SoilTreatmentDialog prescription row. */
export interface RfTreatmentStep {
  key?: string;
  label?: string;
  text?: string;
  priority?: "urgent" | "watch" | "ok" | "info" | string;
  hasRates?: boolean;
}

/** Why Soil Fertilizer is installed but not producing field data. */
export type RfSoilInactiveReason =
  | "pf-conflict"
  | "mod-absent"
  | "manager-missing"
  | "system-missing"
  | "api-missing"
  | "settings-disabled"
  | "not-initialized"
  | "not-authority";

/** Soil Fertilizer per-field enrichment (OM is 0–10, never percent). */
export interface SoilFertilizerFieldInfo {
  enabled?: boolean;
  nitrogen?: { value?: number; status?: string };
  phosphorus?: { value?: number; status?: string };
  potassium?: { value?: number; status?: string };
  /** Soil-test ppm resolved by the mod from SoilConstants.PPM_DISPLAY. */
  ppm?: {
    n?: number | null;
    p?: number | null;
    k?: number | null;
    nTarget?: number | null;
    pTarget?: number | null;
    kTarget?: number | null;
  } | null;
  pH?: number;
  /** 0–10 scalar — never treat as percent. */
  organicMatter?: number;
  weedPressure?: number;
  pestPressure?: number;
  diseasePressure?: number | null;
  shownDiseasePressure?: number | null;
  activeDisease?: string | null;
  diseaseDiscovered?: boolean;
  lastCrop?: string | null;
  lastCrop2?: string | null;
  lastCrop3?: string | null;
  rotationStatus?: string | number | null;
  rotationBonusDaysLeft?: number;
  yieldEfficiency?: number | null;
  needsFertilization?: boolean;
  urgency?: number;
  herbicideActive?: boolean;
  insecticideActive?: boolean;
  fungicideActive?: boolean;
  compaction?: number;
  simDisabled?: boolean;
  simDisabledReason?: string | null;
  isMeadow?: boolean;
  pfConflict?: boolean;
  fieldArea?: number | null;
  cropTargets?: {
    N?: { opt?: number };
    P?: { opt?: number };
    K?: { opt?: number };
  } | null;
  targetDefaults?: {
    nitrogen?: number;
    phosphorus?: number;
    potassium?: number;
    pH?: number;
    organicMatter?: number;
  } | null;
  /** Live crop growth 0–1 when SF can probe FieldState. */
  growthFraction?: number | null;
  coverageFraction?: number | null;
  sessionCoverageFraction?: number | null;
  sessionLastProduct?: string | null;
  amendBurnRisk?: boolean;
  burnDaysLeft?: number;
  daysSinceHarvest?: number | null;
  /** FarmTablet-style treatment plan (rates when SoilConstants available). */
  treatmentPlan?: RfTreatmentStep[];
}

/** Seasonal Crop Stress per-field enrichment. */
export interface CropStressFieldInfo {
  enabled?: boolean;
  moisturePercent?: number | null;
  stressPercent?: number | null;
  critical?: boolean;
  irrigationActive?: boolean | null;
  moistureOutlook?: { dayOffset: number; moisturePercent: number }[];
  difficulty?: string | null;
  alertHint?: string | null;
}

export interface RealisticFarmingPresenceMod {
  id: string;
  title: string;
  version?: string | null;
  handle?: string | null;
  detected: boolean;
}

export interface RealisticFarmingPayload {
  soilFertilizer?: {
    enabled: boolean;
    pfConflict?: boolean;
    fieldCount?: number;
    /** Set only when enabled is false — why SF produced no field rows. */
    reason?: RfSoilInactiveReason | string | null;
    modLoaded?: boolean;
    managerPresent?: boolean;
    systemPresent?: boolean;
    settingsEnabled?: boolean | null;
  };
  cropStress?: { enabled: boolean; fieldCount?: number; alertHint?: string | null };
  tax?: {
    enabled: boolean;
    byFarm?: Record<
      string,
      {
        accumulatedAnnual?: number;
        projectedBill?: number;
        taxRate?: number;
        nextEventLabel?: string | null;
        nextEventDay?: number | null;
      }
    >;
  };
  marketDynamics?: {
    enabled: boolean;
    isActive?: boolean;
    pricesEnabled?: boolean;
    eventsEnabled?: boolean;
    eventFrequency?: number | null;
    volatilityScale?: number | null;
    activeEvents?: {
      id: string;
      name: string;
      intensity: number;
      endsAt?: number;
      remainingMin?: number;
    }[];
    movers?: { fillType: string; pricePer1000l: number; pctFromBase: number }[];
    futures?: { id: string; label: string; status?: string; summary?: string }[];
  };
  fuelCosts?: {
    enabled: boolean;
    dieselPrice?: number | null;
    trend?: "up" | "down" | "flat" | null;
    lastChangePct?: number | null;
  };
  workerCosts?: {
    enabled: boolean;
    byFarm?: Record<
      string,
      {
        activeWorkers?: number;
        wageMode?: string | null;
        wageRate?: number | null;
        nextPaymentLabel?: string | null;
        periodSpend?: number | null;
      }
    >;
  };
  income?: {
    enabled: boolean;
    byFarm?: Record<
      string,
      {
        mode?: string | null;
        amount?: number | null;
        nextPayoutLabel?: string | null;
        settingsEnabled?: boolean;
      }
    >;
  };
  workplaceTriggers?: {
    enabled: boolean;
    byFarm?: Record<
      string,
      {
        workplaces: {
          id: string;
          name?: string;
          onClock?: boolean;
          wage?: number | null;
        }[];
      }
    >;
  };
  dairy?: {
    enabled: boolean;
    byFarm?: Record<
      string,
      {
        barns: {
          barnId: string;
          name?: string;
          herdHealthScore?: number;
          milkQualityTier?: string;
          spoilageStatus?: string;
          lastCollectionDay?: number;
          feedDiseaseFlag?: boolean;
          contractSummary?: string | null;
        }[];
      }
    >;
  };
  npcFavor?: {
    enabled: boolean;
    byFarm?: Record<
      string,
      {
        relationships: { npcId: string; name?: string; value?: number }[];
        activeFavors: { id?: string; type?: string; npcId?: string; summary?: string }[];
      }
    >;
  };
  worldEvents?: {
    enabled: boolean;
    frequency?: number | null;
    intensity?: number | null;
    eventTypeCount?: number | null;
    active?: {
      id: string;
      name: string;
      category?: string;
      remainingMin?: number;
      durationMin?: number;
    } | null;
    cooldownReady?: boolean | null;
  };
  proStaff?: {
    enabled: boolean;
    byFarm?: Record<
      string,
      {
        level: number;
        membershipActive?: boolean;
        investmentTotal?: number;
        discounts?: { id: string; label: string; value?: number }[];
        flags?: string[];
      }
    >;
  };
  fertilizerDepot?: {
    enabled: boolean;
    seasonalPriceHint?: string | null;
    settings?: {
      storageCapacity?: number;
      seasonalPricing?: boolean;
      /** hall = production-point bins; shopBook = walk-in 50k ledger */
      stockSource?: "hall" | "shopBook";
    };
    depots?: {
      id: string;
      name?: string;
      farmId?: number | null;
      levels: { fillType: string; liters: number; capacity?: number }[];
      seasonalPriceHint?: string | null;
    }[];
    openOrders?: { id: string; summary: string; status?: string }[];
  };
  weatherGuard?: {
    enabled: boolean;
    sky?: {
      rainScale?: number | null;
      isRaining?: boolean | null;
      cloudCoverage?: number | null;
      temperature?: number | null;
      humidity?: number | null;
      weatherType?: string | null;
    } | null;
    forecast?: {
      dayOffset: number;
      rain?: number | null;
      temperature?: number | null;
      minTemperature?: number | null;
      maxTemperature?: number | null;
      humidity?: number | null;
      weatherType?: string | null;
    }[];
    horizonDays?: number | null;
  };
  timeGuard?: {
    enabled: boolean;
    period?: number | null;
    year?: number | null;
    monthCounter?: number | null;
    monotonicDay?: number | null;
    dayInPeriod?: number | null;
    daysPerPeriod?: number | null;
    normalizationFactor?: number | null;
    synced?: boolean | null;
  };
  presence?: {
    enabled: boolean;
    mods?: RealisticFarmingPresenceMod[];
  };
}

export interface DashboardPayload {
  dataSource?: string;
  xmlAvailable?: boolean;
  luaAvailable?: boolean;
  lastUpdated?: string;
  /** Set after fill-type HUD PNGs are cached; Storage icons retry with this bust. */
  fillTypeHudEpoch?: number;
  timestamp?: number;
  schemaVersion?: number;
  serverTimeSec?: number;
  serverInfo?: ServerInfo;
  mapTitle?: string;
  mapId?: string;
  mapBounds?: unknown;
  savegameName?: string;
  saveDate?: string;
  gameSettings?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  mods?: unknown[];
  farmInfo?: unknown;
  money?: number;
  finance?: Record<string, unknown>;
  gameTime?: Record<string, unknown>;
  weather?: Record<string, unknown>;
  missions?: unknown[];
  animals?: unknown[];
  /** Field rows may carry soilFertilizer / cropStress enrichment from RF collectors. */
  fields?: (Record<string, unknown> & {
    soilFertilizer?: SoilFertilizerFieldInfo;
    cropStress?: CropStressFieldInfo;
  })[];
  vehicles?: unknown[] | Record<string, unknown>;
  production?: Record<string, unknown>;
  economy?: Record<string, unknown>;
  pastures?: unknown[];
  stock?: Record<string, unknown>;
  redTape?: Record<string, unknown>;
  invoices?: Record<string, unknown>;
  hirePurchasing?: Record<string, unknown>;
  /** Realistic Farming suite aggregates (soft-detect; enabled:false when absent). */
  realisticFarming?: RealisticFarmingPayload | null;
  baleInventory?: Record<string, unknown>;
  adsSummary?: Record<string, unknown>;
  vehicleYearsSummary?: Record<string, unknown>;
  /** Aggregated VehicleMileage nest when any vehicle has mileage.enabled. */
  mileageSummary?: {
    enabled?: boolean;
    vehicleCount?: number;
    totalOdoKm?: number;
    totalTripKm?: number;
  } | null;
  collectorModules?: Record<string, boolean>;
  dataTimestamps?: Record<string, string | number | boolean | undefined> & {
    fetchedAt?: string;
    source?: string;
    isStale?: boolean;
    staleReason?: string | null;
    cacheUsedDueToFailure?: boolean;
    confidence?: "live" | "held" | "cache" | string;
    collectionHealth?: {
      collectionDurationMs?: number;
      sourceLagSeconds?: number | null;
      parseErrors?: { file?: string; error?: string }[];
    };
  };
  diagnostics?: {
    modVersion?: string | null;
    gameVersion?: string | null;
    isAuthority?: boolean;
    lastExportGameTime?: number | null;
    lastXmlSampleTime?: string | null;
    missingDependencies?: string[];
    compatible?: boolean;
  };
  modVersionCheck?: {
    status?: "ok" | "outdated" | "unknown";
    actual?: string | null;
    expectedMin?: string;
  };
  error?: string;
}

export interface FarmDashServer {
  id: string;
  name: string;
  mode?: string;
  localSubFolder?: string;
  configWarning?: string;
}

export type SectionId =
  | "overview"
  /** @deprecated Alias only — `normalizeSectionId` maps to `pastures`. */
  | "livestock"
  | "vehicles"
  | "fields"
  | "economy"
  | "pastures"
  | "productions"
  | "storage"
  | "redtape"
  | "ads"
  | "invoices"
  | "hirepurchasing"
  | "moisture"
  | "map"
  /** RF suite mod-gated tabs */
  | "npcfavor"
  | "worldevents"
  | "prostaff"
  | "fertilizerdepot";

/** Deep-link params for section filters / tabs / entity focus. */
export interface SectionParams {
  filter?: string;
  tab?: string;
  id?: string;
  role?: string;
  view?: string;
}

/** Core nav always listed (mods appear dynamically when payload says so). */
export const NAV_SECTIONS: SectionId[] = [
  "overview",
  "fields",
  "vehicles",
  "pastures",
  "productions",
  "storage",
  "economy",
  "map",
];

/** Mod-gated sidebar sections (shown only when payload indicates mod active). */
export const MOD_NAV_SECTIONS: SectionId[] = [
  "redtape",
  "ads",
  "invoices",
  "hirepurchasing",
  "npcfavor",
  "worldevents",
  "prostaff",
  "fertilizerdepot",
];

export const ALL_SECTIONS: SectionId[] = [...NAV_SECTIONS, ...MOD_NAV_SECTIONS];

export function isSectionId(value: string): value is SectionId {
  return (ALL_SECTIONS as string[]).includes(value) || value === "moisture" || value === "livestock";
}

/** Normalize legacy hashes / prefs. Livestock → Pastures; Moisture → Fields. */
export function normalizeSectionId(value: string | null | undefined): SectionId {
  if (!value) return "overview";
  if (value === "home" || value === "landing" || value === "dashboard") return "overview";
  if (value === "livestock") return "pastures";
  if (value === "moisture") return "fields";
  if ((ALL_SECTIONS as string[]).includes(value)) return value as SectionId;
  return "overview";
}

export interface WsDataMessage {
  type: "data";
  serverId: string;
  data: DashboardPayload;
  timestamp: string;
}
