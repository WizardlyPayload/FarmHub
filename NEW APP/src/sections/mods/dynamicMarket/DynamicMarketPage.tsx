import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModAbout,
  ModBarChart,
  ModEmpty,
  ModKeyValues,
  ModPage,
  ModStatTiles,
  ModTable,
  asList,
  formatNumber,
  num,
  periodLabel,
  useCompanionPage,
  yesNo,
  type CompanionPageProps,
  type ModKeyValue,
  type ModStatTile,
} from "@/sections/mods/shared";

type GroupRow = {
  key?: string;
  title?: string;
  factor?: number;
  changePercent?: number;
  trend?: string;
  weather?: number;
  supply?: number;
  demand?: number;
  seasonalSupply?: number;
  volatility?: number;
  curve?: unknown;
  curveNow?: number;
  nextChangePercent?: number;
};
type PressureRow = { station?: string; fillType?: string; title?: string; percent?: number; peakPercent?: number; recovering?: boolean };
type FavoriteRow = { fillType?: string; title?: string; group?: string; changePercent?: number; bestPeriod?: number };

function signedPercent(value: unknown, dp = 1): string {
  const n = num(value);
  if (n == null) return "—";
  const text = `${formatNumber(Math.abs(n), dp)}%`;
  return n > 0 ? `+${text}` : n < 0 ? `−${text}` : text;
}

function signed(value: unknown): string {
  const n = num(value);
  if (n == null) return "—";
  const text = formatNumber(Math.abs(n), 2);
  return n > 0 ? `+${text}` : n < 0 ? `−${text}` : text;
}

function changeTone(value: unknown): "ok" | "danger" | undefined {
  const n = num(value);
  if (n == null || Math.abs(n) < 0.5) return undefined;
  return n > 0 ? "ok" : "danger";
}

function trendLabel(value: unknown): string {
  switch (value) {
    case "up":
      return tOr("companionPage.dynamicMarket.trendUp", "Rising");
    case "down":
      return tOr("companionPage.dynamicMarket.trendDown", "Falling");
    case "stable":
      return tOr("companionPage.dynamicMarket.trendStable", "Steady");
    default:
      return "—";
  }
}

function fillLabel(title: unknown, name: unknown): string {
  if (typeof title === "string" && title !== "") return title;
  if (typeof name !== "string" || name === "") return "—";
  const text = name.toLowerCase().split("_").join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function Page({ entry }: CompanionPageProps) {
  const { page } = useCompanionPage(entry.key);
  const groups = asList<GroupRow>(page?.groups);
  const pressure = asList<PressureRow>(page?.pressure);
  const favorites = asList<FavoriteRow>(page?.favorites);
  const settings = (page?.settings && typeof page.settings === "object" ? page.settings : null) as Record<string, unknown> | null;
  const lastApply = (page?.lastApply && typeof page.lastApply === "object" ? page.lastApply : null) as Record<string, unknown> | null;
  const period = num(page?.period);
  const groupTitle = (key: unknown) => groups.find((g) => g.key === key)?.title ?? (typeof key === "string" ? key : "—");

  const tiles: ModStatTile[] = page
    ? [
        {
          key: "period",
          label: tOr("companionPage.dynamicMarket.statPeriod", "Market period"),
          value: periodLabel(period),
          hint: num(page.year) == null ? null : tOr("companionPage.dynamicMarket.statYear", "Year {{year}}", { year: formatNumber(page.year, 0) }),
        },
        {
          key: "up",
          label: tOr("companionPage.dynamicMarket.statUp", "Strongest rise"),
          value: page.strongestUp ? groupTitle(page.strongestUp) : "—",
          hint: signedPercent(groups.find((g) => g.key === page.strongestUp)?.changePercent),
          tone: page.strongestUp ? "ok" : undefined,
        },
        {
          key: "down",
          label: tOr("companionPage.dynamicMarket.statDown", "Strongest fall"),
          value: page.strongestDown ? groupTitle(page.strongestDown) : "—",
          hint: signedPercent(groups.find((g) => g.key === page.strongestDown)?.changePercent),
          tone: page.strongestDown ? "danger" : undefined,
        },
        {
          key: "pressure",
          label: tOr("companionPage.dynamicMarket.statPressure", "Stations under sell pressure"),
          value: formatNumber(page.pressureActive, 0),
          tone: (num(page.pressureActive) ?? 0) > 0 ? "warn" : undefined,
        },
        {
          key: "applied",
          label: tOr("companionPage.dynamicMarket.statApplied", "Prices adjusted"),
          value: formatNumber(lastApply?.adjusted, 0),
          hint: tOr("companionPage.dynamicMarket.statAppliedHint", "at {{count}} selling points", { count: formatNumber(lastApply?.stations, 0) }),
          tone: lastApply && lastApply.success === false ? "danger" : undefined,
        },
      ]
    : [];

  const settingRows: ModKeyValue[] = settings
    ? [
        {
          key: "priceBase",
          label: tOr("companionPage.dynamicMarket.setBase", "Price base"),
          value:
            settings.priceBase === "normal"
              ? tOr("companionPage.dynamicMarket.baseNormal", "Game's seasonal prices")
              : tOr("companionPage.dynamicMarket.baseYear", "Year-average prices"),
        },
        { key: "daily", label: tOr("companionPage.dynamicMarket.setDaily", "Recalculate every day"), value: yesNo(settings.dailyRecalc) },
        { key: "vanilla", label: tOr("companionPage.dynamicMarket.setVanilla", "Vanilla prices (mod paused)"), value: yesNo(settings.vanillaMode) },
        { key: "pressure", label: tOr("companionPage.dynamicMarket.setPressure", "Station sell pressure"), value: yesNo(settings.stationPressure) },
        {
          key: "pressureRule",
          label: tOr("companionPage.dynamicMarket.setPressureRule", "Pressure rule"),
          value:
            num(settings.pressureThresholdLiters) == null
              ? "—"
              : tOr("companionPage.dynamicMarket.pressureRule", "−{{step}}% per {{liters}} L sold, up to −{{max}}%, recovers {{decay}}% per hour", {
                  step: formatNumber(settings.pressurePercentPerStep, 1),
                  liters: formatNumber(settings.pressureThresholdLiters, 0),
                  max: formatNumber(settings.pressureMaxPercent, 0),
                  decay: formatNumber(settings.pressureDecayPerHour, 1),
                }),
        },
        { key: "notices", label: tOr("companionPage.dynamicMarket.setNotices", "Market notices in game"), value: yesNo(settings.marketNotices) },
      ]
    : [];

  return (
    <ModPage
      entry={entry}
      lead={tOr(
        "companionPage.dynamicMarket.lead",
        "Dynamic Market moves selling prices by market group each period, driven by season, weather, supply and demand. Selling large amounts at one station pushes its price down for a while. This page shows each group's current move and the outlook for next period.",
      )}
    >
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.dynamicMarket.groupsTitle", "Market groups")}>
        <ModTable
          columns={[
            { key: "group", label: tOr("companionPage.dynamicMarket.colGroup", "Group") },
            { key: "change", label: tOr("companionPage.dynamicMarket.colChange", "Price move now"), align: "end" },
            { key: "trend", label: tOr("companionPage.dynamicMarket.colTrend", "Trend") },
            { key: "next", label: tOr("companionPage.dynamicMarket.colNext", "Next period"), align: "end" },
            { key: "weather", label: tOr("companionPage.dynamicMarket.colWeather", "Weather"), align: "end" },
            { key: "supply", label: tOr("companionPage.dynamicMarket.colSupply", "Supply"), align: "end" },
            { key: "demand", label: tOr("companionPage.dynamicMarket.colDemand", "Demand"), align: "end" },
            { key: "volatility", label: tOr("companionPage.dynamicMarket.colVolatility", "Volatility"), align: "end" },
          ]}
          rows={groups.map((g, i) => ({
            key: g.key ?? String(i),
            tone: changeTone(g.changePercent),
            cells: {
              group: g.title ?? g.key ?? "—",
              change: signedPercent(g.changePercent, 2),
              trend: trendLabel(g.trend),
              next: signedPercent(g.nextChangePercent),
              weather: signed(g.weather),
              supply: signed(g.supply),
              demand: signed(g.demand),
              volatility: formatNumber(g.volatility, 2),
            },
          }))}
          empty={tOr("companionPage.dynamicMarket.noGroups", "Market groups were not readable.")}
        />
        {settings?.dailyRecalc === true ? (
          <ModEmpty>{tOr("companionPage.dynamicMarket.dailyNote", "Daily recalculation is on, so the next-period column is only a rough guide.")}</ModEmpty>
        ) : null}
      </Card>
      {groups.some((g) => asList(g.curve).length > 0) ? (
        <Card title={tOr("companionPage.dynamicMarket.curvesTitle", "Seasonal price curves")}>
          <div class="fd-mod-page__grid">
            {groups
              .filter((g) => asList(g.curve).length > 0)
              .map((g, gi) => (
                <div key={g.key ?? String(gi)} data-curve={g.key}>
                  <h4 class="fd-mod-page__subhead">{g.title ?? g.key}</h4>
                  <ModBarChart
                    points={asList<number>(g.curve).map((v, i) => ({
                      key: String(i + 1),
                      label: String(i + 1),
                      value: num(v),
                      current: period === i + 1,
                      title: `${periodLabel(i + 1)}: ×${formatNumber(v, 2)}`,
                    }))}
                    format={(n) => `×${formatNumber(n, 2)}`}
                  />
                </div>
              ))}
          </div>
        </Card>
      ) : null}
      <div class="fd-mod-page__grid">
        <Card title={tOr("companionPage.dynamicMarket.pressureTitle", "Station sell pressure")}>
          <ModTable
            columns={[
              { key: "station", label: tOr("companionPage.dynamicMarket.colStation", "Selling point") },
              { key: "fill", label: tOr("companionPage.dynamicMarket.colFill", "Product") },
              { key: "percent", label: tOr("companionPage.dynamicMarket.colPercent", "Price cut"), align: "end" },
              { key: "state", label: tOr("companionPage.dynamicMarket.colState", "State") },
            ]}
            rows={pressure.map((p, i) => ({
              key: `${p.station ?? "?"}-${p.fillType ?? i}`,
              tone: (num(p.percent) ?? 0) >= 10 ? "danger" : "warn",
              cells: {
                station: p.station ?? "—",
                fill: fillLabel(p.title, p.fillType),
                percent: `−${formatNumber(p.percent, 1)}%`,
                state: p.recovering
                  ? tOr("companionPage.dynamicMarket.recovering", "Recovering (peak −{{peak}}%)", { peak: formatNumber(p.peakPercent, 1) })
                  : tOr("companionPage.dynamicMarket.atPeak", "At peak"),
              },
            }))}
            empty={
              settings?.stationPressure === false
                ? tOr("companionPage.dynamicMarket.pressureOff", "Station sell pressure is switched off.")
                : tOr("companionPage.dynamicMarket.noPressure", "No selling point has a price cut from heavy selling.")
            }
          />
        </Card>
        <Card title={tOr("companionPage.dynamicMarket.favoritesTitle", "Favourite products")}>
          <ModTable
            columns={[
              { key: "fill", label: tOr("companionPage.dynamicMarket.colFill", "Product") },
              { key: "group", label: tOr("companionPage.dynamicMarket.colGroup", "Group") },
              { key: "change", label: tOr("companionPage.dynamicMarket.colChange", "Price move now"), align: "end" },
              { key: "best", label: tOr("companionPage.dynamicMarket.colBest", "Best period to sell") },
            ]}
            rows={favorites.map((f, i) => ({
              key: f.fillType ?? String(i),
              tone: changeTone(f.changePercent),
              cells: {
                fill: fillLabel(f.title, f.fillType),
                group: groupTitle(f.group),
                change: signedPercent(f.changePercent, 2),
                best: periodLabel(f.bestPeriod),
              },
            }))}
            empty={tOr("companionPage.dynamicMarket.noFavorites", "No favourites marked in the mod's market overview.")}
          />
        </Card>
        <Card title={tOr("companionPage.dynamicMarket.settingsTitle", "Mod settings")}>
          {settingRows.length > 0 ? (
            <ModKeyValues rows={settingRows} />
          ) : (
            <ModEmpty>{tOr("companionPage.dynamicMarket.noSettings", "Settings were not readable.")}</ModEmpty>
          )}
        </Card>
        <Card title={tOr("companionPage.dynamicMarket.applyTitle", "Last price update")}>
          {lastApply ? (
            <ModKeyValues
              rows={[
                { key: "success", label: tOr("companionPage.dynamicMarket.applySuccess", "Applied"), value: yesNo(lastApply.success) },
                { key: "reason", label: tOr("companionPage.dynamicMarket.applyReason", "Reason"), value: typeof lastApply.reason === "string" ? lastApply.reason : "—" },
                { key: "fillTypes", label: tOr("companionPage.dynamicMarket.applyFillTypes", "Products"), value: formatNumber(lastApply.fillTypes, 0) },
                { key: "skipped", label: tOr("companionPage.dynamicMarket.applySkipped", "Skipped"), value: formatNumber(lastApply.skipped, 0) },
                {
                  key: "range",
                  label: tOr("companionPage.dynamicMarket.applyRange", "Factor range"),
                  value:
                    num(lastApply.minFactor) == null
                      ? "—"
                      : `×${formatNumber(lastApply.minFactor, 2)} – ×${formatNumber(lastApply.maxFactor, 2)}`,
                },
              ]}
            />
          ) : (
            <ModEmpty>{tOr("companionPage.dynamicMarket.noApply", "No price update recorded yet.")}</ModEmpty>
          )}
        </Card>
      </div>
      <ModAbout
        entry={entry}
        lookFor={[
          tOr("companionPage.dynamicMarket.look1", "Open the mod's market overview in the in-game menu to see prices per selling point and mark favourites."),
          tOr("companionPage.dynamicMarket.look2", "Spread big deliveries across selling points to avoid the sell-pressure price cut."),
          tOr("companionPage.dynamicMarket.look3", "Prices change at each new period, or every day if daily recalculation is on."),
        ]}
      />
    </ModPage>
  );
}
