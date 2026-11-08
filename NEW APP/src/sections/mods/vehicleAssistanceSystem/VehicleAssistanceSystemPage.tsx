import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type AssistanceRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  intelligentCruise?: boolean;
  automaticLowBeam?: boolean;
  automaticHighBeam?: boolean;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<AssistanceRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "vehicles", label: tOr("companionPage.vehicleAssistanceSystem.vehicles", "Supported owned vehicles"), value: formatNumber(farmData.vehicleCount, 0) },
    { key: "cruise", label: tOr("companionPage.vehicleAssistanceSystem.cruiseCount", "Intelligent cruise enabled"), value: formatNumber(farmData.cruiseEnabledCount, 0) },
    { key: "lowBeam", label: tOr("companionPage.vehicleAssistanceSystem.lowBeamCount", "Automatic low beam enabled"), value: formatNumber(farmData.lowBeamEnabledCount, 0) },
    { key: "highBeam", label: tOr("companionPage.vehicleAssistanceSystem.highBeamCount", "Automatic high beam enabled"), value: formatNumber(farmData.highBeamEnabledCount, 0) },
  ] : [];
  const state = (value: boolean | undefined) => value === undefined
    ? tOr("companionPage.vehicleAssistanceSystem.unsupported", "Unavailable")
    : value ? tOr("companionPage.vehicleAssistanceSystem.on", "Enabled")
      : tOr("companionPage.vehicleAssistanceSystem.off", "Disabled");

  return (
    <ModPage entry={entry} lead={tOr("companionPage.vehicleAssistanceSystem.lead", "Current saved assistance controls on owned vehicles. These settings do not prove a braking, lighting or cruise event occurred.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.vehicleAssistanceSystem.tableTitle", "Owned vehicle assistance controls")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.vehicleAssistanceSystem.vehicle", "Vehicle") },
            { key: "cruise", label: tOr("companionPage.vehicleAssistanceSystem.cruise", "Intelligent cruise") },
            { key: "lowBeam", label: tOr("companionPage.vehicleAssistanceSystem.lowBeam", "Automatic low beam") },
            { key: "highBeam", label: tOr("companionPage.vehicleAssistanceSystem.highBeam", "Automatic high beam") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || row.vehicleId || "—",
              cruise: state(row.intelligentCruise),
              lowBeam: state(row.automaticLowBeam),
              highBeam: state(row.automaticHighBeam),
            },
          }))}
          empty={tOr("companionPage.vehicleAssistanceSystem.empty", "No owned vehicle has readable assistance controls.")}
        />
        {page?.coverage === "truncated" || page?.coverage === "partial" ? (
          <ModEmpty>{tOr("companionPage.vehicleAssistanceSystem.partial", "Some vehicle control states were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
