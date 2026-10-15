import { Badge, Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModAbout,
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
  type ModStatTile,
} from "@/sections/mods/shared";
import { CALENDAR_PERIODS, calendarRows, cropLabel, validPeriod, type CalendarCropInput, type CalendarMark, type CalendarRow } from "./calendarGrid";
import "./regionalCropCalendar.css";

type Season = { season?: number; temperatureOffset?: number; precipitationRatio?: number };
type EconomyRow = { fillType?: string; priceScale?: number; pricePerLiter?: number };
type Region = {
  group?: string;
  climate?: string;
  anchor?: string;
  description?: string;
  tip?: string;
  yieldMultiplier?: number;
  signatureBonus?: number;
  signatureCrops?: string[];
  unsuitableCrops?: string[];
  calendarCrops?: number;
  seasons?: Season[];
  economy?: EconomyRow[];
  economyCount?: number;
  sourceCount?: number;
};
type Moisture = {
  active?: boolean;
  bonusSteps?: number;
  penaltySteps?: number;
  dryStreak?: number;
  snowPack?: number;
  percent?: number;
  maxBonusSteps?: number;
  maxPenaltySteps?: number;
  droughtAfter?: number;
};
type Settings = { weatherEnabled?: boolean; yieldEnabled?: boolean; strictSuitabilityEnabled?: boolean };

function obj<T>(value: unknown): T | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : null;
}

function signedPercent(value: unknown, dp = 0): string {
  const n = num(value);
  if (n == null) return "—";
  const text = formatNumber(Math.abs(n), dp);
  return n > 0 ? `+${text}%` : n < 0 ? `−${text}%` : `${text}%`;
}

function markLabel(mark: CalendarMark): string {
  switch (mark) {
    case "plant":
      return tOr("companionPage.regionalCropCalendar.plant", "Planting");
    case "harvest":
      return tOr("companionPage.regionalCropCalendar.harvest", "Harvest");
    case "both":
      return tOr("companionPage.regionalCropCalendar.both", "Planting and harvest");
    case null:
      return "";
    default: {
      const never: never = mark;
      return never;
    }
  }
}

function seasonLabel(season: unknown): string {
  switch (num(season)) {
    case 1:
      return tOr("companionPage.regionalCropCalendar.spring", "Spring");
    case 2:
      return tOr("companionPage.regionalCropCalendar.summer", "Summer");
    case 3:
      return tOr("companionPage.regionalCropCalendar.autumn", "Autumn");
    case 4:
      return tOr("companionPage.regionalCropCalendar.winter", "Winter");
    default:
      return "—";
  }
}

function CalendarGrid({ rows, current }: { rows: CalendarRow[]; current: number | null }) {
  const allMap = rows.length > 0 && rows.every((r) => r.mapCalendar);
  return (
    <>
      <div class="fd-cp-rcc__scroll">
        <table class="fd-economy__table fd-cp-rcc__table">
          <thead>
            <tr>
              <th scope="col">{tOr("companionPage.regionalCropCalendar.colCrop", "Crop")}</th>
              {CALENDAR_PERIODS.map((p) => (
                <th key={p} scope="col" class={`text-center${p === current ? " is-current" : ""}`} title={periodLabel(p)}>
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.crop} data-crop={row.crop}>
                <th scope="row">
                  {row.label}
                  {row.mapCalendar && !allMap ? (
                    <span class="fd-cp-rcc__tag">{tOr("companionPage.regionalCropCalendar.mapTag", "map")}</span>
                  ) : null}
                </th>
                {row.complete ? (
                  row.cells.map((mark, i) => {
                    const period = CALENDAR_PERIODS[i];
                    const label = markLabel(mark);
                    return (
                      <td
                        key={period}
                        class={`fd-cp-rcc__cell${mark ? ` is-${mark}` : ""}${period === current ? " is-current" : ""}`}
                        title={mark ? `${periodLabel(period)}: ${label}` : periodLabel(period)}
                        data-mark={mark ?? undefined}
                      >
                        {mark ? <span class="fd-cp-rcc__mark" role="img" aria-label={label} /> : null}
                      </td>
                    );
                  })
                ) : (
                  <td colSpan={CALENDAR_PERIODS.length} class="fd-economy__muted">
                    {tOr("companionPage.regionalCropCalendar.incomplete", "Calendar incomplete")}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div class="fd-cp-rcc__legend">
        <span><i class="fd-cp-rcc__swatch is-plant" />{markLabel("plant")}</span>
        <span><i class="fd-cp-rcc__swatch is-harvest" />{markLabel("harvest")}</span>
        <span><i class="fd-cp-rcc__swatch is-both" />{markLabel("both")}</span>
        {current != null ? (
          <span><i class="fd-cp-rcc__swatch is-current" />{tOr("companionPage.regionalCropCalendar.legendCurrent", "Current period")}</span>
        ) : null}
        <span class="fd-economy__muted">{tOr("companionPage.regionalCropCalendar.legendPeriods", "Columns are calendar periods 1-12.")}</span>
        {allMap ? (
          <span class="fd-economy__muted">{tOr("companionPage.regionalCropCalendar.allMap", "All windows come from the map calendar.")}</span>
        ) : null}
      </div>
    </>
  );
}

function Chips({ names, tone }: { names: string[]; tone?: "accent" | "warn" }) {
  if (names.length === 0) return null;
  return (
    <div class="fd-cp-rcc__chips">
      {names.map((n) => (
        <Badge key={n} tone={tone}>
          {cropLabel(n)}
        </Badge>
      ))}
    </div>
  );
}

export function Page({ entry }: CompanionPageProps) {
  const { page } = useCompanionPage(entry.key);
  const current = validPeriod(num(page?.currentPeriod) != null ? Math.round(num(page?.currentPeriod) ?? 0) : null);
  const settings = obj<Settings>(page?.settings);
  const region = obj<Region>(page?.region);
  const moisture = obj<Moisture>(page?.moisture);
  const rows = calendarRows(asList<CalendarCropInput>(page?.crops), current);
  const blocked = asList<string>(page?.blockedCrops).filter((s) => typeof s === "string");
  const calendarState = typeof page?.calendarState === "string" ? page.calendarState : null;
  const regionName = typeof page?.regionTitle === "string" && page.regionTitle ? page.regionTitle : typeof page?.selectedRegion === "string" ? page.selectedRegion : null;
  const isVanilla = page?.isVanilla === true;
  const plantNow = rows.filter((r) => r.plantNow).map((r) => r.label);
  const harvestNow = rows.filter((r) => r.harvestNow).map((r) => r.label);

  const tiles: ModStatTile[] = page
    ? [
        {
          key: "region",
          label: tOr("companionPage.regionalCropCalendar.statRegion", "Region"),
          value: isVanilla ? tOr("companionPage.regionalCropCalendar.vanilla", "Vanilla (map calendar)") : regionName ?? "—",
          hint: region?.climate ? tOr("companionPage.regionalCropCalendar.climateHint", "{{climate}} climate", { climate: region.climate }) : null,
        },
        { key: "period", label: tOr("companionPage.regionalCropCalendar.statPeriod", "Current period"), value: periodLabel(current) },
        {
          key: "plantNow",
          label: tOr("companionPage.regionalCropCalendar.statPlantNow", "Can plant now"),
          value: rows.length > 0 ? formatNumber(plantNow.length, 0) : "—",
          hint: rows.length > 0 ? tOr("companionPage.regionalCropCalendar.ofCrops", "of {{count}} crops", { count: rows.length }) : null,
        },
        {
          key: "harvestNow",
          label: tOr("companionPage.regionalCropCalendar.statHarvestNow", "Harvestable now"),
          value: rows.length > 0 ? formatNumber(harvestNow.length, 0) : "—",
        },
      ]
    : [];
  if (moisture?.active) {
    const pct = num(moisture.percent);
    tiles.push({
      key: "weather",
      label: tOr("companionPage.regionalCropCalendar.statWeather", "Weather yield effect"),
      value: signedPercent(pct),
      tone: pct != null && pct < 0 ? "danger" : pct != null && pct > 0 ? "ok" : undefined,
      hint: tOr("companionPage.regionalCropCalendar.dryHint", "{{count}} dry months in a row", { count: formatNumber(moisture.dryStreak, 0) }),
    });
  }
  if (settings?.strictSuitabilityEnabled) {
    tiles.push({
      key: "blocked",
      label: tOr("companionPage.regionalCropCalendar.statBlocked", "Crops blocked by climate"),
      value: formatNumber(blocked.length, 0),
      tone: blocked.length > 0 ? "warn" : undefined,
    });
  }

  let calendarBody;
  if (!page) {
    calendarBody = <ModEmpty>{tOr("companionPage.regionalCropCalendar.waitingCalendar", "The calendar appears after the next export.")}</ModEmpty>;
  } else if (calendarState === "pending") {
    calendarBody = (
      <ModEmpty>{tOr("companionPage.regionalCropCalendar.pending", "The region is still being applied. Crop windows appear once the game has switched calendars.")}</ModEmpty>
    );
  } else if (rows.length === 0) {
    calendarBody = <ModEmpty>{tOr("companionPage.regionalCropCalendar.noCrops", "No crop windows were readable.")}</ModEmpty>;
  } else {
    calendarBody = (
      <>
        <CalendarGrid rows={rows} current={current} />
        {calendarState === "partial" || page.calendarCoverage === "truncated" ? (
          <ModEmpty>{tOr("companionPage.regionalCropCalendar.partial", "Some crop windows could not be read, so the calendar is incomplete.")}</ModEmpty>
        ) : null}
      </>
    );
  }

  const seasons = asList<Season>(region?.seasons);
  const economy = asList<EconomyRow>(region?.economy);

  return (
    <ModPage
      entry={entry}
      lead={tOr(
        "companionPage.regionalCropCalendar.lead",
        "Regional Crop Calendar swaps the map's sowing and harvest windows for a real-world farming region, with optional regional weather, yields and climate crop limits.",
      )}
    >
      {settings ? (
        <div class="fd-economy__env">
          <Badge tone={settings.weatherEnabled ? "accent" : "default"}>
            {settings.weatherEnabled
              ? tOr("companionPage.regionalCropCalendar.weatherOn", "Regional weather on")
              : tOr("companionPage.regionalCropCalendar.weatherOff", "Regional weather off")}
          </Badge>
          <Badge tone={settings.yieldEnabled ? "accent" : "default"}>
            {settings.yieldEnabled
              ? tOr("companionPage.regionalCropCalendar.yieldOn", "Regional yield on")
              : tOr("companionPage.regionalCropCalendar.yieldOff", "Regional yield off")}
          </Badge>
          <Badge tone={settings.strictSuitabilityEnabled ? "warn" : "default"}>
            {settings.strictSuitabilityEnabled
              ? tOr("companionPage.regionalCropCalendar.strictOn", "Climate crop limits on")
              : tOr("companionPage.regionalCropCalendar.strictOff", "Climate crop limits off")}
          </Badge>
        </div>
      ) : null}
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.regionalCropCalendar.calendarTitle", "Planting and harvest calendar")}>
        {calendarBody}
        {plantNow.length > 0 ? (
          <p class="fd-economy__muted" data-now="plant">
            {tOr("companionPage.regionalCropCalendar.plantNowList", "Plant now: {{crops}}", { crops: plantNow.join(", ") })}
          </p>
        ) : null}
        {harvestNow.length > 0 ? (
          <p class="fd-economy__muted" data-now="harvest">
            {tOr("companionPage.regionalCropCalendar.harvestNowList", "Harvest now: {{crops}}", { crops: harvestNow.join(", ") })}
          </p>
        ) : null}
      </Card>
      <div class="fd-mod-page__grid">
        <Card title={tOr("companionPage.regionalCropCalendar.regionTitle", "Region profile")}>
          {region ? (
            <>
              {region.description ? <p>{region.description}</p> : null}
              <ModKeyValues
                rows={[
                  { key: "climate", label: tOr("companionPage.regionalCropCalendar.kvClimate", "Climate"), value: region.climate ?? "—" },
                  { key: "group", label: tOr("companionPage.regionalCropCalendar.kvGroup", "Region group"), value: region.group ?? "—" },
                  { key: "anchor", label: tOr("companionPage.regionalCropCalendar.kvAnchor", "Reference location"), value: region.anchor || "—" },
                  {
                    key: "yield",
                    label: tOr("companionPage.regionalCropCalendar.kvYield", "Regional yield"),
                    value: settings?.yieldEnabled
                      ? signedPercent(num(region.yieldMultiplier) != null ? ((num(region.yieldMultiplier) ?? 1) - 1) * 100 : null)
                      : tOr("companionPage.regionalCropCalendar.yieldOffValue", "Off"),
                  },
                  {
                    key: "signature",
                    label: tOr("companionPage.regionalCropCalendar.kvSignature", "Signature crop bonus"),
                    value: settings?.yieldEnabled ? signedPercent(num(region.signatureBonus) != null ? (num(region.signatureBonus) ?? 0) * 100 : null) : "—",
                  },
                  { key: "crops", label: tOr("companionPage.regionalCropCalendar.kvCalendarCrops", "Crops in the preset"), value: formatNumber(region.calendarCrops, 0) },
                ]}
              />
              {asList<string>(region.signatureCrops).length > 0 ? (
                <>
                  <h4 class="fd-mod-page__subhead">{tOr("companionPage.regionalCropCalendar.signatureTitle", "Signature crops")}</h4>
                  <Chips names={asList<string>(region.signatureCrops)} tone="accent" />
                </>
              ) : null}
              {asList<string>(region.unsuitableCrops).length > 0 ? (
                <>
                  <h4 class="fd-mod-page__subhead">{tOr("companionPage.regionalCropCalendar.unsuitableTitle", "Not suited to this climate")}</h4>
                  <Chips names={asList<string>(region.unsuitableCrops)} tone="warn" />
                  <p class="fd-economy__muted">
                    {settings?.strictSuitabilityEnabled
                      ? tOr("companionPage.regionalCropCalendar.unsuitableStrict", "Climate crop limits are on: these seeds are removed from the shop and seeders.")
                      : tOr("companionPage.regionalCropCalendar.unsuitableLoose", "Climate crop limits are off, so these can still be sown.")}
                  </p>
                </>
              ) : null}
              {region.tip ? <p class="fd-economy__muted">{region.tip}</p> : null}
            </>
          ) : (
            <ModEmpty>
              {isVanilla
                ? tOr("companionPage.regionalCropCalendar.vanillaProfile", "No region is selected, so the map's own calendar, weather and prices apply.")
                : tOr("companionPage.regionalCropCalendar.noProfile", "The region profile was not readable.")}
            </ModEmpty>
          )}
          {num(page?.regionCount) != null ? (
            <p class="fd-economy__muted">
              {tOr("companionPage.regionalCropCalendar.regionCount", "{{count}} regions are available in the mod.", { count: formatNumber(page?.regionCount, 0) })}
            </p>
          ) : null}
        </Card>
        <Card title={tOr("companionPage.regionalCropCalendar.moistureTitle", "Rain and drought balance")}>
          {moisture?.active ? (
            <ModKeyValues
              rows={[
                { key: "effect", label: tOr("companionPage.regionalCropCalendar.kvEffect", "Yield effect now"), value: signedPercent(moisture.percent) },
                {
                  key: "bonus",
                  label: tOr("companionPage.regionalCropCalendar.kvBonus", "Rain bonus steps"),
                  value: tOr("companionPage.regionalCropCalendar.stepsOf", "{{count}} of {{max}}", {
                    count: formatNumber(moisture.bonusSteps, 0),
                    max: formatNumber(moisture.maxBonusSteps, 0),
                  }),
                },
                {
                  key: "penalty",
                  label: tOr("companionPage.regionalCropCalendar.kvPenalty", "Drought steps"),
                  value: tOr("companionPage.regionalCropCalendar.stepsOf", "{{count}} of {{max}}", {
                    count: formatNumber(moisture.penaltySteps, 0),
                    max: formatNumber(moisture.maxPenaltySteps, 0),
                  }),
                },
                {
                  key: "dry",
                  label: tOr("companionPage.regionalCropCalendar.kvDry", "Dry months in a row"),
                  value: tOr("companionPage.regionalCropCalendar.dryValue", "{{count}} (drought after {{limit}})", {
                    count: formatNumber(moisture.dryStreak, 0),
                    limit: formatNumber(moisture.droughtAfter, 0),
                  }),
                },
                { key: "snow", label: tOr("companionPage.regionalCropCalendar.kvSnow", "Snowy months stored"), value: formatNumber(moisture.snowPack, 0) },
              ]}
            />
          ) : (
            <ModEmpty>
              {settings?.weatherEnabled
                ? tOr("companionPage.regionalCropCalendar.moistureIdle", "Regional weather is on but the rain balance is not running yet.")
                : tOr("companionPage.regionalCropCalendar.moistureOff", "Turn on regional weather to let rainy and dry months change yields.")}
            </ModEmpty>
          )}
          <p class="fd-economy__muted">
            {tOr("companionPage.regionalCropCalendar.moistureNote", "The balance is one value for the whole region, not per field.")}
          </p>
        </Card>
      </div>
      {region && (seasons.length > 0 || economy.length > 0) ? (
        <div class="fd-mod-page__grid">
          <Card title={tOr("companionPage.regionalCropCalendar.weatherTitle", "Regional weather profile")}>
            <ModTable
              columns={[
                { key: "season", label: tOr("companionPage.regionalCropCalendar.colSeason", "Season") },
                { key: "temp", label: tOr("companionPage.regionalCropCalendar.colTemp", "Temperature shift"), align: "end" },
                { key: "rain", label: tOr("companionPage.regionalCropCalendar.colRain", "Rain vs. map"), align: "end" },
              ]}
              rows={seasons.map((s) => ({
                key: `season-${s.season}`,
                cells: {
                  season: seasonLabel(s.season),
                  temp:
                    num(s.temperatureOffset) != null
                      ? tOr("companionPage.regionalCropCalendar.celsiusShift", "{{value}} °C", {
                          value: `${(num(s.temperatureOffset) ?? 0) > 0 ? "+" : ""}${formatNumber(s.temperatureOffset, 1)}`,
                        })
                      : "—",
                  rain: signedPercent(num(s.precipitationRatio) != null ? ((num(s.precipitationRatio) ?? 1) - 1) * 100 : null),
                },
              }))}
              empty={tOr("companionPage.regionalCropCalendar.noSeasons", "This region has no weather profile.")}
            />
            <p class="fd-economy__muted">
              {settings?.weatherEnabled
                ? tOr("companionPage.regionalCropCalendar.weatherApplied", "Applied to the game's weather.")
                : tOr("companionPage.regionalCropCalendar.weatherNotApplied", "Not applied: regional weather is off.")}
            </p>
          </Card>
          <Card title={tOr("companionPage.regionalCropCalendar.economyTitle", "Regional price changes")}>
            <ModTable
              columns={[
                { key: "fill", label: tOr("companionPage.regionalCropCalendar.colProduct", "Product") },
                { key: "scale", label: tOr("companionPage.regionalCropCalendar.colPrice", "Price vs. map"), align: "end" },
              ]}
              rows={economy.map((e, i) => ({
                key: e.fillType ?? String(i),
                tone: (num(e.priceScale) ?? 1) < 1 ? "warn" : undefined,
                cells: {
                  fill: e.fillType ? cropLabel(e.fillType) : "—",
                  scale: signedPercent(num(e.priceScale) != null ? ((num(e.priceScale) ?? 1) - 1) * 100 : null),
                },
              }))}
              empty={tOr("companionPage.regionalCropCalendar.noEconomy", "This region keeps the map's prices.")}
            />
            {(num(region.economyCount) ?? 0) > economy.length ? (
              <ModEmpty>{tOr("companionPage.regionalCropCalendar.economyTruncated", "Only the first products are listed.")}</ModEmpty>
            ) : null}
          </Card>
        </div>
      ) : null}
      {settings?.strictSuitabilityEnabled && blocked.length > 0 ? (
        <Card title={tOr("companionPage.regionalCropCalendar.blockedTitle", "Seeds removed from the shop and seeders")}>
          <Chips names={blocked} tone="warn" />
        </Card>
      ) : null}
      <ModAbout
        entry={entry}
        lookFor={[
          tOr("companionPage.regionalCropCalendar.look1", "Open the Crop Calendar in the menu: the region button lets the host or admin pick a region and switch weather, yield and climate limits."),
          tOr("companionPage.regionalCropCalendar.look2", "The field info box shows the current rain or drought yield effect when regional weather is on."),
          tOr("companionPage.regionalCropCalendar.look3", "Crops the region preset does not cover keep the map's own windows; they are tagged \"map\" in the calendar above."),
        ]}
      >
        <ModKeyValues
          rows={[
            { key: "weatherSetting", label: tOr("companionPage.regionalCropCalendar.kvWeatherSetting", "Regional weather"), value: yesNo(settings?.weatherEnabled) },
            { key: "yieldSetting", label: tOr("companionPage.regionalCropCalendar.kvYieldSetting", "Regional yield"), value: yesNo(settings?.yieldEnabled) },
            { key: "strictSetting", label: tOr("companionPage.regionalCropCalendar.kvStrictSetting", "Climate crop limits"), value: yesNo(settings?.strictSuitabilityEnabled) },
          ]}
        />
      </ModAbout>
    </ModPage>
  );
}
