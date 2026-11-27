import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type WagonRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  compressionOn?: boolean;
  baseCapacityLitres?: number;
  compressedCapacityLitres?: number;
  currentCapacityLitres?: number;
  currentFillLitres?: number;
};

const litres = (value: unknown) => typeof value === "number" ? `${formatNumber(value, 0)} L` : "—";

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<WagonRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "wagons", label: tOr("companionPage.forageWagonCompression.wagons", "Owned wagons"), value: formatNumber(farmData.wagonCount, 0) },
    { key: "active", label: tOr("companionPage.forageWagonCompression.active", "Compression on"), value: formatNumber(farmData.compressionOnCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.forageWagonCompression.lead", "Current compression setting and capacity on forage wagons owned by this farm. These are capacities, not harvested volume.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.forageWagonCompression.tableTitle", "Owned forage wagons")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.forageWagonCompression.vehicle", "Wagon") },
            { key: "state", label: tOr("companionPage.forageWagonCompression.state", "Compression") },
            { key: "base", label: tOr("companionPage.forageWagonCompression.base", "Base capacity") },
            { key: "compressed", label: tOr("companionPage.forageWagonCompression.compressed", "Expanded capacity") },
            { key: "current", label: tOr("companionPage.forageWagonCompression.current", "Current capacity") },
            { key: "fill", label: tOr("companionPage.forageWagonCompression.fill", "Current load") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || "—",
              state: typeof row.compressionOn === "boolean"
                ? row.compressionOn ? tOr("companionPage.forageWagonCompression.on", "On") : tOr("companionPage.forageWagonCompression.off", "Off")
                : "—",
              base: litres(row.baseCapacityLitres),
              compressed: litres(row.compressedCapacityLitres),
              current: litres(row.currentCapacityLitres),
              fill: litres(row.currentFillLitres),
            },
          }))}
          empty={tOr("companionPage.forageWagonCompression.empty", "No owned forage wagon has readable compression state yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.forageWagonCompression.truncated", "Only the first owned wagons are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
