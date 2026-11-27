import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.soilCompaction";
type Row = {
  farmId?: number; parcelId?: number; fieldName?: string; cellCount?: number;
  averagePenalty?: number; maxPenalty?: number; hotspotX?: number; hotspotZ?: number;
};

function percent(value: unknown): string {
  const n = num(value);
  return n === null ? "—" : `${formatNumber(n, 1)}%`;
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Row>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const age = num(farmData?.snapshotAgeMs);
  const tiles: ModStatTile[] = farmData ? [
    { key: "parcels", label: tOr(`${K}.affectedParcels`, "Owned parcels with compaction"), value: formatNumber(farmData.affectedParcels, 0) },
    { key: "cells", label: tOr(`${K}.affectedCells`, "Compacted grid cells"), value: formatNumber(farmData.affectedCells, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Start with the most compacted owned field when planning soil relief. These are grid snapshots, not measured harvest losses.")}>
      <ModStatTiles tiles={tiles} />
      {age !== null ? <p>{tOr(`${K}.snapshotAge`, "Grid snapshot age at export")}: {formatNumber(age / 1000, 0)} s</p> : null}
      <Card title={tOr(`${K}.tableTitle`, "Owned ground to relieve") }>
        <ModTable
          columns={[
            { key: "field", label: tOr(`${K}.field`, "Field or parcel") },
            { key: "max", label: tOr(`${K}.maxPenalty`, "Highest yield penalty in grid"), align: "end" },
            { key: "average", label: tOr(`${K}.averagePenalty`, "Average on affected cells"), align: "end" },
            { key: "cells", label: tOr(`${K}.cells`, "Affected cells"), align: "end" },
            { key: "location", label: tOr(`${K}.location`, "Worst cell centre (x, z)") },
          ]}
          rows={rows.map((row, index) => ({
            key: String(row.parcelId ?? index),
            cells: {
              field: row.fieldName || `${tOr(`${K}.parcel`, "Parcel")} ${formatNumber(row.parcelId, 0)}`,
              max: percent(row.maxPenalty),
              average: percent(row.averagePenalty),
              cells: formatNumber(row.cellCount, 0),
              location: num(row.hotspotX) === null || num(row.hotspotZ) === null ? "—"
                : `${formatNumber(row.hotspotX, 1)}, ${formatNumber(row.hotspotZ, 1)} m`,
            },
          }))}
          empty={page?.readState === "pending"
            ? tOr(`${K}.scanning`, "The soil grid is still being scanned. No partial totals are shown.")
            : page?.readState === "failed"
              ? tOr(`${K}.unavailable`, "The soil grid could not be read safely. No total is shown.")
              : tOr(`${K}.empty`, "No compaction was found on this farm's field ground in the completed grid scan.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only the worst 60 parcels are listed; the totals cover every scanned parcel.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
