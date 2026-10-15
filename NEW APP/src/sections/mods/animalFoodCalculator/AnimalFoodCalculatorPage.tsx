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
  yesNo,
  type CompanionPageProps,
  type ModKeyValue,
  type ModRow,
  type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.animalFoodCalculator";

type Output = { title?: string; daily?: number; yearly?: number };
type CalcPen = {
  name?: string;
  animals?: number;
  calculated?: boolean;
  referenceSource?: string;
  foodDaily?: number;
  foodYearly?: number;
  waterDaily?: number;
  waterYearly?: number;
  strawDaily?: number;
  strawYearly?: number;
  outputs?: Output[];
};

const HOOKS: { key: string; label: () => string }[] = [
  { key: "food", label: () => tOr(`${K}.hookFood`, "Feed") },
  { key: "water", label: () => tOr(`${K}.hookWater`, "Water") },
  { key: "straw", label: () => tOr(`${K}.hookStraw`, "Straw") },
  { key: "milk", label: () => tOr(`${K}.hookMilk`, "Milk") },
  { key: "liquidManure", label: () => tOr(`${K}.hookSlurry`, "Slurry") },
  { key: "pallets", label: () => tOr(`${K}.hookPallets`, "Pallets") },
];

const SCALES: { key: string; label: () => string }[] = [
  { key: "foodScale", label: () => tOr(`${K}.settingFoodScale`, "Feed scale now") },
  { key: "waterScale", label: () => tOr(`${K}.settingWaterScale`, "Water scale now") },
  { key: "strawScale", label: () => tOr(`${K}.settingStrawScale`, "Straw scale now") },
];

function perDay(value: unknown): string {
  const n = num(value);
  return n == null ? "—" : tOr(`${K}.litresPerDay`, "{{value}} L/day", { value: formatNumber(n, 0) });
}

function perYear(value: unknown): string {
  const n = num(value);
  return n == null ? "—" : tOr(`${K}.litresPerYear`, "{{value}} L/year", { value: formatNumber(n, 0) });
}

function amount(daily: unknown, yearly: unknown) {
  if (num(daily) == null) return "—";
  return <span title={perYear(yearly)}>{perDay(daily)}</span>;
}

export function AnimalFoodCalculatorPage({ entry }: CompanionPageProps) {
  const { page, farmData } = useCompanionPage(entry.key);
  const settings = (page?.settings ?? {}) as Record<string, unknown>;
  const hooks = (page?.hooks ?? {}) as Record<string, unknown>;
  const pens = asList<CalcPen>(farmData?.pens);

  const tiles: ModStatTile[] = [];
  if (farmData) {
    tiles.push({ key: "food", label: tOr(`${K}.tileFood`, "Feed per day"), value: perDay(farmData.foodDaily) });
    tiles.push({ key: "water", label: tOr(`${K}.tileWater`, "Water per day"), value: perDay(farmData.waterDaily) });
    tiles.push({ key: "straw", label: tOr(`${K}.tileStraw`, "Straw per day"), value: perDay(farmData.strawDaily) });
    tiles.push({
      key: "calculated",
      label: tOr(`${K}.tileCalculated`, "Pens calculated"),
      value: `${formatNumber(farmData.calculatedPens)} / ${formatNumber(farmData.penCount)}`,
      tone: (num(farmData.calculatedPens) ?? 0) < (num(farmData.penCount) ?? 0) ? "warn" : undefined,
    });
  }

  const rows: ModRow[] = pens.map((pen, i) => ({
    key: `${i}-${pen.name ?? ""}`,
    tone: pen.calculated ? undefined : "warn",
    cells: {
      name: pen.name || tOr(`${K}.unnamedPen`, "Unnamed pen"),
      animals: formatNumber(pen.animals),
      food: pen.calculated ? amount(pen.foodDaily, pen.foodYearly) : tOr(`${K}.notCalculated`, "Not calculated yet"),
      water: pen.calculated ? amount(pen.waterDaily, pen.waterYearly) : "—",
      straw: pen.calculated ? amount(pen.strawDaily, pen.strawYearly) : "—",
      outputs: asList<Output>(pen.outputs)
        .map((o) => tOr(`${K}.outputValue`, "{{title}} {{value}}", { title: o.title || "—", value: perDay(o.daily) }))
        .join(", ") || "—",
    },
  }));

  const settingRows: ModKeyValue[] = [];
  if (typeof settings.enabled === "boolean") {
    settingRows.push({ key: "enabled", label: tOr(`${K}.settingEnabled`, "Consumption scaling"), value: yesNo(settings.enabled) });
  }
  if (typeof settings.mode === "string" && settings.mode) {
    settingRows.push({ key: "mode", label: tOr(`${K}.settingMode`, "Scaling mode"), value: settings.mode });
  }
  if (num(settings.customMultiplier) != null) {
    settingRows.push({ key: "multiplier", label: tOr(`${K}.settingMultiplier`, "Custom multiplier"), value: `×${formatNumber(settings.customMultiplier, 2)}` });
  }
  if (typeof settings.autoScaleByDays === "boolean") {
    settingRows.push({ key: "autoDays", label: tOr(`${K}.settingAutoDays`, "Scale by days per period"), value: yesNo(settings.autoScaleByDays) });
  }
  if (typeof settings.referenceSource === "string" && settings.referenceSource) {
    settingRows.push({ key: "reference", label: tOr(`${K}.settingReference`, "Reference figures"), value: settings.referenceSource });
  }
  if (typeof settings.animalPackageRestricted === "boolean") {
    settingRows.push({
      key: "restricted",
      label: tOr(`${K}.settingRestricted`, "Limited by animal package"),
      value: yesNo(settings.animalPackageRestricted),
    });
  }
  for (const s of SCALES) {
    const scale = num(settings[s.key]);
    if (scale != null) settingRows.push({ key: s.key, label: s.label(), value: `×${formatNumber(scale, 2)}` });
  }
  if (num(page?.daysPerPeriod) != null) {
    settingRows.push({ key: "days", label: tOr(`${K}.settingDays`, "Days per period"), value: formatNumber(page?.daysPerPeriod) });
  }
  if (typeof page?.enhancedAnimalSystem === "boolean") {
    settingRows.push({
      key: "eas",
      label: tOr(`${K}.settingEas`, "Enhanced Animal System present"),
      value: yesNo(page.enhancedAnimalSystem),
    });
  }

  const hookRows = HOOKS.filter((h) => typeof hooks[h.key] === "boolean");

  return (
    <ModPage
      entry={entry}
      lead={tOr(
        `${K}.lead`,
        "Works out how much feed, water and straw each pen uses and what it produces per day and per year, and can scale the game's consumption to match.",
      )}
    >
      <ModStatTiles tiles={tiles} />

      <Card title={tOr(`${K}.pensTitle`, "Pens")}>
        {farmData?.truncated === true ? <Badge tone="warn">{tOr(`${K}.truncated`, "Showing the first pens only")}</Badge> : null}
        <ModTable
          columns={[
            { key: "name", label: tOr(`${K}.colPen`, "Pen") },
            { key: "animals", label: tOr(`${K}.colAnimals`, "Animals"), align: "end" },
            { key: "food", label: tOr(`${K}.colFood`, "Feed"), align: "end" },
            { key: "water", label: tOr(`${K}.colWater`, "Water"), align: "end" },
            { key: "straw", label: tOr(`${K}.colStraw`, "Straw"), align: "end" },
            { key: "outputs", label: tOr(`${K}.colOutputs`, "Produces") },
          ]}
          rows={rows}
          empty={
            page?.readState === "settings-only"
              ? tOr(`${K}.pensUnavailable`, "The calculator's pen figures were not readable in this save.")
              : tOr(`${K}.pensEmpty`, "No animal pens on your farm.")
          }
        />
        <p class="fd-economy__muted">
          {tOr(
            `${K}.pensNote`,
            "Figures are the mod's own, per in-game day; hover a value for the yearly total. A pen shows \"Not calculated yet\" until its animals change or you open the Animals menu in game.",
          )}
        </p>
      </Card>

      <Card title={tOr(`${K}.settingsTitle`, "Mod settings")}>
        {settingRows.length > 0 ? (
          <ModKeyValues rows={settingRows} />
        ) : (
          <ModEmpty>{tOr(`${K}.settingsEmpty`, "No settings were readable.")}</ModEmpty>
        )}
        {hookRows.length > 0 ? (
          <>
            <h4 class="fd-mod-page__subhead">{tOr(`${K}.hooksTitle`, "Game values the mod adjusts")}</h4>
            <ModKeyValues rows={hookRows.map((h) => ({ key: h.key, label: h.label(), value: yesNo(hooks[h.key]) }))} />
          </>
        ) : null}
      </Card>

      <ModAbout
        entry={entry}
        lookFor={[
          tOr(`${K}.look1`, "The Animals menu shows the same daily and yearly figures for the selected pen."),
          tOr(`${K}.look2`, "With consumption scaling on, feed and water in the pen drain at the scaled rate."),
          tOr(`${K}.look3`, "Adding or selling animals recalculates that pen."),
        ]}
      />
    </ModPage>
  );
}
