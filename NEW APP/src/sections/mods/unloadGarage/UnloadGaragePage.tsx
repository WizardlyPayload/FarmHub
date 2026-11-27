import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.unloadGarage";
type Garage = { farmId?: number; garageId?: string; garage?: string; storedVehicles?: number; slots?: number };
type Vehicle = {
  farmId?: number; garageId?: string; entryId?: number; garage?: string; vehicle?: string;
  operatingHoursAtStorage?: number; storedAtGameHour?: number;
};

function quantity(value: unknown, digits = 0): string {
  const n = num(value);
  return n === null ? "—" : formatNumber(n, digits);
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const garages = asList<Garage>(page?.garages).filter((row) => num(row.farmId) === farmId);
  const vehicles = asList<Vehicle>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "garages", label: tOr(`${K}.garages`, "Owned unload garages"), value: quantity(farmData.garageCount) },
    { key: "stored", label: tOr(`${K}.stored`, "Vehicles stored in them"), value: quantity(farmData.storedVehicleCount) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Vehicles currently held in this farm's Unload Garages. Operating time and storage time are snapshots from when each vehicle was put away. This does not prove the vehicle was driven or used while stored.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.garageTitle`, "Garage spaces")}>
        <ModTable columns={[
          { key: "garage", label: tOr(`${K}.garage`, "Garage") },
          { key: "used", label: tOr(`${K}.used`, "Stored / slots"), align: "end" },
        ]} rows={garages.map((garage, index) => ({
          key: garage.garageId || String(index),
          cells: {
            garage: garage.garage || "—",
            used: `${quantity(garage.storedVehicles)} / ${garage.slots === 0 ? tOr(`${K}.unlimited`, "Unlimited") : quantity(garage.slots)}`,
          },
        }))} empty={tOr(`${K}.emptyGarages`, "No owned unload garage has readable spaces.")} />
      </Card>
      <Card title={tOr(`${K}.vehicleTitle`, "Stored vehicles")}>
        <ModTable columns={[
          { key: "garage", label: tOr(`${K}.garage`, "Garage") },
          { key: "vehicle", label: tOr(`${K}.vehicle`, "Vehicle") },
          { key: "hours", label: tOr(`${K}.hours`, "Operating hours when stored"), align: "end" },
          { key: "storedAt", label: tOr(`${K}.storedAt`, "Stored at game hour"), align: "end" },
        ]} rows={vehicles.map((vehicle, index) => ({
          key: `${vehicle.garageId || index}-${vehicle.entryId || index}`,
          cells: {
            garage: vehicle.garage || "—", vehicle: vehicle.vehicle || "—",
            hours: quantity(vehicle.operatingHoursAtStorage, 1),
            storedAt: quantity(vehicle.storedAtGameHour, 1),
          },
        }))} empty={tOr(`${K}.emptyVehicles`, "No vehicles are recorded in this farm's unload garages.")} />
      </Card>
      {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned garage register was scanned or displayed.")}</ModEmpty> : null}
      {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "An owned garage or stored vehicle had ambiguous ownership or unreadable data and was withheld.")}</ModEmpty> : null}
    </ModPage>
  );
}
