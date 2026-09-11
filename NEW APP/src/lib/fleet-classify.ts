/** Farm-scope fleet vs storage classification. No @/ imports so Node tests can load this file. */

export interface VehicleBrandObject {
  title?: string;
  name?: string;
  label?: string;
  displayName?: string;
  image?: string;
}

export interface ClassifiableVehicle {
  id?: string | number;
  name?: string;
  typeName?: string;
  vehicleType?: string;
  brand?: string | VehicleBrandObject | null;
  ownerFarmId?: number | string | null;
  farmId?: number | string | null;
  ownerFarmIdPool?: boolean;
  propertyState?: string | null;
  isUsedEquipmentYardStock?: boolean;
  filename?: string | null;
}

const STORAGE_TYPE_NAMES = new Set(["pallet", "bigbag", "bigbagpallet", "bigbagpallets", "ibc"]);

export function normalizeClassifiableList<T extends ClassifiableVehicle = ClassifiableVehicle>(
  raw: unknown
): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object") return Object.values(raw) as T[];
  return [];
}

export function vehicleMatchesActiveFarm(
  v: ClassifiableVehicle | null | undefined,
  activeFarmId: number | string | null | undefined
): boolean {
  const vf = Number(v?.ownerFarmId ?? v?.farmId ?? 0);
  const af = Number(activeFarmId ?? 1);
  return Number.isFinite(vf) && Number.isFinite(af) && vf === af;
}

export function resolveVehicleBrandLabel(brand: ClassifiableVehicle["brand"]): string {
  if (brand == null || brand === "") return "";
  if (typeof brand === "object") {
    return String(
      brand.title || brand.name || brand.label || brand.displayName || ""
    ).trim();
  }
  return String(brand).trim();
}

export function isUsedEquipmentYardStock(vehicle: ClassifiableVehicle | null | undefined): boolean {
  if (!vehicle || typeof vehicle !== "object") return false;
  return vehicle.isUsedEquipmentYardStock === true;
}

export function isDealershipOrPoolStock(vehicle: ClassifiableVehicle | null | undefined): boolean {
  if (!vehicle || typeof vehicle !== "object") return false;
  if (isUsedEquipmentYardStock(vehicle)) return true;
  const prop = String(vehicle.propertyState || "").toUpperCase();
  if (prop === "SHOP_CONFIG" || prop === "SOLD") return true;
  if (vehicle.ownerFarmIdPool === true) return true;
  const fid = Number(vehicle.ownerFarmId ?? vehicle.farmId ?? 0);
  if (fid === 100) return true;
  return false;
}

function vehicleIdentityBlob(vehicle: ClassifiableVehicle): string {
  const brandLabel = resolveVehicleBrandLabel(vehicle.brand);
  return [vehicle.typeName, vehicle.name, vehicle.filename, vehicle.vehicleType, brandLabel]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase())
    .join(" ");
}

/** Pallet forks and bale/pallet trailers are equipment, not loose consumables. */
export function isPalletHandlingEquipment(vehicle: ClassifiableVehicle | null | undefined): boolean {
  if (!vehicle || typeof vehicle !== "object") return false;
  const blob = vehicleIdentityBlob(vehicle);
  if (!blob.trim()) return false;
  return (
    /pallet\s*fork|palletfork/i.test(blob) ||
    /pallet\s*trailer/i.test(blob) ||
    /bale\s+and\s+pallet/i.test(blob)
  );
}

export function hasKnownVehicleOwner(vehicle: ClassifiableVehicle | null | undefined): boolean {
  const vf = Number(vehicle?.ownerFarmId ?? vehicle?.farmId);
  return Number.isFinite(vf) && vf > 0;
}

export type FleetPlacement = "fleet" | "storage" | "dealer" | "otherFarm" | "unresolved";

export interface FleetClassification<T extends ClassifiableVehicle = ClassifiableVehicle> {
  fleet: T[];
  storage: T[];
  dealer: T[];
  otherFarm: T[];
  unresolved: T[];
}

/**
 * Place each entity in exactly one bucket. Do not infer owner from farm totals.
 * Dealer/pool is classified before storage so shop-floor pallets are not farm stock.
 */
export function classifyVehiclePlacement(
  vehicle: ClassifiableVehicle | null | undefined,
  activeFarmId: number | string | null | undefined
): FleetPlacement {
  if (!vehicle || typeof vehicle !== "object") return "unresolved";
  if (isDealershipOrPoolStock(vehicle)) return "dealer";
  if (!hasKnownVehicleOwner(vehicle)) return "unresolved";
  if (!vehicleMatchesActiveFarm(vehicle, activeFarmId)) return "otherFarm";
  if (isStorageItem(vehicle)) return "storage";
  return "fleet";
}

export function classifyFleetEntities<T extends ClassifiableVehicle = ClassifiableVehicle>(
  vehicles: unknown,
  activeFarmId: number | string | null | undefined
): FleetClassification<T> {
  const out: FleetClassification<T> = {
    fleet: [],
    storage: [],
    dealer: [],
    otherFarm: [],
    unresolved: [],
  };
  for (const vehicle of normalizeClassifiableList<T>(vehicles)) {
    out[classifyVehiclePlacement(vehicle, activeFarmId)].push(vehicle);
  }
  return out;
}

/** Pallets, big bags, and liquid bulk containers (IBCs). */
export function isStorageItem(vehicle: ClassifiableVehicle | null | undefined): boolean {
  if (!vehicle || typeof vehicle !== "object") return false;
  if (isPalletHandlingEquipment(vehicle)) return false;

  const typeKey = String(vehicle.typeName || "")
    .toLowerCase()
    .replace(/\s+/g, "");
  if (STORAGE_TYPE_NAMES.has(typeKey)) return true;

  const blob = vehicleIdentityBlob(vehicle);
  if (!blob.trim()) return false;

  if (blob.includes("bigbag") || blob.includes("big_bag") || /\bbig\s+bag\b/.test(blob)) {
    return true;
  }

  if (
    /\bibc\b/.test(blob) ||
    blob.includes("liquidtank") ||
    blob.includes("liquid_tank") ||
    blob.includes("bulkliquid")
  ) {
    return true;
  }

  if (blob.includes("pallet") || blob.includes("palette") || blob.includes("pallete")) {
    return true;
  }

  return false;
}

/** Fleet rows for the active farm (excludes storage, yard, dealership/pool). */
export function getDisplayFleet<T extends ClassifiableVehicle = ClassifiableVehicle>(
  vehicles: unknown,
  activeFarmId: number | string | null | undefined
): T[] {
  return classifyFleetEntities<T>(vehicles, activeFarmId).fleet;
}
