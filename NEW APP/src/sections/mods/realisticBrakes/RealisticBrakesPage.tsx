import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.realisticBrakes";
type Row = {
  farmId?: number; vehicleId?: string; vehicle?: string;
  brakeDamageFraction?: number; brakeTempC?: number; parkBrakeOn?: boolean;
};

function damage(value: unknown): string {
  const n = num(value);
  return n === null ? "—" : `${formatNumber(n * 100, 1)}%`;
}

function temperature(value: unknown): string {
  const n = num(value);
  return n === null ? "—" : `${formatNumber(n, 1)} °C`;
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Row>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "vehicles", label: tOr(`${K}.vehicles`, "Supported owned vehicles"), value: formatNumber(farmData.supportedVehicleCount, 0) },
    { key: "damaged", label: tOr(`${K}.damaged`, "Vehicles with permanent brake damage"), value: formatNumber(farmData.damagedVehicleCount, 0) },
    { key: "parked", label: tOr(`${K}.parked`, "Parking brakes engaged at last reading"), value: formatNumber(farmData.parkedVehicleCount, 0) },
  ] : [];
  const park = (value: boolean | undefined) => value === undefined ? "—"
    : value ? tOr(`${K}.on`, "Engaged") : tOr(`${K}.off`, "Released");
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Realistic Brakes condition from the last game export for owned vehicles. Permanent brake damage is the mod's brake-force reduction, separate from base-game vehicle damage. Temperature and parking brake can change before the next export; check the reading time. These values do not establish a braking event or service history.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Owned vehicle brake condition at last reading")}>
        <ModTable columns={[
          { key: "vehicle", label: tOr(`${K}.vehicle`, "Vehicle") },
          { key: "damage", label: tOr(`${K}.damage`, "Permanent brake damage"), align: "end" },
          { key: "temp", label: tOr(`${K}.temp`, "Brake temperature"), align: "end" },
          { key: "park", label: tOr(`${K}.park`, "Parking brake") },
        ]} rows={rows.map((row, index) => ({
          key: row.vehicleId || String(index),
          cells: {
            vehicle: row.vehicle || row.vehicleId || "—",
            damage: damage(row.brakeDamageFraction),
            temp: temperature(row.brakeTempC),
            park: park(row.parkBrakeOn),
          },
        }))} empty={tOr(`${K}.empty`, "No owned vehicle has readable Realistic Brakes state.")} />
        {page?.coverage === "truncated" || page?.coverage === "partial" ? (
          <ModEmpty>{tOr(`${K}.partial`, "Some brake states were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
