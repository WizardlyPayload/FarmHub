/** Vehicle list helpers — farm scope, storage/yard filtering, shop images, fuel. */

import {
  getVehicleConditionFraction,
  getVehicleDamageFraction,
  isVehicleAdsOverdue,
  isVehicleHighWear,
  isVehicleInNeedOfRepair,
  hasVisibleAdsBreakdowns,
  countActiveAdsBreakdowns,
  type AdsVehicle,
} from "@/lib/vehicleAds";
import {
  getVehicleDecadeId,
  getVehicleModelYear,
  isVehicleYearUnknown,
  vehicleHasYears,
  vehicleMatchesDecadeFilter,
  vehicleMatchesPre2000Filter,
  type VehicleYearsVehicle,
} from "@/lib/vehicleYears";
import type { VehicleMileageData } from "@/lib/vehicleMileage";
import {
  classifyFleetEntities as classifyFleetEntitiesBase,
  classifyVehiclePlacement,
  getDisplayFleet as getDisplayFleetBase,
  hasKnownVehicleOwner,
  isDealershipOrPoolStock,
  isPalletHandlingEquipment,
  isStorageItem,
  isUsedEquipmentYardStock,
  normalizeClassifiableList,
  resolveVehicleBrandLabel,
  vehicleMatchesActiveFarm,
  type FleetClassification,
  type FleetPlacement,
  type VehicleBrandObject,
} from "./fleet-classify";

export {
  classifyVehiclePlacement,
  hasKnownVehicleOwner,
  isDealershipOrPoolStock,
  isPalletHandlingEquipment,
  isStorageItem,
  isUsedEquipmentYardStock,
  resolveVehicleBrandLabel,
  vehicleMatchesActiveFarm,
};

export type { FleetClassification, FleetPlacement, VehicleBrandObject };

export interface VehicleFillLevel {
  level?: number;
  capacity?: number;
}

export interface FleetVehicle extends AdsVehicle {
  id?: string | number;
  name?: string;
  typeName?: string;
  vehicleType?: string;
  categoryName?: string;
  /** CSS degrees for an up-pointing map icon; 0 = north. */
  headingDeg?: number | null;
  brand?: string | VehicleBrandObject | null;
  ownerFarmId?: number | string | null;
  farmId?: number | string | null;
  ownerFarmIdPool?: boolean;
  propertyState?: string | null;
  isUsedEquipmentYardStock?: boolean;
  isMotorized?: boolean;
  engineOn?: boolean;
  speed?: number;
  fuelLevel?: number;
  fuelCapacity?: number;
  fillLevels?: Record<string, VehicleFillLevel>;
  operatingTime?: number;
  position?: { x?: number; z?: number } | null;
  attachedImplementsCount?: number;
  storeImage?: string | null;
  storeName?: string | null;
  configFileName?: string | null;
  filename?: string | null;
  vehicleYears?: VehicleYearsVehicle["vehicleYears"];
  /** FS25_VehicleMileage nest from Lua (`odoKm` / `tripKm`). */
  mileage?: VehicleMileageData | null;
}

const SKIP_FUEL_TYPES = new Set(["highPressureWasher", "High Pressure Washer"]);

/** Lua empty tables and some API paths may yield `{}` instead of `[]`. */
export function normalizeVehicleList(raw: unknown): FleetVehicle[] {
  return normalizeClassifiableList<FleetVehicle>(raw);
}

export function resolveVehicleDisplayName(vehicle: FleetVehicle | null | undefined): string {
  if (!vehicle || typeof vehicle !== "object") return "—";
  const n = String(vehicle.name ?? "").trim();
  if (n) return n;
  const tn = String(vehicle.typeName ?? "").trim();
  if (tn) return tn;
  return "—";
}

export function classifyFleetEntities(
  vehicles: unknown,
  activeFarmId: number | string | null | undefined
): FleetClassification<FleetVehicle> {
  return classifyFleetEntitiesBase<FleetVehicle>(vehicles, activeFarmId);
}

export function getDisplayFleet(
  vehicles: unknown,
  activeFarmId: number | string | null | undefined
): FleetVehicle[] {
  return getDisplayFleetBase<FleetVehicle>(vehicles, activeFarmId);
}

export function getVehicleFuelPercentage(vehicle: FleetVehicle | null | undefined): number | null {
  if (!vehicle) return null;
  if (!vehicle.isMotorized || SKIP_FUEL_TYPES.has(String(vehicle.typeName || ""))) return null;

  if (Number(vehicle.fuelCapacity) > 0 && Number(vehicle.fuelLevel) >= 0) {
    return (Number(vehicle.fuelLevel) / Number(vehicle.fuelCapacity)) * 100;
  }
  const diesel = vehicle.fillLevels?.DIESEL;
  if (diesel && Number(diesel.capacity) > 0) {
    return (Number(diesel.level) / Number(diesel.capacity)) * 100;
  }
  if (vehicle.isMotorized) return 0;
  return null;
}

export function shouldShowFuel(vehicle: FleetVehicle | null | undefined): boolean {
  if (!vehicle?.isMotorized) return false;
  return !SKIP_FUEL_TYPES.has(String(vehicle.typeName || ""));
}

export function formatOperatingTime(operatingTimeMs: number | null | undefined): string {
  if (!operatingTimeMs || operatingTimeMs === 0) return "0h";
  const hours = Math.round(operatingTimeMs / (1000 * 60 * 60));
  if (hours < 1) return "0h";
  if (hours < 24) return `${hours}h`;
  if (hours < 8760) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
  const years = Math.floor(hours / 8760);
  const remainingHours = hours % 8760;
  const days = Math.floor(remainingHours / 24);
  return days > 0 ? `${years}y ${days}d` : `${years}y`;
}

export function getFuelBarTone(percentage: number): "accent" | "warn" | "danger" {
  if (percentage > 75) return "accent";
  if (percentage > 25) return "warn";
  return "danger";
}

export function getDamageBarTone(damagePercentage: number): "accent" | "warn" | "danger" {
  if (damagePercentage > 50) return "danger";
  if (damagePercentage > 20) return "warn";
  return "accent";
}

export type VehicleSummaryFilter =
  | "all"
  | "low-fuel"
  | "damaged"
  | "needs-repair"
  | "overdue"
  | "breakdowns"
  | "pre-2000"
  | "unknown-year";

export interface VehicleFilterState {
  type: string;
  fuel: string;
  status: string;
  decade: string;
}

export function vehicleRowKey(vehicle: FleetVehicle | null | undefined): string {
  if (!vehicle) return "";
  return String(vehicle.id ?? `${vehicle.name}-${vehicle.ownerFarmId ?? vehicle.farmId}`);
}

export function vehicleMatchesDeepLinkId(
  vehicle: FleetVehicle | null | undefined,
  id: string | null | undefined
): boolean {
  if (!id || !vehicle) return false;
  const needle = String(id).trim();
  if (!needle) return false;
  if (String(vehicle.id) === needle) return true;
  if (String(vehicle.name) === needle) return true;
  return vehicleRowKey(vehicle) === needle;
}

/** Map `#/vehicles?role=tractor` (etc.) to dropdown filter state. */
export function resolveVehicleRoleFilter(role: string | null | undefined): Partial<VehicleFilterState> {
  const r = String(role || "")
    .trim()
    .toLowerCase();
  if (!r) return {};
  const roleMap: Record<string, Partial<VehicleFilterState>> = {
    tractor: { type: "tractor" },
    trailer: { type: "trailer" },
    implement: { type: "implement" },
    cultivator: { type: "cultivator" },
    motorized: { type: "motorized" },
    harvester: { type: "motorized" },
    telehandler: { type: "motorized" },
    loader: { type: "motorized" },
  };
  return roleMap[r] || {};
}

export function parseVehicleDeepLinkFilter(
  filter: string | null | undefined
): { summary: VehicleSummaryFilter | null; decade: string } {
  const raw = String(filter || "").trim();
  if (!raw) return { summary: null, decade: "" };
  if (raw.startsWith("decade:")) {
    return { summary: null, decade: raw.slice("decade:".length) };
  }
  const known: VehicleSummaryFilter[] = [
    "all",
    "low-fuel",
    "damaged",
    "needs-repair",
    "overdue",
    "breakdowns",
    "pre-2000",
    "unknown-year",
  ];
  if (known.includes(raw as VehicleSummaryFilter)) {
    return { summary: raw as VehicleSummaryFilter, decade: "" };
  }
  return { summary: null, decade: "" };
}

export function filterFleetVehicles(
  fleet: FleetVehicle[],
  filters: VehicleFilterState,
  summary?: VehicleSummaryFilter | null
): FleetVehicle[] {
  let list = [...fleet];

  if (summary === "low-fuel") {
    list = list.filter((v) => {
      const pct = getVehicleFuelPercentage(v);
      return pct != null && pct < 25;
    });
  } else if (summary === "damaged") {
    list = list.filter((v) => isVehicleHighWear(v));
  } else if (summary === "needs-repair") {
    list = list.filter((v) => isVehicleInNeedOfRepair(v));
  } else if (summary === "overdue") {
    list = list.filter((v) => isVehicleAdsOverdue(v));
  } else if (summary === "breakdowns") {
    list = list.filter(
      (v) => hasVisibleAdsBreakdowns(v) || countActiveAdsBreakdowns(v) > 0
    );
  } else if (summary === "pre-2000") {
    list = list.filter((v) => vehicleHasYears(v) && vehicleMatchesPre2000Filter(v));
  } else if (summary === "unknown-year") {
    list = list.filter((v) => isVehicleYearUnknown(v));
  }

  if (filters.decade) {
    list = list.filter((v) => vehicleMatchesDecadeFilter(v, filters.decade));
  }

  if (filters.type) {
    list = list.filter((v) => {
      const vehicleType = v.vehicleType || "unknown";
      if (vehicleType === filters.type) return true;
      if (filters.type === "tractor" && vehicleType === "motorized") {
        const brandName = resolveVehicleBrandLabel(v.brand);
        const typeName = v.typeName || "";
        return (
          typeName.toLowerCase().includes("tractor") ||
          brandName?.toLowerCase().includes("john deere") ||
          brandName?.toLowerCase().includes("johndeere") ||
          brandName?.toLowerCase().includes("mccormick")
        );
      }
      return false;
    });
  }

  if (filters.fuel) {
    list = list.filter((v) => {
      if (!shouldShowFuel(v)) return filters.fuel === "empty";
      if (Number(v.fuelCapacity) === 0) return filters.fuel === "empty";
      const fuelPercentage = getVehicleFuelPercentage(v) ?? 0;
      switch (filters.fuel) {
        case "empty":
          return fuelPercentage === 0;
        case "low":
          return fuelPercentage > 0 && fuelPercentage < 25;
        case "medium":
          return fuelPercentage >= 25 && fuelPercentage <= 75;
        case "full":
          return fuelPercentage > 75;
        default:
          return true;
      }
    });
  }

  if (filters.status) {
    list = list.filter((v) => {
      switch (filters.status) {
        case "active":
          return Boolean(v.engineOn) || Number(v.speed) > 0;
        case "inactive":
          return !v.engineOn && Number(v.speed || 0) === 0;
        case "damaged":
          return isVehicleHighWear(v);
        case "needs-repair":
          return isVehicleInNeedOfRepair(v);
        case "overdue":
          return isVehicleAdsOverdue(v);
        case "breakdown":
          return hasVisibleAdsBreakdowns(v) || countActiveAdsBreakdowns(v) > 0;
        default:
          return true;
      }
    });
  }

  return list;
}

export function summarizeFleetCards(fleet: FleetVehicle[]) {
  const totalCount = fleet.length;
  const lowFuelCount = fleet.filter((v) => {
    const pct = getVehicleFuelPercentage(v);
    return pct != null && pct < 25;
  }).length;
  const damagedCount = fleet.filter((v) => isVehicleHighWear(v)).length;
  const needsRepairCount = fleet.filter((v) => isVehicleInNeedOfRepair(v)).length;
  const overdueCount = fleet.filter((v) => isVehicleAdsOverdue(v)).length;
  const breakdownCount = fleet.filter(
    (v) => hasVisibleAdsBreakdowns(v) || countActiveAdsBreakdowns(v) > 0
  ).length;
  return {
    totalCount,
    lowFuelCount,
    damagedCount,
    needsRepairCount,
    overdueCount,
    breakdownCount,
  };
}

export function vehicleHasMapPosition(vehicle: FleetVehicle | null | undefined): boolean {
  const x = Number(vehicle?.position?.x);
  const z = Number(vehicle?.position?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (Math.abs(x) < 0.5 && Math.abs(z) < 0.5) return false;
  return true;
}

export function getVehicleYearLabel(vehicle: FleetVehicle | null | undefined): string {
  const year = getVehicleModelYear(vehicle);
  if (Number.isFinite(year)) return String(year);
  if (isVehicleYearUnknown(vehicle)) return "—";
  const decade = getVehicleDecadeId(vehicle);
  return decade || "—";
}

export { getVehicleConditionFraction, getVehicleDamageFraction };

/* ── Shop image index (exact store basename matching) ── */

let itemsImageFilenames: string[] = [];
let modExtractImageFilenames: string[] = [];
let storeImageIndex: Map<string, { curated: string[]; mod: string[] }> | null = null;
const vehicleImageMatchCache = new Map<string, string | null>();

function normalizeItemImageFilename(name: string): string {
  if (!name) return name;
  let s = String(name);
  s = s.replace(/%252B/gi, "+").replace(/%252b/gi, "+");
  s = s.replace(/%2B/gi, "+").replace(/%2b/gi, "+");
  s = s.replace(/%26/g, "&");
  return s;
}

/**
 * "<cat>__store_t7.png" / "FS25_x__icon_y.png" -> lowercased "store_t7" / "icon_y", else null.
 */
export function extractStoreLeafToken(filenameRaw: string | null | undefined): string | null {
  if (!filenameRaw) return null;
  const base = String(filenameRaw)
    .replace(/^.*[/\\]/, "")
    .replace(/\.png$/i, "");
  const sepIdx = base.lastIndexOf("__");
  const afterSep = sepIdx >= 0 ? base.slice(sepIdx + 2) : base;
  const token = afterSep.toLowerCase();
  return /^(store|icon)_.+/.test(token) ? token : null;
}

function buildStoreImageIndex() {
  const idx = new Map<string, { curated: string[]; mod: string[] }>();
  const add = (list: string[], folderPath: string, bucket: "curated" | "mod") => {
    for (const filenameRaw of list || []) {
      const token = extractStoreLeafToken(filenameRaw);
      if (!token) continue;
      let entry = idx.get(token);
      if (!entry) {
        entry = { curated: [], mod: [] };
        idx.set(token, entry);
      }
      entry[bucket].push(`${folderPath}${normalizeItemImageFilename(filenameRaw)}`);
    }
  };
  add(itemsImageFilenames, "/assests/img/items/", "curated");
  add(modExtractImageFilenames, "/assests/img/items_mod_extract/", "mod");
  storeImageIndex = idx;
  return idx;
}

function normalizeStoreImageHint(storeImage: string | null | undefined): string | null {
  if (!storeImage) return null;
  const leaf = String(storeImage)
    .replace(/^.*[/\\]/, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .trim()
    .toLowerCase();
  return leaf || null;
}

export function resolveStoreImageExact(storeImage: string | null | undefined): string | null {
  const token = normalizeStoreImageHint(storeImage);
  if (!token) return null;
  if (!storeImageIndex) buildStoreImageIndex();
  const entry = storeImageIndex!.get(token);
  if (!entry) return null;
  if (entry.curated.length === 1) return entry.curated[0];
  if (entry.curated.length === 0 && entry.mod.length === 1) return entry.mod[0];
  return null;
}

export function deriveStoreImageHint(vehicle: FleetVehicle | null | undefined): string | null {
  const direct = vehicle?.storeImage;
  if (direct != null && String(direct).trim() !== "") {
    return String(direct).trim();
  }
  const cfg = String(vehicle?.configFileName || vehicle?.filename || "")
    .replace(/\\/g, "/")
    .trim();
  const base = cfg.split("/").pop()?.replace(/\.xml$/i, "");
  if (!base) return null;

  const tokens = new Set([`store_${base.toLowerCase()}`]);
  const underscored = base.replace(/([a-z])([A-Z0-9])/g, "$1_$2").toLowerCase();
  tokens.add(`store_${underscored}`);
  tokens.add(`icon_${base.toLowerCase()}`);
  tokens.add(`icon_${underscored}`);

  for (const token of tokens) {
    if (resolveStoreImageExact(token)) return token;
  }
  return null;
}

export function primeItemImageFilenames(list: string[] | null | undefined) {
  itemsImageFilenames = Array.isArray(list) ? list : [];
  storeImageIndex = null;
  vehicleImageMatchCache.clear();
}

export function primeModExtractImageFilenames(list: string[] | null | undefined) {
  modExtractImageFilenames = Array.isArray(list) ? list : [];
  storeImageIndex = null;
  vehicleImageMatchCache.clear();
}

export function primeShopImageFilenames({
  items,
  modExtract,
}: {
  items?: string[];
  modExtract?: string[];
} = {}) {
  if (items !== undefined) primeItemImageFilenames(items);
  if (modExtract !== undefined) primeModExtractImageFilenames(modExtract);
}

export async function refreshShopImageFilenamesFromApi(): Promise<{
  items: string[];
  modExtract: string[];
} | null> {
  try {
    const r = await fetch("/api/item-image-filenames");
    const data = (await r.json()) as { items?: string[]; modExtract?: string[] };
    const nextItems = Array.isArray(data?.items) ? data.items : [];
    const nextMod = Array.isArray(data?.modExtract) ? data.modExtract : [];
    primeShopImageFilenames({ items: nextItems, modExtract: nextMod });
    return { items: nextItems, modExtract: nextMod };
  } catch {
    return null;
  }
}

export function getLocalVehicleImage(
  vehicleName: string,
  brandName: string,
  typeName: string,
  hints?: { storeImage?: string | null; storeName?: string | null }
): string | null {
  const skipImageTypes = ["bigbag", "pallet"];
  if (skipImageTypes.includes(typeName?.toLowerCase())) return null;

  const storeImageHint = hints?.storeImage ? String(hints.storeImage) : "";
  const cacheKey = `${vehicleName}\0${brandName}\0${typeName}\0${storeImageHint.toLowerCase()}`;
  if (vehicleImageMatchCache.has(cacheKey)) {
    return vehicleImageMatchCache.get(cacheKey) ?? null;
  }

  if (storeImageHint) {
    const exact = resolveStoreImageExact(storeImageHint);
    if (exact) {
      vehicleImageMatchCache.set(cacheKey, exact);
      return exact;
    }
  }

  // Lightweight fuzzy: scan filename tokens for name/brand substrings (curated first).
  const fuzzy = fuzzyMatchShopImage(vehicleName, brandName);
  vehicleImageMatchCache.set(cacheKey, fuzzy);
  return fuzzy;
}

function fuzzyMatchShopImage(vehicleName: string, brandName: string): string | null {
  const name = String(vehicleName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const brand = String(brandName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (name.length < 3) return null;

  const tryList = (list: string[], folder: string): string | null => {
    let best: string | null = null;
    let bestScore = 0;
    for (const raw of list) {
      const token = extractStoreLeafToken(raw) || String(raw).toLowerCase();
      const compact = token.replace(/[^a-z0-9]+/g, "");
      if (!compact.includes(name) && !(name.length >= 4 && compact.includes(name.slice(0, 6)))) {
        continue;
      }
      let score = name.length;
      if (brand && compact.includes(brand.slice(0, Math.min(6, brand.length)))) score += 5;
      if (score > bestScore) {
        bestScore = score;
        best = `${folder}${normalizeItemImageFilename(raw)}`;
      }
    }
    return bestScore >= 4 ? best : null;
  };

  return (
    tryList(itemsImageFilenames, "/assests/img/items/") ||
    tryList(modExtractImageFilenames, "/assests/img/items_mod_extract/")
  );
}

export interface VehicleDisplay {
  isImage: boolean;
  imageUrl?: string;
  displayText: string;
  background?: string;
  textColor?: string;
}

export function generateVehicleDisplay(
  vehicleName: string,
  brandName: string,
  typeName: string,
  hints?: { storeImage?: string | null; storeName?: string | null }
): VehicleDisplay {
  const localImage = getLocalVehicleImage(vehicleName, brandName, typeName, hints);
  if (localImage) {
    return { imageUrl: localImage, isImage: true, displayText: vehicleName };
  }

  const vehicleTypeColors: Record<string, { bg: string; text: string }> = {
    tractor: { bg: "#2E7D32", text: "#FFFFFF" },
    teleHandler: { bg: "#F57F17", text: "#FFFFFF" },
    trailer: { bg: "#5D4037", text: "#FFFFFF" },
    motorized: { bg: "#1976D2", text: "#FFFFFF" },
    harvester: { bg: "#F44336", text: "#FFFFFF" },
    implement: { bg: "#7B1FA2", text: "#FFFFFF" },
    cultivator: { bg: "#689F38", text: "#FFFFFF" },
    default: { bg: "#607D8B", text: "#FFFFFF" },
  };
  const colors = vehicleTypeColors[typeName] || vehicleTypeColors.default;
  let displayText = vehicleName;
  if (displayText.length > 15) {
    displayText =
      brandName && brandName !== "None" && brandName !== "NONE"
        ? brandName
        : `${displayText.substring(0, 12)}...`;
  }
  return {
    background: colors.bg,
    textColor: colors.text,
    displayText,
    isImage: false,
  };
}
