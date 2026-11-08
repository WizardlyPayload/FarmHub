import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type TuneRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  parameter?: string;
  value?: number;
  default?: number;
  kind?: string;
  choice?: string;
  defaultChoice?: string;
};

const labels: Record<string, string> = {
  vol: "Engine volume", pitch: "Engine pitch", tone: "Exhaust tone",
  power: "Power multiplier", revLimit: "Rev limit multiplier",
  topSpeed: "Top speed multiplier", fuelUse: "Fuel use multiplier",
  turbo: "Turbo choice", bov: "Blow-off choice", smoke: "Smoke choice",
};

function settingLabel(id: string | undefined): string {
  if (!id) return "—";
  return labels[id] || id.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

function settingValue(row: TuneRow, defaultValue: boolean): string {
  const n = defaultValue ? row.default : row.value;
  const choice = defaultValue ? row.defaultChoice : row.choice;
  if (row.kind === "choice") return choice || (n === undefined ? "—" : String(n));
  return n === undefined ? "—" : formatNumber(n, 2);
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<TuneRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "vehicles", label: tOr("companionPage.universalSoundTuner.vehicles", "Supported owned vehicles"), value: formatNumber(farmData.supportedVehicleCount, 0) },
    { key: "changedVehicles", label: tOr("companionPage.universalSoundTuner.changedVehicles", "Vehicles with custom tunes"), value: formatNumber(farmData.changedVehicleCount, 0) },
    { key: "changes", label: tOr("companionPage.universalSoundTuner.changes", "Custom tune settings"), value: formatNumber(farmData.changedSettingCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.universalSoundTuner.lead", "Current nondefault tune settings on owned vehicles. Performance multipliers are configured choices, not measured power, speed or fuel use.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.universalSoundTuner.tableTitle", "Owned vehicle tune changes")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.universalSoundTuner.vehicle", "Vehicle") },
            { key: "parameter", label: tOr("companionPage.universalSoundTuner.setting", "Setting") },
            { key: "value", label: tOr("companionPage.universalSoundTuner.value", "Configured") },
            { key: "default", label: tOr("companionPage.universalSoundTuner.default", "Default") },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.vehicleId || index}:${row.parameter || index}`,
            cells: {
              vehicle: row.vehicle || row.vehicleId || "—",
              parameter: settingLabel(row.parameter),
              value: settingValue(row, false),
              default: settingValue(row, true),
            },
          }))}
          empty={tOr("companionPage.universalSoundTuner.empty", "No owned vehicle has a readable nondefault tune.")}
        />
        {page?.coverage === "truncated" || page?.coverage === "partial" ? (
          <ModEmpty>{tOr("companionPage.universalSoundTuner.partial", "Some tune settings were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
