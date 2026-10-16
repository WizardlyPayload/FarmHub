import { t } from "@/i18n/i18n";

/**
 * Save Unit Profiles 1.2.0.2 display.
 * Flat profile fields are the configured save profile. Screen formatting uses
 * only `effective` values read from the live game settings. A selected profile
 * name is not treated as proof that those settings are on screen.
 * Amounts are not converted between currencies.
 */

export interface ProfileMoneyUnit {
  name: string;
  symbol: string;
  prefix: boolean;
}

/** MONEY_UNITS from scripts/SU_Core.lua lines 29-46. */
export const PROFILE_MONEY_UNITS: Record<number, ProfileMoneyUnit> = {
  1: { name: "Euro", symbol: "€", prefix: false },
  2: { name: "Dollar", symbol: "$", prefix: true },
  3: { name: "Pounds", symbol: "£", prefix: true },
  4: { name: "Brazilian Real", symbol: "R$", prefix: true },
  5: { name: "Chinese Yuan", symbol: "CN¥", prefix: true },
  6: { name: "Czech Koruna", symbol: "Kč", prefix: false },
  7: { name: "Hungarian Forint", symbol: "Ft", prefix: false },
  8: { name: "Japanese Yen", symbol: "¥", prefix: true },
  9: { name: "Norwegian Krone", symbol: "kr", prefix: false },
  10: { name: "Polish Złoty", symbol: "zł", prefix: false },
  11: { name: "Romanian Leu", symbol: "lei", prefix: false },
  12: { name: "Russian Ruble", symbol: "руб", prefix: false },
  13: { name: "South Korean Won", symbol: "₩", prefix: true },
  14: { name: "Swiss Franc", symbol: "CHF", prefix: true },
  15: { name: "Turkish Lira", symbol: "TL", prefix: true },
  16: { name: "Ukrainian Hryvnia", symbol: "грн", prefix: false },
};

const HA_TO_ACRES = 2.471053814671653;
const KMH_TO_MPH = 0.621371192;

export interface EffectiveProfile {
  money?: number;
  miles?: boolean;
  fahrenheit?: boolean;
  acre?: boolean;
  use24HourTime?: boolean;
}

export interface SaveProfileDisplay {
  applyState?: "effective" | "partial" | "pending" | "unavailable";
  effective?: EffectiveProfile;
}

export function saveProfileFromUnitDisplay(unitDisplay: { saveUnitProfiles?: SaveProfileDisplay | null } | null | undefined): SaveProfileDisplay | null {
  const profile = unitDisplay?.saveUnitProfiles;
  if (!profile || typeof profile !== "object") return null;
  return profile;
}

/** Unit prices keep four decimal places. A positive price that would round to 0.0000 stays visible as <0.0001. */
export const UNIT_PRICE_DECIMALS = 4;

/** Apply a currency glyph only when the live game reported a recognized money unit. */
export function formatProfileMoneyText(text: string, profile?: SaveProfileDisplay | null): string {
  const money = profile?.effective?.money;
  if (typeof money !== "number" || !Number.isFinite(money)) return text;
  const unit = PROFILE_MONEY_UNITS[money];
  if (!unit) return `${text} ${t("profile.unitUnavailable")}`;
  return unit.prefix ? `${unit.symbol}${text}` : `${text} ${unit.symbol}`;
}

function aggregateAmount(amount: number): string {
  return Math.trunc(amount).toLocaleString();
}

function unitAmount(amount: number): string {
  if (amount > 0) {
    const rounded = Number(amount.toFixed(UNIT_PRICE_DECIMALS));
    if (rounded === 0) return `<${(1 / 10 ** UNIT_PRICE_DECIMALS).toFixed(UNIT_PRICE_DECIMALS)}`;
    return rounded.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: UNIT_PRICE_DECIMALS,
    });
  }
  if (amount < 0) {
    return Number(amount.toFixed(UNIT_PRICE_DECIMALS)).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: UNIT_PRICE_DECIMALS,
    });
  }
  return (0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Whole currency amounts truncate toward zero without rounding exported decimals up. */
export function formatProfileMoney(amount: number, profile?: SaveProfileDisplay | null): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return formatProfileMoneyText(aggregateAmount(n), profile);
}

/** Per-unit quotes. Same currency resolver as balances, with fractional precision. */
export function formatProfileUnitPrice(amount: number, profile?: SaveProfileDisplay | null): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return formatProfileMoneyText(unitAmount(n), profile);
}

/** Hectares are the exported area. Acres are shown only when the live acre flag is true. */
export function formatProfileArea(hectares: number, profile?: SaveProfileDisplay | null): string {
  const ha = Number(hectares);
  if (!Number.isFinite(ha)) return "—";
  if (profile?.effective?.acre === true) {
    return `${(ha * HA_TO_ACRES).toFixed(2)} ac`;
  }
  return `${ha.toFixed(2)} ha`;
}

/** Celsius is the exported temperature. Fahrenheit is shown only when that live flag is true. */
export function formatProfileTemperature(celsius: number, profile?: SaveProfileDisplay | null): string {
  const c = Number(celsius);
  if (!Number.isFinite(c)) return "—";
  if (profile?.effective?.fahrenheit === true) {
    return `${Math.round((c * 9) / 5 + 32)}°F`;
  }
  return `${Math.round(c)}°C`;
}

/** Kilometres per hour are the exported speed. Miles per hour need the live miles flag. */
export function formatProfileSpeed(kmh: number, profile?: SaveProfileDisplay | null): string {
  const speed = Number(kmh);
  if (!Number.isFinite(speed)) return "—";
  if (profile?.effective?.miles === true) {
    return `${Math.round(speed * KMH_TO_MPH)} mph`;
  }
  return `${Math.round(speed)} km/h`;
}

/** 24-hour is the dashboard clock. 12-hour is used only when the live flag is false. */
export function formatProfileClock(totalMinutes: number, profile?: SaveProfileDisplay | null): string {
  const minutes = Number(totalMinutes);
  if (!Number.isFinite(minutes)) return "—";
  const wrapped = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  if (profile?.effective?.use24HourTime === false) {
    const suffix = hours >= 12 ? "PM" : "AM";
    const hour12 = hours % 12 || 12;
    return `${hour12}:${String(mins).padStart(2, "0")} ${suffix}`;
  }
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}
