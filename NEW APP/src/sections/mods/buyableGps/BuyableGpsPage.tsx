import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.buyableGps";
type Row = { farmId?: number; vehicleId?: string; vehicle?: string; gpsInstalled?: boolean };

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Row>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "configurable", label: tOr(`${K}.configurable`, "Owned vehicles with GPS option"), value: formatNumber(farmData.configurableVehicleCount, 0) },
    { key: "installed", label: tOr(`${K}.installed`, "GPS installed"), value: formatNumber(farmData.gpsInstalledCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Purchased GPS configuration on your owned vehicles. This does not measure steering use, field coverage or borrowed contract equipment.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Owned vehicle GPS options")}>
        <ModTable columns={[
          { key: "vehicle", label: tOr(`${K}.vehicle`, "Vehicle") },
          { key: "gps", label: tOr(`${K}.gps`, "GPS option") },
        ]} rows={rows.map((row, index) => ({
          key: row.vehicleId || String(index),
          cells: {
            vehicle: row.vehicle || row.vehicleId || "—",
            gps: row.gpsInstalled === undefined ? "—" : row.gpsInstalled
              ? tOr(`${K}.yes`, "Installed") : tOr(`${K}.no`, "Not installed"),
          },
        }))} empty={tOr(`${K}.empty`, "No owned vehicle has a readable Buyable GPS configuration.")} />
        {page?.coverage === "truncated" || page?.coverage === "partial" ? (
          <ModEmpty>{tOr(`${K}.partial`, "Some vehicle configurations were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
