import { t, tOr } from "@/i18n/i18n";
import { Button } from "@/components/ui";
import { useFocusTrap } from "@/lib/use-focus-trap";
import {
  asWeatherSnapshot,
  formatForecastTempRange,
  formatWeatherGuardDayTemp,
  formatWeatherTemp,
  normalizeWeatherCondition,
  weatherConditionLabelKey,
  type WeatherSnapshot,
} from "@/lib/weather";
import type { WeatherGuardPayload } from "@/lib/realisticFarming/cores";

interface Props {
  weather: unknown;
  weatherGuard?: WeatherGuardPayload | null;
  onClose: () => void;
}

export function WeatherModal({ weather, weatherGuard, onClose }: Props) {
  const trapRef = useFocusTrap(true, onClose);
  const snap = asWeatherSnapshot(weather);
  const wgSky = weatherGuard?.sky;
  const wgForecast = Array.isArray(weatherGuard?.forecast) ? weatherGuard!.forecast! : [];
  const hasEngine = !!snap;
  const hasGuard = weatherGuard?.enabled === true && (!!wgSky || wgForecast.length > 0);

  if (!hasEngine && !hasGuard) return null;

  const condition = normalizeWeatherCondition(snap?.currentWeather);
  const forecast = Array.isArray(snap?.forecast) ? snap!.forecast!.slice(0, 3) : [];
  const temp = snap?.currentTemperature;

  return (
    <div class="fd-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        class="fd-modal fd-weather-modal"
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fd-weather-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="fd-modal__header">
          <h2 id="fd-weather-title">{t("weather.title")}</h2>
          <Button variant="ghost" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
        <div class="fd-modal__body">
          {hasEngine ? (
          <section class="fd-weather-modal__current">
            <h3>{t("weather.current")}</h3>
            <div class="fd-weather-modal__current-row">
              <div class="fd-weather-modal__temp">{formatWeatherTemp(temp)}</div>
              <div class="fd-weather-modal__meta">
                <strong>{t(weatherConditionLabelKey(condition))}</strong>
                {hasGuard ? (
                  <p class="fd-muted">
                    {tOr(
                      "rf.weatherguard.companionNote",
                      "Weather Guard is companion telemetry, not the current in-game sky.",
                    )}
                    {weatherGuard?.horizonDays != null
                      ? ` · ${tOr("rf.weatherguard.horizon", "{{days}}-day forecast", {
                          days: weatherGuard.horizonDays,
                        })}`
                      : ""}
                  </p>
                ) : null}
                {snap ? (
                  <>
                    <p>
                      {tOr("weather.wind", "Wind")}: {Math.round(Number(snap.windSpeed) || 0)} km/h
                    </p>
                    <p>
                      {tOr("weather.cloud", "Cloud")}:{" "}
                      {Math.round((Number(snap.cloudCoverage) || 0) * 100)}
                      %
                    </p>
                    <p>
                      {tOr("weather.rain", "Rain")}:{" "}
                      {Math.round((Number(snap.rainLevel) || 0) * 100)}
                      %
                    </p>
                  </>
                ) : null}
                {hasGuard && wgSky?.humidity != null ? (
                  <p>
                    {tOr("rf.weatherguard.humidity", "Humidity")}:{" "}
                    {Math.round(Number(wgSky.humidity) * 100)}%
                  </p>
                ) : null}
              </div>
            </div>
          </section>
          ) : null}

          {wgForecast.length > 0 ? (
            <section class="fd-weather-modal__forecast">
              <h3>{tOr("rf.weatherguard.forecastTitle", "Weather Guard outlook")}</h3>
              <div class="fd-weather-modal__days">
                {wgForecast.slice(0, 10).map((day) => {
                  const dayLabel =
                    day.dayOffset === 0
                      ? tOr("rf.weatherguard.dayToday", "Today")
                      : day.dayOffset === 1
                        ? t("weather.forecastTomorrow")
                        : t("weather.forecastDayN", { n: day.dayOffset });
                  const rain = Number(day.rain);
                  const dayCond =
                    day.weatherType != null
                      ? normalizeWeatherCondition(day.weatherType)
                      : null;
                  return (
                    <div key={day.dayOffset} class="fd-weather-modal__day">
                      <h4>{dayLabel}</h4>
                      <strong>{formatWeatherGuardDayTemp(day)}</strong>
                      {dayCond && dayCond !== "unknown" ? (
                        <p>{t(weatherConditionLabelKey(dayCond))}</p>
                      ) : null}
                      {Number.isFinite(rain) && rain > 0.01 ? (
                        <p class="fd-weather-modal__precip">
                          {Math.round(rain * 100)}%
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : forecast.length > 0 ? (
            <section class="fd-weather-modal__forecast">
              <h3>{t("weather.forecast")}</h3>
              <div class="fd-weather-modal__days">
                {forecast.map((day, index) => {
                  const dayLabel =
                    index === 0
                      ? t("weather.forecastTomorrow")
                      : index === 1
                        ? t("weather.forecastDayAfter")
                        : t("weather.forecastDayN", { n: index + 1 });
                  const dayCond = normalizeWeatherCondition(day.weatherType);
                  return (
                    <div key={index} class="fd-weather-modal__day">
                      <h4>{dayLabel}</h4>
                      <strong>{t(weatherConditionLabelKey(dayCond))}</strong>
                      <p>{formatForecastTempRange(day)}</p>
                      {Number(day.precipitationChance) > 0 ? (
                        <p class="fd-weather-modal__precip">
                          {Math.round(Number(day.precipitationChance))}%
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export type { WeatherSnapshot };
