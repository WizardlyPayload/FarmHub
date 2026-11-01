import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Contract = {
  id?: number;
  farmId?: number;
  crop?: string;
  station?: string;
  status?: string;
  targetLiters?: number;
  deliveredLiters?: number;
  lockedPricePerLiter?: number;
  dueYear?: number;
  duePeriod?: number;
};

const states: Record<string, string> = {
  ACTIVE: "Active", COMPLETED: "Completed", EXPIRED: "Expired",
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<Contract>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "active", label: tOr("companionPage.cropContracts.active", "Active"), value: formatNumber(farmData.activeCount, 0) },
    { key: "completed", label: tOr("companionPage.cropContracts.completed", "Completed"), value: formatNumber(farmData.completedCount, 0) },
    { key: "expired", label: tOr("companionPage.cropContracts.expired", "Expired"), value: formatNumber(farmData.expiredCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.cropContracts.lead", "See the forward crop contracts held by your farm. The locked bid and delivery target are contract terms, not realized income.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.cropContracts.tableTitle", "Forward crop contracts")}>
        <ModTable
          columns={[
            { key: "crop", label: tOr("companionPage.cropContracts.crop", "Crop") },
            { key: "station", label: tOr("companionPage.cropContracts.station", "Sell point") },
            { key: "status", label: tOr("companionPage.cropContracts.status", "Status") },
            { key: "delivery", label: tOr("companionPage.cropContracts.delivery", "Delivered / target"), align: "end" },
            { key: "bid", label: tOr("companionPage.cropContracts.bid", "Locked bid / 1,000 L"), align: "end" },
            { key: "due", label: tOr("companionPage.cropContracts.due", "Due"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: String(row.id ?? index),
            cells: {
              crop: row.crop || "—",
              station: row.station || "—",
              status: tOr(`companionPage.cropContracts.status.${row.status || ""}`, states[row.status || ""] || row.status || "—"),
              delivery: `${formatNumber(row.deliveredLiters, 0)} / ${formatNumber(row.targetLiters, 0)} L`,
              bid: num(row.lockedPricePerLiter) != null ? money((num(row.lockedPricePerLiter) || 0) * 1000) : "—",
              due: num(row.dueYear) != null && num(row.duePeriod) != null
                ? tOr("companionPage.cropContracts.period", "Y{{year}} / P{{period}}", {
                  year: formatNumber(row.dueYear, 0), period: formatNumber(row.duePeriod, 0),
                }) : "—",
            },
          }))}
          empty={tOr("companionPage.cropContracts.empty", "No forward crop contracts for this farm yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.cropContracts.truncated", "Only the first contracts are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
