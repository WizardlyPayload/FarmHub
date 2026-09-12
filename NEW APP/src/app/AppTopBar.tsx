import { useEffect, useMemo, useState } from "preact/hooks";
import { t, tOr } from "@/i18n/i18n";
import { useDashboardStore } from "@/store/dashboard-store";
import { Badge, Button } from "@/components/ui";
import { NotificationBell } from "@/platform/PlatformChrome";
import { isFarmDashLocalConfigHost } from "@/platform/viewer-mode";
import { getPlayerFarmRecords, isMultiFarmEnabled } from "@/lib/farm-scope";
import { switchActiveFarm, switchActiveServer } from "@/services/ws-client";
import { formatGameTimeDisplay } from "@/lib/game-time";
import {
  asWeatherSnapshot,
  engineWeatherChip,
  formatWeatherTemp,
  weatherConditionLabelKey,
} from "@/lib/weather";
import { WeatherModal } from "@/components/WeatherModal";
import { TOPBAR_ICONS } from "@/app/section-meta";
import {
  formatTimeGuardBadge,
  getTimeGuard,
  getWeatherGuard,
} from "@/lib/realisticFarming/cores";
import {
  LUA_EXPORT_STALE_MS,
  luaStaleRefreshDelayMs,
  resolveNavbarConnectionBadge,
} from "@/lib/connection-badge";

const SAVE_TABS_MAX = 3;

interface Props {
  onOpenSettings: () => void;
}

export function AppTopBar({ onOpenSettings }: Props) {
  const connection = useDashboardStore((s) => s.connection);
  const servers = useDashboardStore((s) => s.servers);
  const activeServerId = useDashboardStore((s) => s.activeServerId);
  const activeFarmId = useDashboardStore((s) => s.activeFarmId);
  const payload = useDashboardStore((s) => s.payload);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const playerFarms = useMemo(() => getPlayerFarmRecords(payload?.farmInfo), [payload?.farmInfo]);
  const showFarmSelect = isMultiFarmEnabled(payload?.farmInfo);
  const weather = asWeatherSnapshot(payload?.weather);
  const weatherChip = engineWeatherChip(weather);
  const showWeather = weatherChip.show;
  const gameTimeLabel = formatGameTimeDisplay(payload?.gameTime);
  const rf = payload?.realisticFarming;
  const timeGuardBadge = useMemo(() => formatTimeGuardBadge(getTimeGuard(rf)), [rf]);
  const weatherGuard = useMemo(() => getWeatherGuard(rf), [rf]);
  const ts = payload?.dataTimestamps;
  const lastLua =
    typeof ts?.lastLuaReceivedAt === "string" || typeof ts?.lastLuaReceivedAt === "number"
      ? ts.lastLuaReceivedAt
      : undefined;
  const staleMs = Number(ts?.luaExportStaleMs) || LUA_EXPORT_STALE_MS;

  useEffect(() => {
    const delay = luaStaleRefreshDelayMs(lastLua, staleMs, Date.now());
    if (delay == null) return;
    const id = window.setTimeout(() => setNowMs(Date.now()), delay);
    return () => window.clearTimeout(id);
  }, [lastLua, staleMs]);

  const sourceBadge = useMemo(
    () =>
      resolveNavbarConnectionBadge({
        dataSource: payload?.dataSource,
        luaAvailable: payload?.luaAvailable,
        xmlAvailable: payload?.xmlAvailable,
        apiConnected: connection === "ws" || connection === "http",
        dataTimestamps: ts,
        nowMs,
      }),
    [
      payload?.dataSource,
      payload?.luaAvailable,
      payload?.xmlAvailable,
      connection,
      ts,
      nowMs,
    ],
  );

  const modCheck = payload?.modVersionCheck;
  const modOutdated = modCheck?.status === "outdated";
  const modUnknown = modCheck?.status === "unknown";

  const useSaveDropdown = servers.length > SAVE_TABS_MAX;
  const savesLabel = tOr("nav.saves", "Saves");

  return (
    <>
      <header class="fd-topbar">
        <div class="fd-topbar__left">
          <strong class="fd-topbar__brand">{tOr("nav.brand", "Farm Dashboard")}</strong>
        </div>
        <div
          class={`fd-topbar__center${useSaveDropdown ? " fd-topbar__center--dropdown" : ""}`}
          role={useSaveDropdown ? undefined : "tablist"}
          aria-label={savesLabel}
        >
          {useSaveDropdown ? (
            <label class="fd-topbar__farm fd-topbar__save">
              <span class="fd-topbar__farm-label">{savesLabel}</span>
              <select
                class="fd-topbar__farm-select fd-topbar__save-select"
                value={String(activeServerId ?? servers[0]?.id ?? "")}
                onChange={(e) => void switchActiveServer((e.target as HTMLSelectElement).value)}
                aria-label={savesLabel}
              >
                {servers.map((srv) => (
                  <option key={srv.id} value={String(srv.id)}>
                    {srv.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            servers.map((srv) => (
              <button
                key={srv.id}
                type="button"
                role="tab"
                aria-selected={String(srv.id) === String(activeServerId)}
                class={`fd-topbar__tab ${String(srv.id) === String(activeServerId) ? "is-active" : ""}`}
                onClick={() => void switchActiveServer(String(srv.id))}
              >
                {srv.name}
              </button>
            ))
          )}
        </div>
        <div class="fd-topbar__right">
          {showFarmSelect ? (
            <label class="fd-topbar__farm">
              <span class="fd-topbar__farm-label">{t("farmSelect.title")}</span>
              <select
                class="fd-topbar__farm-select"
                value={String(activeFarmId ?? playerFarms[0]?.id ?? 1)}
                onChange={(e) => switchActiveFarm(Number((e.target as HTMLSelectElement).value))}
                aria-label={t("farmSelect.title")}
              >
                {playerFarms.map((farm) => {
                  const id = Number(farm.id ?? farm.farmId);
                  const name = String(farm.name ?? `Farm ${id}`);
                  return (
                    <option key={id} value={String(id)}>
                      {name}
                    </option>
                  );
                })}
              </select>
            </label>
          ) : null}
          {gameTimeLabel ? <Badge tone="accent">{gameTimeLabel}</Badge> : null}
          {timeGuardBadge ? <Badge tone="default">{timeGuardBadge}</Badge> : null}
          {showWeather ? (
            <button
              type="button"
              class="fd-topbar__weather"
              onClick={() => setWeatherOpen(true)}
              title={t("weather.title")}
            >
              <span>{formatWeatherTemp(weatherChip.temperature)}</span>
              <span>{t(weatherConditionLabelKey(weatherChip.condition))}</span>
            </button>
          ) : null}
          <NotificationBell />
          {isFarmDashLocalConfigHost() ? (
            <Button variant="ghost" onClick={onOpenSettings}>
              <img
                class="fd-topbar__settings-icon"
                src={TOPBAR_ICONS.settings}
                alt=""
                aria-hidden="true"
                width={18}
                height={18}
                draggable={false}
              />
              {t("nav.unifiedSettings")}
            </Button>
          ) : null}
          {connection === "error" ? (
            <Badge tone="danger" title={tOr("nav.connectionError", "Connection error")}>
              {tOr("nav.connectionError", "Connection error")}
            </Badge>
          ) : (
            <Badge tone={sourceBadge.tone} title={t(sourceBadge.titleKey)}>
              {t(sourceBadge.labelKey)}
            </Badge>
          )}
          {modOutdated ? (
            <Badge
              tone="danger"
              title={t("nav.modVersionOutdatedTitle", {
                actual: String(modCheck?.actual || "?"),
                expected: String(modCheck?.expectedMin || ""),
              })}
            >
              {t("nav.modVersionOutdatedShort", {
                actual: String(modCheck?.actual || "?"),
                expected: String(modCheck?.expectedMin || ""),
              })}
            </Badge>
          ) : null}
          {modUnknown ? (
            <Badge
              tone="warn"
              title={t("nav.modVersionUnknownTitle", {
                expected: String(modCheck?.expectedMin || ""),
              })}
            >
              {t("nav.modVersionUnknownShort")}
            </Badge>
          ) : null}
        </div>
      </header>
      {weatherOpen && showWeather ? (
        <WeatherModal
          weather={weather}
          weatherGuard={weatherGuard}
          onClose={() => setWeatherOpen(false)}
        />
      ) : null}
    </>
  );
}
