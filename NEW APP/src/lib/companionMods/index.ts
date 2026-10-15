import type { SeasonalWoolReading } from "./seasonalWool";
export { woolView } from "./seasonalWool";
export { selectedCompanionFarmId } from "./readings";
/** Soft-detect high-value third-party companion mods from Lua `companionMods` export. */

import type {
  AdvancedMaintenanceReading,
  ExtendedMaintenanceReading,
  PalletConditionReading,
  RealSiloReading,
  SeasonalMilkReading,
  VehicleServiceReading,
} from "./assetReadings";

export * from "./assetReadings";
export type {
  CompanionCatalogEntry,
  CompanionCategory,
  CompanionSupport,
} from "./catalog";
export {
  COMPANION_CATALOG,
  COMPANION_CATEGORY_ORDER,
  catalogEntry,
  categoryLabelKey,
  companionSupport,
} from "./catalog";

import type { DistributionBlock, FactoryProfitBlock, MoistureBlock, SilageHudBlock } from "./productionPath";

export type {
  Coverage,
  DistributionBlock,
  FactoryIoRow,
  FactoryLine,
  FactoryProfitBlock,
  FactoryProjection,
  FactoryView,
  MoistureBlock,
  ReadingStatus,
  SilageHudBlock,
} from "./productionPath";
export {
  coverageOf,
  currentSellPricePer1000,
  factoryView,
  privateRows,
  projectFactoryLine,
  readingStatus,
} from "./productionPath";

export type CompanionModRow = {
  id?: string;
  title?: string;
  category?: string;
  version?: string | null;
  modName?: string | null;
  detected?: boolean;
};

export type CompanionModsLoansFarm = {
  count?: number;
  restAmount?: number;
  monthlyAnnuity?: number | null;
  loans?: Array<{
    amount?: number;
    restAmount?: number;
    interest?: number | null;
    durationYears?: number;
    restMonths?: number;
    monthlyAnnuity?: number | null;
  }>;
};

export type CompanionModsPayload = {
  enabled?: boolean;
  mods?: CompanionModRow[];
  loans?: {
    enabled?: boolean;
    readState?: "ok" | "failed" | "unavailable" | string;
    source?: string;
    loanCount?: number;
    restAmount?: number;
    loanInterest?: number | null;
    dynamicInterest?: boolean;
    byFarm?: Record<string, CompanionModsLoansFarm>;
  };
  diesel?: {
    enabled?: boolean;
    /** Price origin: "native" | "rdpPreset". Older snapshots carry a mod id here, which is not an origin. */
    source?: string;
    /** Active diesel modifier ids. Presence does not prove which mod wrote the price. */
    contributors?: string[];
    pricePerLiter?: number | null;
    region?: string | null;
    country?: string | null;
  };
  restrictedPeriods?: {
    enabled?: boolean;
    readState?: "ok" | "failed" | "unavailable" | string;
    liquidBan?: string | null;
    solidBan?: string | null;
    anyActive?: boolean;
    currentPeriod?: number | null;
    liquidWindow?: RestrictedWindow;
    solidWindow?: RestrictedWindow;
  };
  cropCalendar?: {
    enabled?: boolean;
    readState?: "ok" | "failed" | "unavailable" | string;
    selectedRegion?: string | null;
    calendarsReadState?: string;
    coverage?: string;
    crops?: Array<{ crop: string; plantingPeriods?: number[]; harvestPeriods?: number[]; readState?: string; source?: string }>;
    weatherEnabled?: boolean;
    yieldEnabled?: boolean;
    strictSuitabilityEnabled?: boolean;
  };
  automaticLoanRepay?: {
    enabled?: boolean;
    minimumBalance?: number | null;
    repaymentHour?: number | null;
  };
  betterContracts?: {
    enabled?: boolean;
    missionCount?: number;
    lazyNPC?: boolean;
    hardMode?: boolean;
  };
  livestockMonitor?: {
    enabled?: boolean;
    readState?: string;
    scope?: string;
    displayMode?: string;
    refreshInterval?: number;
    /** Local HUD alert queue; present only with the export farm id. */
    queuedAlerts?: number;
    hasActiveAlert?: boolean;
    alertScope?: string;
    alertCoverage?: string;
    farmId?: number;
  };
  productionWatcher?: {
    enabled?: boolean;
    readState?: string;
    farmId?: number;
    coverage?: string;
    productionPointCount?: number;
    countSource?: string;
    alertsReadable?: boolean;
  };
  palletDegradation?: PalletConditionReading;
  outOfFuel?: { enabled?: boolean };
  soilWorkYieldBonus?: { enabled?: boolean };
  seasonalMilk?: SeasonalMilkReading;
  yieldTracker?: {
    enabled?: boolean;
    readState?: string;
    coverage?: string;
    scope?: string;
    farmId?: number;
    rows?: Array<{ year?: number | null; fieldId?: number | null; crop?: string; fillKey?: string; liters?: number | null }>;
  };
  fieldLeases?: {
    enabled?: boolean;
    readState?: string;
    farmId?: number;
    leases?: Array<{ farmlandId?: number | null; price?: number | null; duration?: number | null }>;
  };
  dynamicMarket?: { enabled?: boolean };
  realSilo?: RealSiloReading;
  advancedMaintenance?: AdvancedMaintenanceReading;
  extendedVehicleMaintenance?: ExtendedMaintenanceReading;
  realisticVehicleService?: VehicleServiceReading;
  saveUnitProfiles?: {
    enabled?: boolean;
    readState?: string;
    scope?: string;
    /** Game money setting id. Display glyphs come from unitDisplay, never from this field. */
    moneyUnit?: number | null;
    moneyUnitName?: string | null;
    profileName?: string | null;
    hasApplied?: boolean;
    lastApplyOk?: boolean;
  };
  seasonalWool?: SeasonalWoolReading;
  taskList?: {
    enabled?: boolean;
    readState?: string;
    tasks?: Array<{ id?: string; detail?: string; priority?: number | null }>;
  };
  productionSchedule?: {
    enabled?: boolean;
    readState?: string;
    recipes?: Array<{ pointKey?: string; recipeId?: string; status?: string | null }>;
  };
  economicHistory?: {
    enabled?: boolean;
    readState?: string;
    current?: { balance?: number | null; total?: number | null; loanBalance?: number | null } | null;
    months?: Array<{ year?: number | null; period?: number | null; total?: number | null }>;
  };
  animalFoodCalculator?: {
    enabled?: boolean;
    readState?: string;
    scope?: string;
    mode?: string | null;
    foodScale?: number | null;
    waterScale?: number | null;
    strawScale?: number | null;
    daysPerPeriod?: number | null;
    scalingEnabled?: boolean;
  };
  animalPlanner?: {
    enabled?: boolean;
    readState?: string;
    barns?: Array<{ name?: string; numAnimals?: number | null; maxAnimals?: number | null }>;
  };
  vipOrders?: {
    enabled?: boolean;
    readState?: string;
    farmId?: number;
    scope?: string;
    coverage?: string;
    reason?: string;
    orderCount?: number | null;
    currentOrder?: {
      level?: number | null;
      items?: number;
      remainingItems?: number;
      payout?: number;
      coverage?: string;
    } | null;
  };
  farmReputation?: {
    enabled?: boolean;
    readState?: string;
    farmId?: number;
    reputation?: number | null;
    missionLimit?: number | null;
  };
  moistureSystem?: MoistureBlock;
  rentYourField?: {
    enabled?: boolean;
    readState?: string;
    farmId?: number;
    agreements?: Array<{ farmlandId?: number | null; duration?: number | null }>;
  };
  farmlandMarketplace?: {
    enabled?: boolean;
    readState?: string;
    farmId?: number;
    rows?: Array<{ kind?: string; farmlandId?: number | null; price?: number | null }>;
  };
  fieldProfitabilityLedger?: {
    enabled?: boolean;
    readState?: string;
    coverage?: string;
    farmId?: number;
    cycles?: Array<{
      cycleId?: string | null;
      land?: string | null;
      farmId?: number;
      crop?: string | null;
      state?: string | null;
      area?: number | null;
      qualityClass?: string | null;
      totalsRead?: string;
      totalsCoverage?: "complete" | "partial" | "truncated";
      totalsCount?: number;
      totalsCountExact?: boolean;
      totalsScanned?: number;
      totalsRejected?: number;
      totalsTruncated?: boolean;
      totals?: Array<{
        accountingClass?: string | null;
        category?: string | null;
        unit?: string | null;
        direction?: string | null;
        amount?: number;
      }>;
    }>;
    sales?: { present?: boolean; reason?: string };
  };
  distributionRedux?: DistributionBlock;
  silageCompaction?: SilageHudBlock;
  factoryProfitCalculator?: FactoryProfitBlock;
  farmOperations?: {
    enabled?: boolean;
    readState?: string;
    farmId?: number;
    fields?: Array<{ farmlandId?: number | null; growthState?: number | null }>;
  };
};

export function isCompanionModsActive(
  payload: CompanionModsPayload | null | undefined,
): boolean {
  if (!payload || typeof payload !== "object") return false;
  if (payload.enabled === true) return true;
  return Array.isArray(payload.mods) && payload.mods.some((m) => m?.detected === true);
}

export function detectedCompanionMods(
  payload: CompanionModsPayload | null | undefined,
): CompanionModRow[] {
  if (!isCompanionModsActive(payload)) return [];
  const rows = Array.isArray(payload!.mods) ? payload!.mods : [];
  return rows.filter((m) => m && m.detected !== false && (m.title || m.id));
}

export {
  companionLoansForFarm,
  cropRegionView,
  loanFarmView,
  overviewOutstanding,
  restrictionAdvice,
  type LoanFarmView,
} from "./readings";

export function formatRestrictedBanReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  if (reason === "sperrfrist") return "restricted period";
  if (reason === "frost") return "ground frost";
  return reason;
}

export function detectedIds(payload: CompanionModsPayload | null | undefined): Set<string> {
  const set = new Set<string>();
  for (const row of detectedCompanionMods(payload)) {
    if (row.id) set.add(row.id);
  }
  return set;
}

export function companionsInCategories(
  payload: CompanionModsPayload | null | undefined,
  categories: string[],
): CompanionModRow[] {
  const want = new Set(categories);
  return detectedCompanionMods(payload).filter((m) => {
    if (m.category && want.has(m.category)) return true;
    // Fall back to catalog category if row omitted it
    return false;
  });
}

export type RestrictedWindow = { currentAllowed?: boolean; nextCalendarPeriod?: number; nextUnconditionalPeriod?: number; temperatureConditional?: boolean; reason?: string };
