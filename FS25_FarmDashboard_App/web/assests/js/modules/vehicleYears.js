// FS25 FarmDashboard | vehicleYears.js — FS25_Vehicle_Years helpers for merged vehicle rows

export function vehicleHasYears(vehicle) {
  return Boolean(vehicle?.vehicleYears?.enabled);
}

/** Model year from Vehicle Years export, or ADS spec when present. */
export function getVehicleModelYear(vehicle) {
  const vy = Number(vehicle?.vehicleYears?.modelYear);
  if (vehicleHasYears(vehicle) && Number.isFinite(vy)) return vy;
  const adsYear = Number(vehicle?.ads?.year);
  if (Number.isFinite(adsYear)) return adsYear;
  return null;
}

export function getVehicleDecadeId(vehicle) {
  if (vehicle?.vehicleYears?.decadeId) return String(vehicle.vehicleYears.decadeId);
  const year = getVehicleModelYear(vehicle);
  if (!Number.isFinite(year)) return null;
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

export function getVehicleDecadeLabel(vehicle) {
  if (vehicle?.vehicleYears?.decadeLabel) return String(vehicle.vehicleYears.decadeLabel);
  const id = getVehicleDecadeId(vehicle);
  if (!id) return "";
  if (id === "pre1950") return "< 1950";
  return id;
}

export function isVehicleYearUnknown(vehicle) {
  return vehicleHasYears(vehicle) && !vehicle?.vehicleYears?.yearKnown;
}

export function getVehicleReliability(vehicle) {
  const vy = Number(vehicle?.vehicleYears?.reliability);
  if (Number.isFinite(vy)) return vy;
  const ads = Number(vehicle?.ads?.reliability);
  return Number.isFinite(ads) ? ads : null;
}

export function getVehicleMaintainability(vehicle) {
  const vy = Number(vehicle?.vehicleYears?.maintainability);
  if (Number.isFinite(vy)) return vy;
  const ads = Number(vehicle?.ads?.maintainability);
  return Number.isFinite(ads) ? ads : null;
}

export function formatReliabilityPercent(value) {
  if (!Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

export function summarizeVehicleYearsFleet(vehicles) {
  const list = Array.isArray(vehicles) ? vehicles : [];
  const summary = {
    enabled: false,
    knownCount: 0,
    missingCount: 0,
    averageModelYear: null,
    pre2000Count: 0,
    byDecade: {},
  };
  let yearSum = 0;
  for (const v of list) {
    if (!vehicleHasYears(v)) continue;
    summary.enabled = true;
    const year = getVehicleModelYear(v);
    if (Number.isFinite(year)) {
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
];
