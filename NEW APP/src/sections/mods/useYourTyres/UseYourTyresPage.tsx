import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type TyreRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  wheelIndex?: number;
  distanceKm?: number;
  wearPct?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<TyreRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "vehicles", label: tOr("companionPage.useYourTyres.vehicles", "Vehicles with tyre readings"), value: formatNumber(farmData.vehicleCount, 0) },
    { key: "wheels", label: tOr("companionPage.useYourTyres.wheels", "Active wheels read"), value: formatNumber(farmData.wheelCount, 0) },
    { key: "maxWear", label: tOr("companionPage.useYourTyres.maxWear", "Highest calculated wear"), value: `${formatNumber(farmData.maxWearPct, 1)}%` },
    { key: "multiplier", label: tOr("companionPage.useYourTyres.multiplier", "Tyre distance multiplier"), value: `${formatNumber(page?.multiplier, 1)}×` },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.useYourTyres.lead", "Travel recorded by each active wheel on vehicles owned by this farm. Wear uses the mod's current distance multiplier; it does not establish a tyre replacement or distance driven by the vehicle.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.useYourTyres.tableTitle", "Active wheel readings")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.useYourTyres.vehicle", "Vehicle") },
            { key: "wheel", label: tOr("companionPage.useYourTyres.wheel", "Wheel") },
            { key: "distance", label: tOr("companionPage.useYourTyres.distance", "Wheel travel"), align: "end" },
            { key: "wear", label: tOr("companionPage.useYourTyres.wear", "Calculated wear"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.vehicleId || index}:${row.wheelIndex || 0}`,
            cells: {
              vehicle: row.vehicle || row.vehicleId || "—",
              wheel: formatNumber(row.wheelIndex, 0),
              distance: num(row.distanceKm) === null ? "—" : tOr("companionPage.useYourTyres.km", "{{distance}} km", { distance: formatNumber(row.distanceKm, 1) }),
              wear: num(row.wearPct) === null ? "—" : `${formatNumber(row.wearPct, 1)}%`,
            },
          }))}
          empty={tOr("companionPage.useYourTyres.empty", "No current owned vehicle has a readable active tyre set.")}
        />
        {page?.coverage === "truncated" || page?.coverage === "partial" ? (
          <ModEmpty>{tOr("companionPage.useYourTyres.partial", "Some wheel readings were unavailable; farm totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
