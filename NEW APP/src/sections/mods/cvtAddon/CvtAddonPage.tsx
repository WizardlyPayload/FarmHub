import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.cvtAddon";
type VehicleRow = {
  farmId?: number; vehicleId?: string; vehicle?: string;
  transmissionWearPercent?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<VehicleRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "configured", label: tOr(`${K}.configured`, "Owned CVT configured vehicles"), value: formatNumber(farmData.configuredVehicleCount, 0) },
    { key: "worn", label: tOr(`${K}.worn`, "Vehicles with CVT wear"), value: formatNumber(farmData.vehiclesWithWearCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "CVT Addon's current transmission wear on your owned vehicles with its CVT option enabled. This is the mod's condition reading, not a repair cost or service record.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Owned vehicle CVT condition")}>
        <ModTable columns={[
          { key: "vehicle", label: tOr(`${K}.vehicle`, "Vehicle") },
          { key: "wear", label: tOr(`${K}.wear`, "CVT wear") },
        ]} rows={rows.map((row, index) => ({
          key: row.vehicleId || String(index),
          cells: {
            vehicle: row.vehicle || row.vehicleId || "—",
            wear: num(row.transmissionWearPercent) == null
              ? "—" : `${formatNumber(row.transmissionWearPercent, 1)}%`,
          },
        }))} empty={tOr(`${K}.empty`, "No owned CVT configured vehicle has readable transmission wear.")} />
        {page?.coverage === "partial" || page?.coverage === "truncated" ? (
          <ModEmpty>{tOr(`${K}.partial`, "Some CVT readings were unavailable; counts are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
