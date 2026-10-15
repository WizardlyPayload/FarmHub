/** Weather chip / forecast helpers — mirrors legacy environment.js. */

export type WeatherConditionKey =
  | "sunny"
  | "cloudy"
  | "rainy"
  | "snow"
  | "foggy"
  | "hail"
  | "unknown";

export interface WeatherForecastDay {
  weatherType?: string;
  minTemperature?: number;
  maxTemperature?: number;
  precipitationChance?: number;
  [key: string]: unknown;
}

export interface WeatherSnapshot {
  currentTemperature?: number;
  currentWeather?: string;
  windSpeed?: number;
  cloudCoverage?: number;
  rainLevel?: number;
  forecast?: WeatherForecastDay[];
  [key: string]: unknown;
}

export function asWeatherSnapshot(raw: unknown): WeatherSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as WeatherSnapshot;
}

export function formatWeatherTemp(celsius: unknown, profile?: { effective?: { fahrenheit?: boolean } } | null): string {
  const n = Number(celsius);
  if (!Number.isFinite(n)) return "—";
  if (profile?.effective?.fahrenheit === true) return `${Math.round((n * 9) / 5 + 32)}°F`;
  return `${Math.round(n)}°C`;
}

export function formatForecastTempRange(
  day: WeatherForecastDay | null | undefined,
  _fallbackCelsius?: unknown,
  profile?: { effective?: { fahrenheit?: boolean } } | null,
): string {
  const min = Number(day?.minTemperature);
  const max = Number(day?.maxTemperature);
  if (Number.isFinite(min) && Number.isFinite(max)) {
    return `${formatWeatherTemp(min, profile).replace("°C", "°").replace("°F", "°")} - ${formatWeatherTemp(max, profile)}`;
  }
  if (Number.isFinite(min)) return formatWeatherTemp(min, profile);
  if (Number.isFinite(max)) return formatWeatherTemp(max, profile);
  return "—";
}

/** Weather Guard day card: prefer engine daily high/low; never invent a ±5 band. */
export function formatWeatherGuardDayTemp(day: {
  temperature?: number | null;
  minTemperature?: number | null;
  maxTemperature?: number | null;
} | null | undefined, profile?: { effective?: { fahrenheit?: boolean } } | null): string {
  const min = Number(day?.minTemperature);
  const max = Number(day?.maxTemperature);
  if (Number.isFinite(min) && Number.isFinite(max)) {
    return `${formatWeatherTemp(min, profile)} - ${formatWeatherTemp(max, profile)}`;
  }
  if (Number.isFinite(min)) return formatWeatherTemp(min, profile);
  if (Number.isFinite(max)) return formatWeatherTemp(max, profile);
  return formatWeatherTemp(day?.temperature, profile);
}

export function normalizeWeatherCondition(weatherType: unknown): WeatherConditionKey {
  const type = String(weatherType ?? "")
    .trim()
    .toLowerCase()
    .replace(/^weathertype\./i, "")
    .replace(/\s+/g, "_");
  if (!type || type === "unknown") return "unknown";
  if (type === "sun" || type === "sunny" || type === "clear") return "sunny";
  if (
    type === "cloudy" ||
    type === "overcast" ||
    type === "partially_cloudy" ||
    type === "partiallycloudy"
  ) {
    return "cloudy";
  }
  if (type === "rain" || type === "rainy" || type === "thunder") return "rainy";
  if (type === "snow" || type === "snowy") return "snow";
  if (type === "fog" || type === "foggy") return "foggy";
  if (type === "hail") return "hail";
  return "unknown";
}

export function weatherConditionLabelKey(condition: WeatherConditionKey): string {
  switch (condition) {
    case "sunny":
      return "weather.conditionSunny";
    case "cloudy":
      return "weather.conditionCloudy";
    case "rainy":
      return "weather.conditionRainy";
    case "snow":
      return "weather.conditionSnow";
    case "foggy":
      return "weather.conditionFoggy";
    case "hail":
      return "weather.conditionHail";
    default:
      return "weather.conditionUnknown";
  }
}

export function weatherHasCurrent(weather: WeatherSnapshot | null | undefined): boolean {
  if (!weather) return false;
  const temp = weather.currentTemperature;
  if (temp !== undefined && temp !== null && Number.isFinite(Number(temp))) return true;
  const w = weather.currentWeather;
  return w !== undefined && w !== null && String(w).trim() !== "";
}

/**
 * Current-sky chip: always the merged engine `weather` block.
 * Weather Guard is companion telemetry and must not replace this.
 */
export function engineWeatherChip(weather: WeatherSnapshot | null | undefined): {
  show: boolean;
  temperature: unknown;
  condition: WeatherConditionKey;
} {
  return {
    show: weatherHasCurrent(weather),
    temperature: weather?.currentTemperature,
    condition: normalizeWeatherCondition(weather?.currentWeather),
  };
}
