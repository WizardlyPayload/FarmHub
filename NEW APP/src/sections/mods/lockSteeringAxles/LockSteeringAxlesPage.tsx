import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.lockSteeringAxles";
type Row = { farmId?: number; vehicleId?: string; vehicle?: string; steeringAxleLocked?: boolean };

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Row>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "compatible", label: tOr(`${K}.compatible`, "Owned compatible trailers"), value: formatNumber(farmData.compatibleTrailerCount, 0) },
    { key: "locked", label: tOr(`${K}.locked`, "Steering axles locked"), value: formatNumber(farmData.lockedTrailerCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current steering-axle lock on your compatible owned trailers. This is a control setting, not a measure of turning or handling performance.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Owned trailer axle locks")}>
        <ModTable columns={[
          { key: "trailer", label: tOr(`${K}.trailer`, "Trailer") },
          { key: "state", label: tOr(`${K}.state`, "Steering axle") },
        ]} rows={rows.map((row, index) => ({
          key: row.vehicleId || String(index),
          cells: {
            trailer: row.vehicle || row.vehicleId || "—",
            state: row.steeringAxleLocked === undefined ? "—" : row.steeringAxleLocked
              ? tOr(`${K}.yes`, "Locked") : tOr(`${K}.no`, "Unlocked"),
          },
        }))} empty={tOr(`${K}.empty`, "No owned compatible trailer has readable axle-lock state.")} />
        {page?.coverage === "truncated" || page?.coverage === "partial" ? (
          <ModEmpty>{tOr(`${K}.partial`, "Some trailer states were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
