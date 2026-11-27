import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type CombineRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  machineType?: string;
  packageLevel?: number;
  mode?: "AUTO" | "MANUAL";
  autoSwitch?: boolean;
  tuningCrop?: string;
  calibrated?: boolean;
  fan?: number;
  upperSieve?: number;
  lowerSieve?: number;
  rotor?: number;
  feeder?: number;
  targetEngineLoad?: number;
};

// Realistic Harvesting v1.6.0.0 RHM_UnitConverter.PHYSICAL_RANGES.
// Its in-game panel formats these settings in RPM/mm, while memory stores percentages.
const physicalRanges: Record<string, Partial<Record<"fan" | "rotor" | "upperSieve" | "lowerSieve" | "feeder", [number, number, number, string]>>> = {
  grain: { fan: [300, 1200, 10, "RPM"], rotor: [200, 1100, 10, "RPM"], upperSieve: [0, 30, 1, "mm"], lowerSieve: [0, 25, 1, "mm"], feeder: [0, 50, 1, "mm"] },
  forage: { fan: [800, 1500, 10, "RPM"], rotor: [1000, 1200, 10, "RPM"], feeder: [200, 600, 10, "RPM"] },
  root: { fan: [400, 1000, 10, "RPM"], rotor: [100, 350, 10, "RPM"], feeder: [100, 400, 10, "RPM"] },
  cotton: { fan: [2500, 4000, 10, "RPM"], rotor: [150, 250, 10, "RPM"], feeder: [100, 300, 10, "RPM"] },
  grape: { fan: [800, 1600, 10, "RPM"], rotor: [350, 550, 5, "RPM"], feeder: [50, 150, 5, "RPM"] },
  olive: { fan: [800, 1600, 10, "RPM"], rotor: [400, 650, 5, "RPM"], feeder: [50, 150, 5, "RPM"] },
};

function displayedSetting(row: CombineRow, field: keyof CombineRow, value: number): string {
  if (field === "targetEngineLoad") return `${formatNumber(value, 0)}%`;
  const range = physicalRanges[row.machineType || ""]?.[field as keyof typeof physicalRanges.grain];
  if (!range || value < 0 || value > 100) return `${formatNumber(value, 0)}%`;
  const [min, max, step, unit] = range;
  const physical = Math.floor((min + (max - min) * value / 100) / step + 0.5) * step;
  return `${formatNumber(physical, 0)} ${unit}`;
}

function tuning(row: CombineRow): string {
  const params: Array<[keyof CombineRow, string, string]> = [
    ["fan", "fan", "Fan"],
    ["rotor", "rotor", "Rotor"],
    ["upperSieve", "upperSieve", "Upper sieve"],
    ["lowerSieve", "lowerSieve", "Lower sieve"],
    ["feeder", "feeder", "Feeder"],
    ["targetEngineLoad", "targetLoad", "Target load"],
  ];
  return params.flatMap(([field, key, fallback]) => {
    const value = num(row[field]);
    return value === null ? [] : [`${tOr(`companionPage.realisticHarvesting.${key}`, fallback)} ${displayedSetting(row, field, value)}`];
  }).join(" · ") || "—";
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<CombineRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "combines", label: tOr("companionPage.realisticHarvesting.combines", "Combines with tuning memory"), value: formatNumber(farmData.combineCount, 0) },
    { key: "calibrated", label: tOr("companionPage.realisticHarvesting.calibrated", "Marked calibrated"), value: formatNumber(farmData.calibratedCount, 0) },
    { key: "auto", label: tOr("companionPage.realisticHarvesting.auto", "Auto mode"), value: formatNumber(farmData.autoCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.realisticHarvesting.lead", "Current tuning memory for combines owned by this farm. A stored crop or calibration flag does not prove an active harvest, crop yield or loss.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.realisticHarvesting.tableTitle", "Owned combine tuning")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.realisticHarvesting.vehicle", "Combine") },
            { key: "type", label: tOr("companionPage.realisticHarvesting.type", "Type") },
            { key: "package", label: tOr("companionPage.realisticHarvesting.package", "Package") },
            { key: "mode", label: tOr("companionPage.realisticHarvesting.mode", "Mode") },
            { key: "crop", label: tOr("companionPage.realisticHarvesting.crop", "Tuning crop") },
            { key: "status", label: tOr("companionPage.realisticHarvesting.status", "Calibration") },
            { key: "tuning", label: tOr("companionPage.realisticHarvesting.tuning", "Settings") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || row.vehicleId || "—",
              type: row.machineType || "—",
              package: formatNumber(row.packageLevel, 0),
              mode: row.mode === "AUTO"
                ? tOr("companionPage.realisticHarvesting.modeAuto", "Auto")
                : tOr("companionPage.realisticHarvesting.modeManual", "Manual"),
              crop: row.tuningCrop || tOr("companionPage.realisticHarvesting.noCrop", "None selected"),
              status: [
                row.calibrated
                  ? tOr("companionPage.realisticHarvesting.yes", "Marked calibrated")
                  : tOr("companionPage.realisticHarvesting.no", "Not calibrated"),
                row.autoSwitch
                  ? tOr("companionPage.realisticHarvesting.switchOn", "Auto switch on")
                  : tOr("companionPage.realisticHarvesting.switchOff", "Auto switch off"),
              ].join(" · "),
              tuning: tuning(row),
            },
          }))}
          empty={tOr("companionPage.realisticHarvesting.empty", "No owned combine has readable Realistic Harvesting tuning memory.")}
        />
        {page?.coverage === "truncated" || page?.coverage === "partial" ? (
          <ModEmpty>{tOr("companionPage.realisticHarvesting.partial", "Some combine memories were unavailable; farm totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
