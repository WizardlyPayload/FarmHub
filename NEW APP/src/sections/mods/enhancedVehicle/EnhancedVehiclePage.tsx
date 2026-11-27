import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps,
} from "@/sections/mods/shared";

type DistanceRow = {
  farmId?: number;
  id?: string;
  vehicle?: string;
  odoKm?: number;
  tripKm?: number;
  hudMode?: "odometer" | "trip";
};

function distance(km: unknown): string {
  return num(km) == null ? "—" : tOr("companionPage.enhancedVehicle.km", "{{value}} km", { value: formatNumber(km, 2) });
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<DistanceRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  return (
    <ModPage entry={entry} lead={tOr("companionPage.enhancedVehicle.lead", "EnhancedVehicle's own saved odometer and trip readings for vehicles this farm currently owns. They are separate from Vehicle Mileage and cannot be added to it.")}>
      <ModStatTiles tiles={farmData ? [
        { key: "tracked", label: tOr("companionPage.enhancedVehicle.tracked", "Vehicles tracked"), value: formatNumber(farmData.trackedCount, 0) },
      ] : []} />
      <Card title={tOr("companionPage.enhancedVehicle.tableTitle", "EnhancedVehicle distance register")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.enhancedVehicle.vehicle", "Vehicle") },
            { key: "odo", label: tOr("companionPage.enhancedVehicle.odo", "Odometer"), align: "end" },
            { key: "trip", label: tOr("companionPage.enhancedVehicle.trip", "Trip"), align: "end" },
            { key: "hud", label: tOr("companionPage.enhancedVehicle.hud", "HUD selection") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.id || String(index),
            cells: {
              vehicle: row.vehicle || "—",
              odo: distance(row.odoKm),
              trip: distance(row.tripKm),
              hud: row.hudMode === "trip" ? tOr("companionPage.enhancedVehicle.trip", "Trip") : tOr("companionPage.enhancedVehicle.odo", "Odometer"),
            },
          }))}
          empty={tOr("companionPage.enhancedVehicle.empty", "No EnhancedVehicle odometer is readable for this farm yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.enhancedVehicle.truncated", "Only the first tracked vehicles are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
