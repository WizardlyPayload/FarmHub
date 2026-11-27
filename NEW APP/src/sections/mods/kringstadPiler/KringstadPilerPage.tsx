import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useUnitPrice, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.kringstadPiler";

type PilerRow = {
  farmId?: number; placeableId?: string; name?: string;
  outstandingLiters?: number; pendingLiters?: number; feePerLiter?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const unitPrice = useUnitPrice();
  const rows = asList<PilerRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const complete = page?.coverage === "complete" && page?.readState === "ok";
  const tiles: ModStatTile[] = complete && farmData ? [
    { key: "pilers", label: tOr(`${K}.pilers`, "Pilers scanned"), value: formatNumber(farmData.pilerCount) },
    { key: "outstanding", label: tOr(`${K}.outstanding`, "Farm tare outstanding"), value: `${formatNumber(farmData.outstandingLiters)} L` },
    { key: "pending", label: tOr(`${K}.pending`, "Pending tare generation"), value: `${formatNumber(farmData.pendingLiters)} L` },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "The piler's current tare dirt obligation for this farm, including public pilers used by several farms. Pending generation has not yet become physical tare. A fee rate is not a charge already made; day-end disposal and the actual charge depend on the physical tare and piler settings.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Farm tare balances by piler")}>
        <ModTable
          columns={[
            { key: "piler", label: tOr(`${K}.piler`, "Piler") },
            { key: "outstanding", label: tOr(`${K}.outstanding`, "Farm tare outstanding"), align: "end" },
            { key: "pending", label: tOr(`${K}.pending`, "Pending tare generation"), align: "end" },
            { key: "rate", label: tOr(`${K}.rate`, "Configured disposal rate"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: row.placeableId || String(index),
            cells: {
              piler: row.name || row.placeableId || "—",
              outstanding: `${formatNumber(row.outstandingLiters)} L`,
              pending: `${formatNumber(row.pendingLiters)} L`,
              rate: num(row.feePerLiter) === null ? "—" : `${unitPrice(row.feePerLiter)}/L`,
            },
          }))}
          empty={tOr(`${K}.empty`, "No current farm tare row is available.")}
        />
      </Card>
      {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "The piler scan was capped; farm totals are withheld.")}</ModEmpty> : null}
      {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Some tare ledger values could not be read; farm totals are withheld.")}</ModEmpty> : null}
    </ModPage>
  );
}
