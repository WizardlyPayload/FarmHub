import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.hudPlus";
type Row = {
  farmId?: number; vehicleId?: string; vehicle?: string;
  totalDistanceMeters?: number; tripDistanceMeters?: number; tripFuelUsedLiters?: number;
};

function distance(meters: unknown): string {
  const n = num(meters);
  return n === null ? "—" : `${formatNumber(n / 1000, 2)} km`;
}

function fuel(liters: unknown): string {
  const n = num(liters);
  return n === null ? "—" : `${formatNumber(n, 2)} L`;
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Row>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "vehicles", label: tOr(`${K}.vehicles`, "Supported owned vehicles"), value: formatNumber(farmData.supportedVehicleCount, 0) },
    { key: "trips", label: tOr(`${K}.trips`, "Vehicles with nonzero trip counters"), value: formatNumber(farmData.nonzeroTripCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "HUD+ vehicle-attached distance and resettable trip counters for currently owned vehicles. These mod-calculated values may predate ownership; trip fuel is not a fuel purchase or expense.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Owned vehicle trip counters")}>
        <ModTable columns={[
          { key: "vehicle", label: tOr(`${K}.vehicle`, "Vehicle") },
          { key: "total", label: tOr(`${K}.total`, "Total distance"), align: "end" },
          { key: "trip", label: tOr(`${K}.trip`, "Trip distance"), align: "end" },
          { key: "fuel", label: tOr(`${K}.fuel`, "Trip fuel used"), align: "end" },
        ]} rows={rows.map((row, index) => ({
          key: row.vehicleId || String(index),
          cells: {
            vehicle: row.vehicle || row.vehicleId || "—",
            total: distance(row.totalDistanceMeters),
            trip: distance(row.tripDistanceMeters),
            fuel: fuel(row.tripFuelUsedLiters),
          },
        }))} empty={tOr(`${K}.empty`, "No owned vehicle has readable HUD+ trip counters.")} />
        {page?.coverage === "truncated" || page?.coverage === "partial" ? (
          <ModEmpty>{tOr(`${K}.partial`, "Some vehicle counters were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
