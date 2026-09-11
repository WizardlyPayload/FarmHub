/** FS25_Vehicle_Years helpers for merged vehicle rows. */

import { t } from "@/i18n/i18n";

export interface VehicleYearsData {
  enabled?: boolean;
  modelYear?: number | null;
  decadeId?: string | null;
  decadeLabel?: string | null;
  yearKnown?: boolean;
  reliability?: number | null;
  maintainability?: number | null;
  storeName?: string | null;
}

export interface VehicleYearsVehicle {
  vehicleYears?: VehicleYearsData | null;
  ads?: {
    year?: number | null;
    reliability?: number | null;
    maintainability?: number | null;
  } | null;
}

export function vehicleHasYears(vehicle: VehicleYearsVehicle | null | undefined): boolean {
  return Boolean(vehicle?.vehicleYears?.enabled);
}

/** Model year from Vehicle Years export, or ADS spec when present. */
export function getVehicleModelYear(
  vehicle: {
    vehicleYears?: VehicleYearsData | null;
    ads?: { year?: number | null } | null;
  } | null | undefined
): number | null {
  const vy = Number(vehicle?.vehicleYears?.modelYear);
  if (vehicleHasYears(vehicle) && Number.isFinite(vy)) return vy;
  const adsYear = Number(vehicle?.ads?.year);
  if (Number.isFinite(adsYear)) return adsYear;
  return null;
}

export function getVehicleDecadeId(
  vehicle: {
    vehicleYears?: VehicleYearsData | null;
    ads?: { year?: number | null } | null;
  } | null | undefined
): string | null {
  if (vehicle?.vehicleYears?.decadeId) return String(vehicle.vehicleYears.decadeId);
  const year = getVehicleModelYear(vehicle);
  if (!Number.isFinite(year) || year == null) return null;
  if (year < 1950) return "pre1950";
  if (year < 1960) return "1950s";
  if (year < 1970) return "1960s";
  if (year < 1980) return "1970s";
  if (year < 1990) return "1980s";
  if (year < 2000) return "1990s";
  if (year < 2010) return "2000s";
  if (year < 2020) return "2010s";
  if (year < 2030) return "2020s";
  return "2030s";
}

export function getVehicleDecadeLabel(
  vehicle: {
    vehicleYears?: VehicleYearsData | null;
    ads?: { year?: number | null } | null;
  } | null | undefined
): string {
  if (vehicle?.vehicleYears?.decadeLabel) return String(vehicle.vehicleYears.decadeLabel);
  const id = getVehicleDecadeId(vehicle);
  if (!id) return "";
  if (id === "pre1950") return "< 1950";
  return id;
}

export function isVehicleYearUnknown(
  vehicle: { vehicleYears?: VehicleYearsData | null } | null | undefined
): boolean {
  return vehicleHasYears(vehicle) && !vehicle?.vehicleYears?.yearKnown;
}

export function getVehicleReliability(
  vehicle: {
    vehicleYears?: VehicleYearsData | null;
    ads?: { reliability?: number | null } | null;
  } | null | undefined
): number | null {
  const vy = Number(vehicle?.vehicleYears?.reliability);
  if (Number.isFinite(vy)) return vy;
  const ads = Number(vehicle?.ads?.reliability);
  return Number.isFinite(ads) ? ads : null;
}

export function getVehicleMaintainability(
  vehicle: {
    vehicleYears?: VehicleYearsData | null;
    ads?: { maintainability?: number | null } | null;
  } | null | undefined
): number | null {
  const vy = Number(vehicle?.vehicleYears?.maintainability);
  if (Number.isFinite(vy)) return vy;
  const ads = Number(vehicle?.ads?.maintainability);
  return Number.isFinite(ads) ? ads : null;
}

export function formatReliabilityPercent(value: number | null | undefined): string {
  if (!Number.isFinite(value as number)) return "—";
  return `${Math.round((value as number) * 100)}%`;
}

export function summarizeVehicleYearsFleet(vehicles: VehicleYearsVehicle[] | null | undefined) {
  const list = Array.isArray(vehicles) ? vehicles : [];
  const summary = {
    enabled: false,
    knownCount: 0,
    missingCount: 0,
    averageModelYear: null as number | null,
    pre2000Count: 0,
    byDecade: {} as Record<string, number>,
  };
  let yearSum = 0;
  for (const v of list) {
    if (!vehicleHasYears(v)) continue;
    summary.enabled = true;
    const year = getVehicleModelYear(v);
    if (Number.isFinite(year) && year != null) {
      summary.knownCount += 1;
      yearSum += year;
      if (year < 2000) summary.pre2000Count += 1;
      const decade = getVehicleDecadeId(v) || "unknown";
      summary.byDecade[decade] = (summary.byDecade[decade] || 0) + 1;
    } else {
      summary.missingCount += 1;
    }
  }
  if (summary.knownCount > 0) {
    summary.averageModelYear = Math.round(yearSum / summary.knownCount);
  }
  return summary;
}

export const VEHICLE_DECADE_FILTER_OPTIONS = [
  "pre1950",
  "1950s",
  "1960s",
  "1970s",
  "1980s",
  "1990s",
  "2000s",
  "2010s",
  "2020s",
  "2030s",
] as const;

const DECADE_I18N: Record<string, string> = {
  pre1950: "vehicles.decadePre1950",
  "1950s": "vehicles.decade1950s",
  "1960s": "vehicles.decade1960s",
  "1970s": "vehicles.decade1970s",
  "1980s": "vehicles.decade1980s",
  "1990s": "vehicles.decade1990s",
  "2000s": "vehicles.decade2000s",
  "2010s": "vehicles.decade2010s",
  "2020s": "vehicles.decade2020s",
  "2030s": "vehicles.decade2030s",
  unknown: "vehicles.decadeUnknown",
};

export function getDecadeFilterLabel(decadeId: string | null | undefined): string {
  if (!decadeId) return "";
  const key = DECADE_I18N[decadeId];
  return key ? t(key) : decadeId;
}

export function vehicleMatchesDecadeFilter(
  vehicle: VehicleYearsVehicle | null | undefined,
  decadeId: string
): boolean {
  if (!decadeId) return true;
  if (decadeId === "unknown") return isVehicleYearUnknown(vehicle);
  return getVehicleDecadeId(vehicle) === decadeId;
}

export function vehicleMatchesPre2000Filter(
  vehicle: VehicleYearsVehicle | null | undefined
): boolean {
  const year = getVehicleModelYear(vehicle);
  return Number.isFinite(year) && (year as number) < 2000;
}
