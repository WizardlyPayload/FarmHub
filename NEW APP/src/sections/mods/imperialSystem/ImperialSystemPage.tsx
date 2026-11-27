import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import { fillUnitOwnerId } from "@/lib/fill-units";
import { useFillUnitMode, useUnitDisplay } from "@/lib/fill-unit-mode";
import { useDashboardStore } from "@/store/dashboard-store";
import {
  ModAbout,
  ModEmpty,
  ModKeyValues,
  ModPage,
  ModStatTiles,
  asList,
  formatNumber,
  num,
  useCompanionPage,
  yesNo,
  type CompanionPageProps,
  type ModKeyValue,
  type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.imperialSystem";

function liquid(value: unknown): string {
  if (value === "gallons") return tOr(`${K}.liquidGallons`, "US gallons");
  if (value === "liters") return tOr(`${K}.liquidLitres`, "Litres");
  return "—";
}

function crops(value: unknown): string {
  if (value === "imperial") return tOr(`${K}.cropsImperial`, "Bushels for grain, pounds or tons for other solids");
  if (value === "liters") return tOr(`${K}.cropsLitres`, "Litres");
  return "—";
}

function weight(value: unknown): string {
  if (value === "imperial") return tOr(`${K}.weightImperial`, "Pounds and US tons");
  if (value === "metric") return tOr(`${K}.weightMetric`, "Kilograms and tonnes");
  return "—";
}

function measure(value: unknown): string {
  if (value === "imperial") return tOr(`${K}.measureImperial`, "Feet");
  if (value === "metric") return tOr(`${K}.measureMetric`, "Metres");
  return "—";
}

function scale(value: unknown): string {
  if (value === "auto") return tOr(`${K}.scaleAuto`, "Pounds, switching to tons from 2,000 lbs");
  if (value === "pounds") return tOr(`${K}.scalePounds`, "Always pounds");
  if (value === "tons") return tOr(`${K}.scaleTons`, "Always tons");
  return "—";
}

function factor(value: unknown, dp: number): string {
  return num(value) == null ? "—" : formatNumber(value, dp);
}

export function Page({ entry }: CompanionPageProps) {
  const { page } = useCompanionPage(entry.key);
  const unitDisplay = useUnitDisplay();
  const effectiveMode = useFillUnitMode();
  const viewerMode = useDashboardStore((s) => s.viewerFillUnitMode);
  const settings = page?.settings && typeof page.settings === "object" ? page.settings as Record<string, unknown> : null;
  const game = page?.gameUnits && typeof page.gameUnits === "object" ? page.gameUnits as Record<string, unknown> : null;
  const factors = page?.factors && typeof page.factors === "object" ? page.factors as Record<string, unknown> : null;
  const bushelCrops = asList<string>(page?.bushelCrops);
  const provider = fillUnitOwnerId(unitDisplay);
  const liquidChoice = settings?.liquid ?? unitDisplay.imperial?.liquid;
  const cropChoice = settings?.crops ?? unitDisplay.imperial?.crops;
  const modeName = effectiveMode === "british"
    ? tOr(`${K}.modeBritish`, "British (kg and tonnes)")
    : effectiveMode === "imperial"
      ? `${liquid(liquidChoice)} / ${crops(cropChoice)}`
      : tOr(`${K}.modeLitres`, "Litres");
  const fillImperialSelected = settings?.liquid === "gallons" || settings?.crops === "imperial" || settings?.weight === "imperial";

  const tiles: ModStatTile[] = settings ? [
    { key: "liquid", label: tOr(`${K}.statLiquid`, "Liquids"), value: liquid(settings.liquid) },
    { key: "crops", label: tOr(`${K}.setCrops`, "Crops and solids"), value: crops(settings.crops) },
    { key: "display", label: tOr(`${K}.statFarmhubMode`, "FarmHub fill units"), value: modeName },
    { key: "bushelCrops", label: tOr(`${K}.bushelDefinitions`, "Bushel crop definitions"), value: formatNumber(bushelCrops.length) },
  ] : [];

  let relation = tOr(`${K}.settingsPendingNotice`, "Imperial System settings have not been read yet. FarmHub's current fill-unit display is shown above.");
  if (settings) {
    if (viewerMode != null) {
      relation = tOr(`${K}.manualPriority`, "A manual fill-unit choice in FarmHub Settings takes priority on the dashboard. This page still shows the mod's own settings.");
    } else if (unitDisplay.british === true) {
      relation = tOr(`${K}.britishPriority`, "British Fill Units is also loaded. In Automatic mode it takes priority for FarmHub fill amounts; the Imperial System settings below are still readable.");
    } else if (provider && fillImperialSelected) {
      relation = tOr(`${K}.imperialActive`, "In Automatic mode FarmHub follows Imperial System's readable fill-unit choices. The game menu remains the source for its own speed, area and temperature settings.");
    } else {
      relation = tOr(`${K}.imperialMetric`, "Imperial System is loaded with metric or litre choices, so it does not currently request Imperial conversions for FarmHub fill amounts.");
    }
  }

  const settingsRows: ModKeyValue[] = settings ? [
    { key: "liquid", label: tOr(`${K}.setLiquid`, "Liquids"), value: liquid(settings.liquid) },
    { key: "crops", label: tOr(`${K}.setCrops`, "Crops and solids"), value: crops(settings.crops) },
    { key: "weight", label: tOr(`${K}.setWeight`, "Vehicle and load weight"), value: weight(settings.weight) },
    { key: "measure", label: tOr(`${K}.setMeasure`, "Lengths and widths"), value: measure(settings.measure) },
    { key: "scale", label: tOr(`${K}.setScale`, "Weight scale"), value: scale(settings.weightScale) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Imperial System adds a Unit Conversion section to the game's settings menu. It can display gallons, bushels, pounds and feet without changing stored amounts.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.relationTitle`, "How FarmHub's units follow this mod")}>
        <p>{relation}</p>
        <ModKeyValues rows={[
          { key: "provider", label: tOr(`${K}.automaticProvider`, "Automatic fill-unit provider"), value: provider ?? tOr(`${K}.noProvider`, "None detected") },
          { key: "display", label: tOr(`${K}.statFarmhubMode`, "FarmHub fill units"), value: modeName },
        ]} />
        <p class="fd-economy__muted">{tOr(`${K}.relationScope`, "FarmHub uses liquid, crop and weight-scale choices for fill amounts and prices. Lengths, speed, area and temperature have their own display settings.")}</p>
      </Card>
      <div class="fd-mod-page__grid">
        <Card title={tOr(`${K}.settingsTitle`, "Mod settings")}>
          {settings ? <ModKeyValues rows={settingsRows} /> : <ModEmpty>{tOr(`${K}.noSettings`, "Settings were not readable. They are created when a save loads.")}</ModEmpty>}
          <p class="fd-economy__muted">{tOr(`${K}.profileNote`, "These choices are stored per game profile, not per save.")}</p>
        </Card>
        <Card title={tOr(`${K}.contextTitle`, "Game unit settings")}>
          {game ? <ModKeyValues rows={[
            { key: "miles", label: tOr(`${K}.ctxMiles`, "Game uses miles"), value: yesNo(game.useMiles) },
            { key: "acre", label: tOr(`${K}.ctxAcre`, "Game uses acres"), value: yesNo(game.useAcre) },
            { key: "fahrenheit", label: tOr(`${K}.ctxFahrenheit`, "Game uses Fahrenheit"), value: yesNo(game.useFahrenheit) },
          ]} /> : <ModEmpty>{tOr(`${K}.noGameUnits`, "Game unit settings were not readable.")}</ModEmpty>}
          <p class="fd-economy__muted">{tOr(`${K}.gameSettingsSeparate`, "These are game settings. A miles, acres or temperature choice alone does not prove Imperial System changed a value.")}</p>
        </Card>
      </div>
      <div class="fd-mod-page__grid">
        <Card title={tOr(`${K}.factorDefinitionsTitle`, "Conversion factors available to the mod")}>
          {factors ? <ModKeyValues rows={[
            { key: "gallon", label: tOr(`${K}.litersPerGallon`, "Litres per US gallon"), value: factor(factors.litersPerGallon, 5) },
            { key: "bushel", label: tOr(`${K}.litersPerBushel`, "Litres per bushel"), value: factor(factors.litersPerBushel, 4) },
            { key: "pound", label: tOr(`${K}.kgPerPound`, "Kilograms per pound"), value: factor(factors.kgPerPound, 6) },
            { key: "foot", label: tOr(`${K}.metersPerFoot`, "Metres per foot"), value: factor(factors.metersPerFoot, 4) },
            { key: "ton", label: tOr(`${K}.lbsPerUsTon`, "Pounds per US ton"), value: factor(factors.lbsPerUsTon, 0) },
            { key: "density", label: tOr(`${K}.densityCount`, "Other solid density definitions"), value: formatNumber(page?.bulkDensityCount) },
          ]} /> : <ModEmpty>{tOr(`${K}.noFactors`, "Conversion factors were not readable.")}</ModEmpty>}
          <p class="fd-economy__muted">{tOr(`${K}.factorsNotUsage`, "These factors describe available conversions; they do not show that an Imperial conversion is active in the game.")}</p>
        </Card>
        <Card title={tOr(`${K}.bushelDefinitionsTitle`, "Crops with bushel definitions")}>
          {bushelCrops.length > 0 ? <p>{bushelCrops.join(", ")}</p> : <ModEmpty>{tOr(`${K}.noBushels`, "The bushel crop list was not readable.")}</ModEmpty>}
        </Card>
      </div>
      <ModAbout entry={entry} />
    </ModPage>
  );
}
