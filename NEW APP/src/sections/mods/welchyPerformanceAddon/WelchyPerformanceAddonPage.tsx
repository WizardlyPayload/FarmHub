import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type TuningRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  parameter?: string;
  label?: string;
  value?: number;
  default?: number;
  unit?: string;
  choice?: string;
  defaultChoice?: string;
};

function compact(value: number, decimals: number): string {
  return formatNumber(value, decimals).replace(/([.,]\d*?)0+$/, "$1").replace(/[.,]$/, "");
}

function settingValue(row: TuningRow, useDefault: boolean): string {
  const value = useDefault ? row.default : row.value;
  const choice = useDefault ? row.defaultChoice : row.choice;
  if (choice) return choice;
  if (value === undefined) return "—";
  switch (row.unit) {
    case "redline": return value === 0 ? "Vehicle default" : `${formatNumber(value, 0)} RPM`;
    case "rpm": return value === 0 ? "Adaptive" : `${formatNumber(value, 0)} RPM`;
    case "percent": return `${formatNumber(value * 100, 0)}%`;
    case "parkingPercent": return `${formatNumber(value, 0)}%`;
    case "heatSeconds": return value === 0 ? "Off (immediate flames)" : `${compact(value / 1000, 2)} s`;
    case "seconds": return value === 0 ? "Off (instant throttle)" : `${compact(value / 1000, 2)} s`;
    case "multiplier": return value === 0 ? "Off" : `${compact(value, 2)}×`;
    case "ms": return `${formatNumber(value, 0)} ms`;
    case "m": return `${compact(value, 2)} m`;
    default: return compact(value, 2);
  }
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<TuningRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "vehicles", label: tOr("companionPage.welchyPerformanceAddon.vehicles", "Supported owned vehicles"), value: formatNumber(farmData.supportedVehicleCount, 0) },
    { key: "changedVehicles", label: tOr("companionPage.welchyPerformanceAddon.changedVehicles", "Vehicles with custom settings"), value: formatNumber(farmData.changedVehicleCount, 0) },
    { key: "changes", label: tOr("companionPage.welchyPerformanceAddon.changes", "Custom settings"), value: formatNumber(farmData.changedSettingCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.welchyPerformanceAddon.lead", "Current nondefault Welchy settings on owned vehicles. These are configured choices, not measured power, acceleration or fuel use.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.welchyPerformanceAddon.tableTitle", "Owned vehicle performance settings")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.welchyPerformanceAddon.vehicle", "Vehicle") },
            { key: "setting", label: tOr("companionPage.welchyPerformanceAddon.setting", "Setting") },
            { key: "value", label: tOr("companionPage.welchyPerformanceAddon.value", "Configured") },
            { key: "default", label: tOr("companionPage.welchyPerformanceAddon.default", "Default") },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.vehicleId || index}:${row.parameter || index}`,
            cells: {
              vehicle: row.vehicle || row.vehicleId || "—",
              setting: row.label || row.parameter || "—",
              value: settingValue(row, false),
              default: settingValue(row, true),
            },
          }))}
          empty={tOr("companionPage.welchyPerformanceAddon.empty", "No owned vehicle has a readable nondefault Welchy setting.")}
        />
        {page?.coverage === "truncated" || page?.coverage === "partial" ? (
          <ModEmpty>{tOr("companionPage.welchyPerformanceAddon.partial", "Some vehicle settings were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
