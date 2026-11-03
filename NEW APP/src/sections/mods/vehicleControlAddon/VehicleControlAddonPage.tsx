import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type VehicleRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  guidanceOn?: boolean;
  guidanceSpacingM?: number;
  speedLimiterOn?: boolean;
  manualDifferential?: boolean;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<VehicleRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const yes = tOr("companionPage.vehicleControlAddon.on", "On");
  const no = tOr("companionPage.vehicleControlAddon.off", "Off");
  const tiles: ModStatTile[] = farmData ? [
    { key: "vehicles", label: tOr("companionPage.vehicleControlAddon.vehicles", "Owned VCA vehicles"), value: formatNumber(farmData.vehicleCount, 0) },
    { key: "guidance", label: tOr("companionPage.vehicleControlAddon.guidanceCount", "Guidance on"), value: formatNumber(farmData.guidanceOnCount, 0) },
    { key: "limiter", label: tOr("companionPage.vehicleControlAddon.limiterCount", "Limiters on"), value: formatNumber(farmData.speedLimiterOnCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.vehicleControlAddon.lead", "Current Vehicle Control Addon settings on vehicles owned by this farm. These switches and guidance spacing are not driving or fieldwork history.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.vehicleControlAddon.tableTitle", "Owned vehicle controls")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.vehicleControlAddon.vehicle", "Vehicle") },
            { key: "guidance", label: tOr("companionPage.vehicleControlAddon.guidance", "Guidance") },
            { key: "spacing", label: tOr("companionPage.vehicleControlAddon.spacing", "Guidance spacing"), align: "end" },
            { key: "limiter", label: tOr("companionPage.vehicleControlAddon.limiter", "Speed limiter") },
            { key: "differential", label: tOr("companionPage.vehicleControlAddon.differential", "Manual differential") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || "—",
              guidance: row.guidanceOn === true ? yes : no,
              spacing: num(row.guidanceSpacingM) === null ? "—" : `${formatNumber(row.guidanceSpacingM, 2)} m`,
              limiter: row.speedLimiterOn === true ? yes : no,
              differential: row.manualDifferential === true ? yes : no,
            },
          }))}
          empty={tOr("companionPage.vehicleControlAddon.empty", "No owned vehicle has a readable Vehicle Control Addon state yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.vehicleControlAddon.truncated", "Only the first owned vehicles are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
