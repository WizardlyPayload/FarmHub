import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type DepthRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  enabled?: boolean;
  controlMode?: "WHEELS" | "HITCH";
  setpointPercent?: number;
  calibrated?: boolean;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<DepthRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "implements", label: tOr("companionPage.variableWorkingDepth.implements", "Supported owned implements"), value: formatNumber(farmData.implementCount, 0) },
    { key: "enabled", label: tOr("companionPage.variableWorkingDepth.enabledCount", "Variable depth enabled"), value: formatNumber(farmData.enabledCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.variableWorkingDepth.lead", "Current variable-depth controls for owned implements. Setpoint is a control percentage, not measured field depth or completed cultivation.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.variableWorkingDepth.tableTitle", "Owned implement depth controls")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.variableWorkingDepth.vehicle", "Implement") },
            { key: "mode", label: tOr("companionPage.variableWorkingDepth.mode", "Control") },
            { key: "setpoint", label: tOr("companionPage.variableWorkingDepth.setpoint", "Setpoint"), align: "end" },
            { key: "status", label: tOr("companionPage.variableWorkingDepth.status", "Status") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || row.vehicleId || "—",
              mode: row.controlMode === "WHEELS"
                ? tOr("companionPage.variableWorkingDepth.wheels", "Wheels")
                : tOr("companionPage.variableWorkingDepth.hitch", "Hitch"),
              setpoint: num(row.setpointPercent) === null ? "—"
                : `${formatNumber(row.setpointPercent, 1)}%`,
              status: [
                row.enabled
                  ? tOr("companionPage.variableWorkingDepth.on", "Enabled")
                  : tOr("companionPage.variableWorkingDepth.off", "Disabled"),
                row.calibrated
                  ? tOr("companionPage.variableWorkingDepth.calibrated", "Calibrated")
                  : tOr("companionPage.variableWorkingDepth.uncalibrated", "Not calibrated"),
              ].join(" · "),
            },
          }))}
          empty={tOr("companionPage.variableWorkingDepth.empty", "No owned supported implement has readable variable-depth controls.")}
        />
        {page?.coverage === "truncated" || page?.coverage === "partial" ? (
          <ModEmpty>{tOr("companionPage.variableWorkingDepth.partial", "Some implement depth controls were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
