import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.harvestoreConveyor";
type Row = {
  farmId?: number; placeableId?: string; silo?: string; fillType?: string;
  inTransitLitres?: number; batchCount?: number; nextDeliverySeconds?: number;
  running?: boolean;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Row>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const queuedRows = rows.filter((row) => (num(row.inTransitLitres) || 0) > 0);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" && queuedRows.length > 0 ? [
    { key: "loaded", label: tOr(`${K}.loaded`, "Conveyors with material queued"), value: formatNumber(farmData.loadedConveyorCount, 0) },
    { key: "litres", label: tOr(`${K}.litres`, "Material in transit"), value: `${formatNumber(farmData.inTransitLitres, 0)} L` },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current material queued inside your Harvestore conveyors. It has left silo storage and has not yet reached a receiving trailer; this is not a delivery record.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Harvestore conveyor queue")}>
        <ModTable columns={[
          { key: "silo", label: tOr(`${K}.silo`, "Silo") },
          { key: "material", label: tOr(`${K}.material`, "Material") },
          { key: "queued", label: tOr(`${K}.queued`, "In transit") },
          { key: "batches", label: tOr(`${K}.batches`, "Batches") },
          { key: "next", label: tOr(`${K}.next`, "Next batch due") },
          { key: "state", label: tOr(`${K}.state`, "Conveyor") },
        ]} rows={queuedRows.map((row, index) => ({
          key: row.placeableId || String(index),
          cells: {
            silo: row.silo || row.placeableId || "—",
            material: row.fillType || "—",
            queued: row.inTransitLitres == null ? "—" : `${formatNumber(row.inTransitLitres, 0)} L`,
            batches: row.batchCount == null ? "—" : formatNumber(row.batchCount, 0),
            next: row.nextDeliverySeconds == null ? "—" : `${formatNumber(row.nextDeliverySeconds, 1)} s`,
            state: row.running ? tOr(`${K}.running`, "Running") : tOr(`${K}.idle`, "Idle"),
          },
        }))} empty={tOr(`${K}.emptyQueue`, "No material is queued in an owned Harvestore conveyor.")} />
        {page?.coverage === "partial" || page?.coverage === "truncated" ? (
          <ModEmpty>{tOr(`${K}.partial`, "Some conveyor readings were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
