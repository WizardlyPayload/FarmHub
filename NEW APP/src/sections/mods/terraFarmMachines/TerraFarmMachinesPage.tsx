import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type MachineRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  machineType?: string;
  enabled?: boolean;
  active?: boolean;
  resourcesEnabled?: boolean;
  inputMode?: string;
  outputMode?: string;
  material?: string;
  inputAreaEnabled?: boolean;
  outputAreaEnabled?: boolean;
};

function state(value: boolean | undefined): string {
  return value === true
    ? tOr("companionPage.terraFarmMachines.on", "On")
    : tOr("companionPage.terraFarmMachines.off", "Off");
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<MachineRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "machines", label: tOr("companionPage.terraFarmMachines.machines", "Owned machines"), value: formatNumber(farmData.machineCount, 0) },
    { key: "enabled", label: tOr("companionPage.terraFarmMachines.enabledCount", "Enabled"), value: formatNumber(farmData.enabledCount, 0) },
    { key: "active", label: tOr("companionPage.terraFarmMachines.activeCount", "Active now"), value: formatNumber(farmData.activeCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.terraFarmMachines.lead", "See the current TerraFarm setup on machines owned by this farm. These are settings and live status, not excavated volume or work history.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.terraFarmMachines.tableTitle", "Owned TerraFarm machines")}>
        <ModTable
          columns={[
            { key: "machine", label: tOr("companionPage.terraFarmMachines.machine", "Machine") },
            { key: "enabled", label: tOr("companionPage.terraFarmMachines.enabled", "Enabled") },
            { key: "active", label: tOr("companionPage.terraFarmMachines.active", "Active now") },
            { key: "input", label: tOr("companionPage.terraFarmMachines.input", "Input mode") },
            { key: "output", label: tOr("companionPage.terraFarmMachines.output", "Output mode") },
            { key: "material", label: tOr("companionPage.terraFarmMachines.material", "Material") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || `${row.machineType || "machine"}-${index}`,
            cells: {
              machine: row.vehicle || row.machineType || "—",
              enabled: state(row.enabled),
              active: state(row.active),
              input: row.inputMode || "—",
              output: row.outputMode || "—",
              material: row.material || "—",
            },
          }))}
          empty={tOr("companionPage.terraFarmMachines.empty", "No TerraFarm machines owned by this farm are registered yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.terraFarmMachines.truncated", "Only part of the owned machine list is shown.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
