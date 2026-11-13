import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.tripComputer";
type TripRow = {
  farmId?: number; vehicleId?: string; vehicle?: string;
  tripKilometres?: number; tripFuelLitres?: number; tripOperatingHours?: number;
};

function measured(value: unknown, unit: string): string {
  return num(value) == null ? "—" : `${formatNumber(value, 2)} ${unit}`;
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<TripRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "supported", label: tOr(`${K}.supported`, "Owned trip computers"), value: formatNumber(farmData.supportedVehicleCount, 0) },
    { key: "nonempty", label: tOr(`${K}.nonempty`, "Trips with recorded activity"), value: formatNumber(farmData.nonemptyTripCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "Resettable trip distance, fuel used and engine time from Trip Computer on your owned vehicles. Values start again when that vehicle's trip computer is reset; they are not lifetime mileage, a fuel purchase or a cost.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Owned vehicle trips")}>
        <ModTable columns={[
          { key: "vehicle", label: tOr(`${K}.vehicle`, "Vehicle") },
          { key: "distance", label: tOr(`${K}.distance`, "Trip distance") },
          { key: "fuel", label: tOr(`${K}.fuel`, "Trip fuel used") },
          { key: "time", label: tOr(`${K}.time`, "Trip engine time") },
        ]} rows={rows.map((row, index) => ({
          key: row.vehicleId || String(index),
          cells: {
            vehicle: row.vehicle || row.vehicleId || "—",
            distance: measured(row.tripKilometres, "km"),
            fuel: measured(row.tripFuelLitres, "L"),
            time: measured(row.tripOperatingHours, "h"),
          },
        }))} empty={tOr(`${K}.empty`, "No owned vehicle has a readable trip computer.")} />
        {page?.coverage === "partial" || page?.coverage === "truncated" ? (
          <ModEmpty>{tOr(`${K}.partial`, "Some trip records were unavailable; counts are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
