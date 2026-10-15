import { Badge, Card } from "@/components/ui";
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
  formatPercent,
  num,
  periodLabel,
  useCompanionPage,
  yesNo,
  type CompanionPageProps,
  type ModChartPoint,
  type ModRow,
  type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.seasonalMilkProduction";

type MilkPen = {
  name?: string;
  kind?: "milk" | "pallets";
  animals?: number;
  baselineCaptured?: boolean;
  baselineLph?: number;
  currentLph?: number;
  appliedRatio?: number;
  avgHealth?: number;
  fillTypes?: string[];
};

const SETTINGS: { key: string; label: () => string }[] = [
  { key: "seasonalCowsEnabled", label: () => tOr(`${K}.settingCows`, "Seasonal curve for cows") },
  { key: "seasonalBuffaloEnabled", label: () => tOr(`${K}.settingBuffalo`, "Seasonal curve for buffalo") },
  { key: "seasonalGoatsEnabled", label: () => tOr(`${K}.settingGoats`, "Seasonal curve for goats") },
  { key: "healthImpactEnabled", label: () => tOr(`${K}.settingHealth`, "Herd health affects milk") },
  { key: "notifySeasonChange", label: () => tOr(`${K}.settingNotifySeason`, "Season change notifications") },
  { key: "notifyPeakSeason", label: () => tOr(`${K}.settingNotifyPeak`, "Peak season notifications") },
  { key: "notifyDryPeriod", label: () => tOr(`${K}.settingNotifyDry`, "Dry period notifications") },
  { key: "notifyHealthWarning", label: () => tOr(`${K}.settingNotifyHealth`, "Health warning notifications") },
];

function lph(value: unknown): string {
  const n = num(value);
  return n == null ? "—" : tOr(`${K}.litresPerHour`, "{{value}} L/h", { value: formatNumber(n, 2) });
}

function curvePoints(curve: number[], current: number | null): ModChartPoint[] {
  return curve.map((value, i) => ({
    key: String(i + 1),
    label: String(i + 1),
    value,
    current: current === i + 1,
    title: `${periodLabel(i + 1)}: ${formatPercent(value, { dp: 0 })}`,
  }));
}

export function SeasonalMilkProductionPage({ entry }: CompanionPageProps) {
  const { page, farmData } = useCompanionPage(entry.key);
  const settings = (page?.settings ?? {}) as Record<string, unknown>;
  const monthly = asList<number>(page?.monthlyPercent);
  const base = asList<number>(page?.basePatternPercent);
  const currentPeriod = num(page?.currentPeriod);
  const pens = asList<MilkPen>(farmData?.pens);
  const hemisphere = page?.hemisphere === "south"
    ? tOr(`${K}.hemisphereSouth`, "Southern hemisphere")
    : page?.hemisphere === "north"
      ? tOr(`${K}.hemisphereNorth`, "Northern hemisphere")
      : null;

  const tiles: ModStatTile[] = [];
  if (currentPeriod != null) {
    tiles.push({ key: "period", label: tOr(`${K}.tilePeriod`, "Current period"), value: periodLabel(currentPeriod), hint: hemisphere });
  }
  if (num(page?.currentPercent) != null) {
    const pct = num(page?.currentPercent)!;
    tiles.push({
      key: "modifier",
      label: tOr(`${K}.tileModifier`, "Milk output this period"),
      value: formatPercent(pct, { dp: 0 }),
      hint: tOr(`${K}.tileModifierHint`, "of the pen's normal rate"),
      tone: pct < 80 ? "warn" : undefined,
    });
  }
  if (num(page?.nextPeakPeriod) != null) {
    tiles.push({
      key: "peak",
      label: tOr(`${K}.tilePeak`, "Next peak"),
      value: periodLabel(page?.nextPeakPeriod),
      hint: formatPercent(page?.nextPeakPercent, { dp: 0 }),
    });
  }
  if (farmData) {
    tiles.push({
      key: "rate",
      label: tOr(`${K}.tileRate`, "Farm milk rate now"),
      value: lph(farmData.currentLph),
      hint: tOr(`${K}.tileRateHint`, "Normal: {{value}}", { value: lph(farmData.baselineLph) }),
    });
    tiles.push({
      key: "pens",
      label: tOr(`${K}.tilePens`, "Pens with a baseline"),
      value: `${formatNumber(farmData.pensWithBaseline)} / ${formatNumber(farmData.penCount)}`,
    });
  }

  const rows: ModRow[] = pens.map((pen, i) => {
    const ratio = num(pen.appliedRatio);
    return {
      key: `${i}-${pen.name ?? ""}`,
      tone: ratio != null && ratio < 0.8 ? "warn" : undefined,
      cells: {
        name: pen.name || tOr(`${K}.unnamedPen`, "Unnamed pen"),
        kind: pen.kind === "pallets" ? tOr(`${K}.kindPallets`, "Pallets") : tOr(`${K}.kindMilk`, "Milk tank"),
        animals: formatNumber(pen.animals),
        baseline: pen.baselineCaptured ? lph(pen.baselineLph) : tOr(`${K}.notCaptured`, "Not captured yet"),
        current: pen.baselineCaptured ? lph(pen.currentLph) : "—",
        applied: ratio == null ? "—" : formatPercent(ratio, { ratio: true, dp: 0 }),
        health: num(pen.avgHealth) == null ? "—" : formatPercent(pen.avgHealth, { dp: 0 }),
        products: asList<string>(pen.fillTypes).join(", ") || "—",
      },
    };
  });

  const settingRows = SETTINGS.filter((s) => typeof settings[s.key] === "boolean").map((s) => ({
    key: s.key,
    label: s.label(),
    value: yesNo(settings[s.key]),
  }));
  if (num(page?.minimumAgeMonths) != null) {
    settingRows.push({
      key: "minimumAge",
      label: tOr(`${K}.settingMinimumAge`, "Minimum milking age"),
      value: tOr(`${K}.months`, "{{count}} months", { count: formatNumber(page?.minimumAgeMonths) }),
    });
  }

  const curve = monthly.length === 12 ? monthly : base.length === 12 ? base : [];

  return (
    <ModPage
      entry={entry}
      lead={tOr(
        `${K}.lead`,
        "Milk output that follows the calendar: each period scales every milking pen's normal rate, and herd health can lower it further.",
      )}
    >
      <ModStatTiles tiles={tiles} />

      <Card title={tOr(`${K}.curveTitle`, "Milk output through the year")}>
        {curve.length === 12 ? (
          <>
            <ModBarChart points={curvePoints(curve, currentPeriod)} format={(n) => formatPercent(n, { dp: 0 })} />
            <p class="fd-economy__muted">
              {monthly.length === 12
                ? tOr(`${K}.curveLive`, "Percent of each pen's normal rate, per period, as the mod applies it in this save.")
                : tOr(`${K}.curveBase`, "The mod's base pattern. The live curve appears once the mod has started in this save.")}
            </p>
          </>
        ) : (
          <ModEmpty>{tOr(`${K}.curveEmpty`, "The monthly curve has not been read yet.")}</ModEmpty>
        )}
      </Card>

      <Card title={tOr(`${K}.pensTitle`, "Milking pens")}>
        {farmData?.truncated === true ? <Badge tone="warn">{tOr(`${K}.truncated`, "Showing the first pens only")}</Badge> : null}
        <ModTable
          columns={[
            { key: "name", label: tOr(`${K}.colPen`, "Pen") },
            { key: "kind", label: tOr(`${K}.colKind`, "Output") },
            { key: "animals", label: tOr(`${K}.colAnimals`, "Animals"), align: "end" },
            { key: "baseline", label: tOr(`${K}.colBaseline`, "Normal rate"), align: "end" },
            { key: "current", label: tOr(`${K}.colCurrent`, "Rate now"), align: "end" },
            { key: "applied", label: tOr(`${K}.colApplied`, "Applied"), align: "end" },
            { key: "health", label: tOr(`${K}.colHealth`, "Avg health"), align: "end" },
            { key: "products", label: tOr(`${K}.colProducts`, "Products") },
          ]}
          rows={rows}
          empty={
            page?.initialized === false
              ? tOr(`${K}.pensNotStarted`, "The mod has not started in this save yet, so no pen rates are available.")
              : tOr(`${K}.pensEmpty`, "No cow, buffalo or goat pens on your farm.")
          }
        />
        <p class="fd-economy__muted">
          {tOr(
            `${K}.pensNote`,
            "The normal rate is what the pen produced before the mod stepped in. A pen shows \"Not captured yet\" until the mod has seen it run.",
          )}
        </p>
      </Card>

      <Card title={tOr(`${K}.settingsTitle`, "Mod settings")}>
        {settingRows.length > 0 ? (
          <ModKeyValues rows={settingRows} />
        ) : (
          <ModEmpty>{tOr(`${K}.settingsEmpty`, "No settings were readable.")}</ModEmpty>
        )}
      </Card>

      <ModAbout
        entry={entry}
        lookFor={[
          tOr(`${K}.look1`, "Milk tank fill speed in the husbandry menu rises and falls with the period shown above."),
          tOr(`${K}.look2`, "With health impact on, low-health herds produce less than the curve alone suggests."),
          tOr(`${K}.look3`, "Sheep-only pens are left to Seasonal Wool Production."),
        ]}
      />
    </ModPage>
  );
}
