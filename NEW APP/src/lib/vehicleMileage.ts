/** FS25_VehicleMileage helpers for merged vehicle rows (`mileage` nest). */

export interface VehicleMileageData {
  enabled?: boolean;
  /** Total odometer distance in kilometres. */
  odoKm?: number | null;
  /** Trip meter distance in kilometres. */
  tripKm?: number | null;
}

export interface MileageVehicle {
  mileage?: VehicleMileageData | null;
}

export function vehicleHasMileage(vehicle: MileageVehicle | null | undefined): boolean {
  return Boolean(vehicle?.mileage?.enabled);
}

/** True when any vehicle in the list has mileage data (for optional table column). */
export function fleetHasMileage(vehicles: MileageVehicle[] | null | undefined): boolean {
  if (!Array.isArray(vehicles) || vehicles.length === 0) return false;
  return vehicles.some((v) => vehicleHasMileage(v));
}

export function getVehicleOdoKm(vehicle: MileageVehicle | null | undefined): number | null {
  if (!vehicleHasMileage(vehicle)) return null;
  const n = Number(vehicle!.mileage!.odoKm);
  return Number.isFinite(n) ? n : null;
}

export function getVehicleTripKm(vehicle: MileageVehicle | null | undefined): number | null {
  if (!vehicleHasMileage(vehicle)) return null;
  const n = Number(vehicle!.mileage!.tripKm);
  return Number.isFinite(n) ? n : null;
}

/** Format kilometres for display (one decimal under 100, otherwise whole km). */
export function formatMileageKm(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(Number(km))) return "—";
  const n = Number(km);
  const abs = Math.abs(n);
  if (abs < 100) return n.toFixed(1);
  return String(Math.round(n));
}
