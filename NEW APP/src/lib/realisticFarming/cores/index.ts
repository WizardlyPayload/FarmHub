/** Cores agent — Weather Guard / Time Guard / presence helpers. */

import type { RealisticFarmingPayload, RealisticFarmingPresenceMod } from "@/types/dashboard";

export const CORES_DOMAIN = "cores" as const;

export type WeatherGuardPayload = NonNullable<RealisticFarmingPayload["weatherGuard"]>;
export type TimeGuardPayload = NonNullable<RealisticFarmingPayload["timeGuard"]>;
export type PresencePayload = NonNullable<RealisticFarmingPayload["presence"]>;

export function getWeatherGuard(rf: RealisticFarmingPayload | null | undefined): WeatherGuardPayload | null {
  const block = rf?.weatherGuard;
  if (!block || block.enabled !== true) return null;
  return block;
}

export function getTimeGuard(rf: RealisticFarmingPayload | null | undefined): TimeGuardPayload | null {
  const block = rf?.timeGuard;
  if (!block || block.enabled !== true) return null;
  return block;
}

export function getPresence(rf: RealisticFarmingPayload | null | undefined): PresencePayload | null {
  const block = rf?.presence;
  if (!block || typeof block !== "object") return null;
  return block;
}

export function detectedPresenceMods(
  rf: RealisticFarmingPayload | null | undefined,
): RealisticFarmingPresenceMod[] {
  const presence = getPresence(rf);
  if (!presence?.mods?.length) return [];
  return presence.mods.filter((m) => m.detected);
}

/** Compact calendar label for top bar / overview (period = month 1–12). */
export function formatTimeGuardBadge(tg: TimeGuardPayload | null | undefined): string | null {
  if (!tg || tg.enabled !== true) return null;
  const period = tg.period != null ? Number(tg.period) : null;
  const year = tg.year != null ? Number(tg.year) : null;
  const dayInPeriod = tg.dayInPeriod != null ? Number(tg.dayInPeriod) : null;
  const daysPerPeriod = tg.daysPerPeriod != null ? Number(tg.daysPerPeriod) : null;

  if (period != null && year != null && dayInPeriod != null && daysPerPeriod != null) {
    return `Y${year} · M${period} · D${dayInPeriod}/${daysPerPeriod}`;
  }
  if (period != null && year != null) {
    return `Y${year} · M${period}`;
  }
  if (tg.monotonicDay != null) {
    return `Day ${tg.monotonicDay}`;
  }
  return null;
}

/** Companion sky label only — never a substitute for engine currentWeather. */
export function weatherGuardSkyLabel(wg: WeatherGuardPayload | null | undefined): string | null {
  const sky = wg?.sky;
  if (!sky) return null;
  if (sky.weatherType) return String(sky.weatherType);
  if (sky.isRaining) return "rain";
  return null;
}

export function weatherGuardTemp(wg: WeatherGuardPayload | null | undefined): number | null {
  const t = wg?.sky?.temperature;
  return t != null && Number.isFinite(Number(t)) ? Number(t) : null;
}
