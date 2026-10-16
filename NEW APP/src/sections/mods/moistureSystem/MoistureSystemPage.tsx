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
  useCompanionPage,
  useMoney,
  yesNo,
  type CompanionPageProps,
  type ModRow,
  type ModStatTile,
} from "@/sections/mods/shared";

type CropState = "dry" | "ideal" | "wet";
type Crop = {
  fillType: string;
  idealMinPercent?: number;
  idealMaxPercent?: number;
  witherPercent?: number;
  qualityNow?: number;
  yieldNow?: number;
  gradeNow?: number;
  priceFactorNow?: number;
  state?: CropState;
};
type SiloCrop = {
  fillType: string;
  liters?: number;
  moisturePercent?: number;
  idealMaxPercent?: number;
  quality?: number;
  grade?: number;
  priceFactor?: number;
  needsDrying?: boolean;
};
type Silo = { name?: string; isDrying?: boolean; etaHours?: number; totalLiters?: number; crops?: SiloCrop[] };
type Job = {
  farmlandId: number;
  name?: string;
  boostPercent?: number;
  daysAhead?: number;
  startHour?: number;
  hours?: number;
  hoursWorked?: number;
  price?: number;
  state?: "working" | "booked";
};
type Boost = { farmlandId: number; name?: string; boostPercent?: number; holding?: boolean };
type Bales = { gettingWet?: number; drying?: number; rottingSlowly?: number; rotting?: number; rottingQuickly?: number; total?: number; coverage?: string };
type ForecastMonth = { month: number; actual?: boolean; precipitation?: number; sun?: number; cloudy?: number; precipitationDiff?: number };
type ForecastSeason = { offset: 0 | 1 | 2; precipitation?: number; precipitationDiff?: number; months?: ForecastMonth[] };
type Weather = { profileName?: string; monthRange?: { min?: number; max?: number }; forecast?: ForecastSeason[] };
type Settings = Record<string, unknown>;
type FarmData = {
  siloCount?: number;
  dryingCount?: number;
  needsDryingCount?: number;
  lowGradeCount?: number;
  siloCoverage?: string;
  bales?: Bales;
  irrigation?: { jobCount?: number; boostedCount?: number; bookedSpend?: number };
};

const GRADES = ["A", "B", "C", "D"];

function pctText(value: unknown, dp = 1): string {
  return num(value) == null ? "—" : `${formatNumber(value, dp)}%`;
}

function gradeText(value: unknown): string {
  const n = num(value);
  return n != null && n >= 1 && n <= 4 ? GRADES[n - 1] : "—";
}

function gradeTone(value: unknown): "accent" | "warn" | "danger" | "default" {
  const n = num(value);
  if (n === 1) return "accent";
  if (n === 3) return "warn";
  if (n === 4) return "danger";
  return "default";
}

export function monthName(month: number): string {
  return new Date(2001, month - 1, 1).toLocaleString(undefined, { month: "short" });
}

export function cropName(fillType: string): string {
  const lower = fillType.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function stateLabel(state: CropState): string {
  switch (state) {
    case "dry":
      return tOr("companionPage.moistureSystem.stateDry", "Too dry");
    case "ideal":
      return tOr("companionPage.moistureSystem.stateIdeal", "Ideal");
    case "wet":
      return tOr("companionPage.moistureSystem.stateWet", "Too wet");
    default: {
      const never: never = state;
      return never;
    }
  }
}

function seasonLabel(offset: 0 | 1 | 2): string {
  switch (offset) {
    case 0:
      return tOr("companionPage.moistureSystem.seasonNow", "This season");
    case 1:
      return tOr("companionPage.moistureSystem.seasonNext", "Next season");
    case 2:
      return tOr("companionPage.moistureSystem.seasonAfter", "Season after");
    default: {
      const never: never = offset;
      return never;
    }
  }
}

function signed(value: unknown): string {
  const n = num(value);
  if (n == null) return "—";
  const text = tOr("companionPage.moistureSystem.points", "{{value}} pts", { value: formatNumber(Math.abs(n), 1) });
  return n > 0.05 ? `+${text}` : n < -0.05 ? `−${text}` : tOr("companionPage.moistureSystem.asNormal", "as normal");
}

function jobWhen(job: Job): string {
  const hour = num(job.startHour);
  const time = hour == null ? "" : `${String(hour).padStart(2, "0")}:00`;
  const days = num(job.daysAhead) ?? 0;
  if (days <= 0) return tOr("companionPage.moistureSystem.today", "Today {{time}}", { time });
  if (days === 1) return tOr("companionPage.moistureSystem.tomorrow", "Tomorrow {{time}}", { time });
  return tOr("companionPage.moistureSystem.inDays", "In {{days}} days, {{time}}", { days, time });
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData } = useCompanionPage(entry.key);
  const money = useMoney();
  const farmReadable = !!farmData && (page?.readState === "ok" || page?.readState === "partial");
  const farm = (farmReadable ? farmData : null) as FarmData | null;
  const settings = (page?.settings && typeof page.settings === "object" ? page.settings : {}) as Settings;
  const weather = (page?.weather && typeof page.weather === "object" ? page.weather : null) as Weather | null;
  const crops = asList<Crop>(page?.crops);
  const silos = farmReadable ? asList<Silo>(page?.silos) : [];
  const jobs = farmReadable ? asList<Job>(page?.irrigationJobs) : [];
  const boosts = farmReadable ? asList<Boost>(page?.irrigationBoosts) : [];
  const forecast = asList<ForecastSeason>(weather?.forecast);
  const fieldRange = page?.fieldRange && typeof page.fieldRange === "object" ? (page.fieldRange as { low?: number; high?: number }) : null;
  const bales = farm?.bales ?? null;
  const rotting = bales ? (num(bales.rottingSlowly) ?? 0) + (num(bales.rotting) ?? 0) + (num(bales.rottingQuickly) ?? 0) : null;
  const pending = page?.pending === true;

  const tiles: ModStatTile[] = [];
  if (page && num(page.baseMoisturePercent) != null) {
    tiles.push({
      key: "moisture",
      label: tOr("companionPage.moistureSystem.statMoisture", "Field moisture (map base)"),
      value: pctText(page.baseMoisturePercent),
      hint:
        fieldRange && num(fieldRange.low) != null && num(fieldRange.high) != null
          ? tOr("companionPage.moistureSystem.statMoistureHint", "{{low}}–{{high}} across your fields by elevation", {
              low: pctText(fieldRange.low),
              high: pctText(fieldRange.high),
            })
          : undefined,
    });
  }
  if (weather?.monthRange && num(weather.monthRange.min) != null && num(weather.monthRange.max) != null) {
    tiles.push({
      key: "range",
      label: tOr("companionPage.moistureSystem.statRange", "This month's range"),
      value: `${pctText(weather.monthRange.min, 0)} – ${pctText(weather.monthRange.max, 0)}`,
      hint: weather.profileName,
    });
  }
  if (farm && num(farm.siloCount) != null) {
    tiles.push(
      {
        key: "needsDrying",
        label: tOr("companionPage.moistureSystem.statNeedsDrying", "Stored crops above ideal"),
        value: formatNumber(farm.needsDryingCount ?? 0),
        tone: (farm.needsDryingCount ?? 0) > 0 ? "warn" : "ok",
        hint: tOr("companionPage.moistureSystem.statNeedsDryingHint", "{{count}} silo(s) drying", { count: formatNumber(farm.dryingCount ?? 0) }),
      },
      {
        key: "lowGrade",
        label: tOr("companionPage.moistureSystem.statLowGrade", "Stocks at grade C or D"),
        value: formatNumber(farm.lowGradeCount ?? 0),
        tone: (farm.lowGradeCount ?? 0) > 0 ? "danger" : undefined,
      },
    );
  }
  if (bales && rotting != null) {
    tiles.push({
      key: "bales",
      label: tOr("companionPage.moistureSystem.statBales", "Bales rotting"),
      value: formatNumber(rotting),
      tone: rotting > 0 ? "danger" : undefined,
      hint: tOr("companionPage.moistureSystem.statBalesHint", "{{count}} getting wet", { count: formatNumber(bales.gettingWet ?? 0) }),
    });
  }
  if (farm?.irrigation) {
    tiles.push({
      key: "irrigation",
      label: tOr("companionPage.moistureSystem.statIrrigation", "Irrigation jobs booked"),
      value: formatNumber(farm.irrigation.jobCount ?? 0),
      hint: (farm.irrigation.bookedSpend ?? 0) > 0 ? money(farm.irrigation.bookedSpend) : undefined,
    });
  }

  const siloRows: ModRow[] = [];
  silos.forEach((silo, si) => {
    const list = asList<SiloCrop>(silo.crops);
    const siloCell = (
      <>
        {silo.name ?? "?"}{" "}
        {silo.isDrying ? (
          <Badge tone="accent">
            {num(silo.etaHours) != null
              ? tOr("companionPage.moistureSystem.dryingEta", "Drying, ~{{hours}} h left", { hours: formatNumber(Math.ceil(silo.etaHours as number)) })
              : tOr("companionPage.moistureSystem.drying", "Drying")}
          </Badge>
        ) : null}
      </>
    );
    if (list.length === 0) {
      siloRows.push({ key: `silo-${si}`, cells: { silo: siloCell, crop: "—" } });
      return;
    }
    list.forEach((crop, ci) => {
      siloRows.push({
        key: `silo-${si}-${crop.fillType}`,
        tone: num(crop.grade) === 4 ? "danger" : crop.needsDrying ? "warn" : undefined,
        cells: {
          silo: ci === 0 ? siloCell : "",
          crop: cropName(crop.fillType),
          amount: num(crop.liters) == null ? "—" : tOr("companionPage.moistureSystem.liters", "{{value}} L", { value: formatNumber(crop.liters) }),
          moisture: (
            <>
              {pctText(crop.moisturePercent)}
              {crop.needsDrying ? (
                <>
                  {" "}
                  <Badge tone="warn">{tOr("companionPage.moistureSystem.aboveIdeal", "ideal ≤ {{max}}", { max: pctText(crop.idealMaxPercent, 0) })}</Badge>
                </>
              ) : null}
            </>
          ),
          quality: num(crop.quality) == null ? "—" : formatNumber(crop.quality),
          grade: <Badge tone={gradeTone(crop.grade)}>{gradeText(crop.grade)}</Badge>,
          price: num(crop.priceFactor) == null ? "—" : pctText((crop.priceFactor as number) * 100, 0),
        },
      });
    });
  });

  return (
    <ModPage
      entry={entry}
      lead={tOr(
        "companionPage.moistureSystem.lead",
        "Moisture System gives every field, pile, bale and silo a moisture level. Harvest moisture sets yield and quality, wet stock loses quality until it is dried, and the mod drives the weather from a regional profile.",
      )}
    >
      {pending ? (
        <ModEmpty>{tOr("companionPage.moistureSystem.pending", "The mod is still starting up in this save. Readings appear once the mission has started.")}</ModEmpty>
      ) : null}
      <ModStatTiles tiles={tiles} />

      <Card title={tOr("companionPage.moistureSystem.cropsTitle", "Harvest now at the map's base moisture")}>
        <ModTable
          columns={[
            { key: "crop", label: tOr("companionPage.moistureSystem.colCrop", "Crop") },
            { key: "window", label: tOr("companionPage.moistureSystem.colWindow", "Ideal moisture"), align: "end" },
            { key: "state", label: tOr("companionPage.moistureSystem.colState", "Now") },
            { key: "yield", label: tOr("companionPage.moistureSystem.colYield", "Yield"), align: "end" },
            { key: "quality", label: tOr("companionPage.moistureSystem.colQuality", "Quality"), align: "end" },
            { key: "grade", label: tOr("companionPage.moistureSystem.colGrade", "Grade"), align: "center" },
            { key: "price", label: tOr("companionPage.moistureSystem.colPrice", "Price"), align: "end" },
          ]}
          rows={crops.map((crop) => ({
            key: crop.fillType,
            cells: {
              crop: cropName(crop.fillType),
              window: `${pctText(crop.idealMinPercent, 0)} – ${pctText(crop.idealMaxPercent, 0)}`,
              state: crop.state ? <Badge tone={crop.state === "ideal" ? "accent" : "warn"}>{stateLabel(crop.state)}</Badge> : "—",
              yield: num(crop.yieldNow) == null ? "—" : pctText((crop.yieldNow as number) * 100, 0),
              quality: num(crop.qualityNow) == null ? "—" : formatNumber(crop.qualityNow),
              grade: <Badge tone={gradeTone(crop.gradeNow)}>{gradeText(crop.gradeNow)}</Badge>,
              price: num(crop.priceFactorNow) == null ? "—" : pctText((crop.priceFactorNow as number) * 100, 0),
            },
          }))}
          empty={
            pending || !page
              ? tOr("companionPage.moistureSystem.waitingCrops", "Crop windows appear after the next export.")
              : tOr("companionPage.moistureSystem.noCrops", "The mod's crop table was not readable.")
          }
        />
        <p class="fd-economy__muted">
          {tOr(
            "companionPage.moistureSystem.cropsNote",
            "Your own fields sit up to 2 points either side of the base value (low ground is wetter), plus any irrigation boost. The moisture meter reads the exact spot.",
          )}
        </p>
      </Card>

      <div class="fd-mod-page__grid">
        <Card title={tOr("companionPage.moistureSystem.silosTitle", "Stored crops")}>
          <ModTable
            columns={[
              { key: "silo", label: tOr("companionPage.moistureSystem.colSilo", "Silo") },
              { key: "crop", label: tOr("companionPage.moistureSystem.colCrop", "Crop") },
              { key: "amount", label: tOr("companionPage.moistureSystem.colAmount", "Amount"), align: "end" },
              { key: "moisture", label: tOr("companionPage.moistureSystem.colMoisture", "Moisture"), align: "end" },
              { key: "quality", label: tOr("companionPage.moistureSystem.colQuality", "Quality"), align: "end" },
              { key: "grade", label: tOr("companionPage.moistureSystem.colGrade", "Grade"), align: "center" },
              { key: "price", label: tOr("companionPage.moistureSystem.colPrice", "Price"), align: "end" },
            ]}
            rows={siloRows}
            empty={
              farm && num(farm.siloCount) != null
                ? tOr("companionPage.moistureSystem.noSilos", "None of your silos hold a crop the mod tracks.")
                : !page
                  ? tOr("companionPage.moistureSystem.waitingSilos", "Your silos appear after the next export.")
                  : !farmReadable
                  ? tOr("companionPage.moistureSystem.unavailableSilos", "Silo readings are not available for this farm.")
                  : tOr("companionPage.moistureSystem.waitingSilos", "Your silos appear after the next export.")
            }
          />
          {farm?.siloCoverage === "sampled" ? (
            <ModEmpty>{tOr("companionPage.moistureSystem.silosSampled", "Only the first silos were read this cycle.")}</ModEmpty>
          ) : null}
          <p class="fd-economy__muted">
            {tOr("companionPage.moistureSystem.silosNote", "Crop piles in sheds are not listed here; check them in the mod's Grain Drying tab.")}
          </p>
        </Card>

        <Card title={tOr("companionPage.moistureSystem.balesTitle", "Bales out in the weather")}>
          {bales ? (
            <ModKeyValues
              rows={[
                { key: "gettingWet", label: tOr("companionPage.moistureSystem.baleGettingWet", "Getting wet"), value: formatNumber(bales.gettingWet ?? 0) },
                { key: "drying", label: tOr("companionPage.moistureSystem.baleDrying", "Drying"), value: formatNumber(bales.drying ?? 0) },
                { key: "rottingSlowly", label: tOr("companionPage.moistureSystem.baleRottingSlowly", "Rotting slowly"), value: formatNumber(bales.rottingSlowly ?? 0) },
                { key: "rotting", label: tOr("companionPage.moistureSystem.baleRotting", "Rotting"), value: formatNumber(bales.rotting ?? 0) },
                { key: "rottingQuickly", label: tOr("companionPage.moistureSystem.baleRottingQuickly", "Rotting quickly"), value: formatNumber(bales.rottingQuickly ?? 0) },
              ]}
            />
          ) : (
            <ModEmpty>
              {!page
                ? tOr("companionPage.moistureSystem.waitingBales", "Bale readings appear after the next export.")
                : !farmReadable
                ? tOr("companionPage.moistureSystem.unavailableBales", "Bale readings are not available for this farm.")
                : settings.baleRotEnabled === false
                  ? tOr("companionPage.moistureSystem.baleRotOff", "Bale rotting is switched off in the mod's settings.")
                  : tOr("companionPage.moistureSystem.waitingBales", "Bale readings appear after the next export.")}
            </ModEmpty>
          )}
          <p class="fd-economy__muted">
            {tOr("companionPage.moistureSystem.balesNote", "Only your own bales that have caught rain are counted. Wrapped bales and bales under shelter are protected; once a bale starts rotting it cannot dry back.")}
          </p>
        </Card>
      </div>

      <div class="fd-mod-page__grid">
        <Card title={tOr("companionPage.moistureSystem.jobsTitle", "Irrigation contractors")}>
          <ModTable
            columns={[
              { key: "field", label: tOr("companionPage.moistureSystem.colFarmland", "Farmland") },
              { key: "boost", label: tOr("companionPage.moistureSystem.colBoost", "Boost"), align: "end" },
              { key: "when", label: tOr("companionPage.moistureSystem.colWhen", "When") },
              { key: "progress", label: tOr("companionPage.moistureSystem.colProgress", "Hours"), align: "end" },
              { key: "price", label: tOr("companionPage.moistureSystem.colCost", "Cost"), align: "end" },
            ]}
            rows={jobs.map((job, i) => ({
              key: `job-${job.farmlandId}-${job.daysAhead ?? 0}-${i}`,
              cells: {
                field: job.name ?? String(job.farmlandId),
                boost: `+${pctText(job.boostPercent)}`,
                when:
                  job.state === "working" ? <Badge tone="accent">{tOr("companionPage.moistureSystem.working", "On site now")}</Badge> : jobWhen(job),
                progress: `${formatNumber(job.hoursWorked ?? 0)} / ${formatNumber(job.hours ?? 0)}`,
                price: num(job.price) == null ? "—" : money(job.price),
              },
            }))}
            empty={farm?.irrigation && num(farm.irrigation.jobCount) != null
              ? tOr("companionPage.moistureSystem.noJobs", "No irrigation booked.")
              : !page
                ? tOr("companionPage.moistureSystem.waitingJobs", "Irrigation bookings may appear after the next export.")
                : tOr("companionPage.moistureSystem.unavailableJobs", "Irrigation bookings are not available for this farm.")}
          />
          {boosts.length > 0 ? (
            <>
              <h4 class="fd-mod-page__subhead">{tOr("companionPage.moistureSystem.boostsTitle", "Current irrigation boost")}</h4>
              <ModTable
                columns={[
                  { key: "field", label: tOr("companionPage.moistureSystem.colFarmland", "Farmland") },
                  { key: "boost", label: tOr("companionPage.moistureSystem.colBoost", "Boost"), align: "end" },
                ]}
                rows={boosts.map((b) => ({
                  key: `boost-${b.farmlandId}`,
                  cells: {
                    field: b.name ?? String(b.farmlandId),
                    boost: (
                      <>
                        +{pctText(b.boostPercent)}{" "}
                        {b.holding ? <Badge>{tOr("companionPage.moistureSystem.holding", "holding")}</Badge> : null}
                      </>
                    ),
                  },
                }))}
              />
            </>
          ) : null}
          <p class="fd-economy__muted">
            {tOr("companionPage.moistureSystem.jobsNote", "Book contractors in the mod's Moisture Menu (Shift+M). The boost builds hour by hour, holds for 6 hours after the job, then drains with the weather.")}
          </p>
        </Card>

        <Card title={tOr("companionPage.moistureSystem.forecastTitle", "Seasonal forecast")}>
          {forecast.length > 0 ? (
            <ModTable
              columns={[
                { key: "month", label: tOr("companionPage.moistureSystem.colMonth", "Month") },
                { key: "rain", label: tOr("companionPage.moistureSystem.colRain", "Rain & snow"), align: "end" },
                { key: "diff", label: tOr("companionPage.moistureSystem.colVsNormal", "Vs normal"), align: "end" },
                { key: "sun", label: tOr("companionPage.moistureSystem.colSun", "Sun"), align: "end" },
                { key: "cloud", label: tOr("companionPage.moistureSystem.colCloud", "Cloud"), align: "end" },
              ]}
              rows={forecast.flatMap((season) =>
                asList<ForecastMonth>(season.months).map((m, i) => ({
                  key: `f-${season.offset}-${m.month}`,
                  cells: {
                    month: (
                      <>
                        {i === 0 ? <strong>{seasonLabel(season.offset)}: </strong> : null}
                        {monthName(m.month)}
                        {m.actual ? ` (${tOr("companionPage.moistureSystem.actual", "so far")})` : ""}
                      </>
                    ),
                    rain: pctText(m.precipitation, 0),
                    diff: signed(m.precipitationDiff),
                    sun: pctText(m.sun, 0),
                    cloud: pctText(m.cloudy, 0),
                  },
                })),
              )}
            />
          ) : (
            <ModEmpty>
              {settings.overrideWeather === false
                ? tOr("companionPage.moistureSystem.weatherOff", "The mod is not controlling the weather in this save, so there is no forecast.")
                : tOr("companionPage.moistureSystem.noForecast", "The forecast appears once the mod has rolled it in game.")}
            </ModEmpty>
          )}
          <p class="fd-economy__muted">
            {tOr("companionPage.moistureSystem.forecastNote", "The same forecast as the mod's Weather tab: share of rain, sun and cloud per month against the profile's normal year.")}
          </p>
        </Card>
      </div>

      <ModAbout
        entry={entry}
        lookFor={[
          tOr("companionPage.moistureSystem.look1", "Press Shift+M for the Moisture Menu, with tabs including Grain Drying, Irrigation, Weather and Crop Grade Values."),
          tOr("companionPage.moistureSystem.look2", "Start drying a silo from the Grain Drying tab; it charges by the hour until every crop reaches its ideal moisture."),
          tOr("companionPage.moistureSystem.look3", "Buy the moisture meter in the shop's hand tools to read a field or pile on the spot."),
          tOr("companionPage.moistureSystem.look4", "Selling wet crops adds a separate \"Drying Charges\" entry to your finances."),
        ]}
      >
        <ModKeyValues
          rows={[
            { key: "profile", label: tOr("companionPage.moistureSystem.kvProfile", "Weather profile"), value: weather?.profileName ?? String(settings.weatherProfile ?? "—") },
            { key: "override", label: tOr("companionPage.moistureSystem.kvOverride", "Mod controls the weather"), value: yesNo(settings.overrideWeather) },
            { key: "hay", label: tOr("companionPage.moistureSystem.kvHay", "Grass turns to hay below"), value: pctText(settings.hayThresholdPercent, 0) },
            { key: "tedding", label: tOr("companionPage.moistureSystem.kvTedding", "Moisture removed per tedding pass"), value: pctText(settings.teddingReductionPercent, 0) },
            { key: "drying", label: tOr("companionPage.moistureSystem.kvDrying", "Silo drying speed"), value: tOr("companionPage.moistureSystem.perHour", "{{value}} per hour", { value: pctText(settings.dryingSpeedPercentPerHour) }) },
            { key: "withering", label: tOr("companionPage.moistureSystem.kvWithering", "Crop withering"), value: yesNo(settings.witheringEnabled) },
            { key: "baleRot", label: tOr("companionPage.moistureSystem.kvBaleRot", "Bale rotting"), value: yesNo(settings.baleRotEnabled) },
            { key: "contractors", label: tOr("companionPage.moistureSystem.kvContractors", "Irrigation contractors"), value: formatNumber(settings.irrigationContractors) },
          ]}
        />
      </ModAbout>
    </ModPage>
  );
}
