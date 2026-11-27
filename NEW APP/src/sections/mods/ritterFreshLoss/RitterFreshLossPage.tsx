import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.ritterFreshLoss";
type LossRow = {
  farmId?: number; year?: number; period?: number; dayInPeriod?: number; hour?: number;
  fillTypeName?: string; amountLitres?: number; estimatedValue?: number;
  location?: string; entityType?: string;
};
type InventoryRow = {
  farmId?: number; fillTypeName?: string; totalLitres?: number; expiringLitres?: number;
  containerCount?: number; soonestHours?: number;
};
type Inventory = {
  readState?: string; coverage?: string; warningHours?: number;
  expirationEnabled?: boolean; rows?: InventoryRow[];
};

function gameDate(row: LossRow): string {
  if ([row.year, row.period, row.dayInPeriod, row.hour].some((v) => num(v) == null)) return "—";
  return `Y${row.year} P${row.period} D${row.dayInPeriod} ${String(row.hour).padStart(2, "0")}:00`;
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const formatMoney = useMoney();
  const rows = asList<LossRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const inventory = page?.currentInventory as Inventory | undefined;
  const inventoryRows = inventory?.readState === "ok" || inventory?.readState === "partial"
    ? asList<InventoryRow>(inventory.rows).filter((row) => num(row.farmId) === farmId) : [];
  const tiles: ModStatTile[] = farmData ? [
    { key: "count", label: tOr(`${K}.count`, "Logged losses in scanned window"),
      value: formatNumber(farmData.loggedLossCountScanned, 0) },
    { key: "litres", label: tOr(`${K}.litres`, "Expired volume in scanned window"),
      value: `${formatNumber(farmData.lostLitresScanned, 0)} L` },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "Ritter Fresh records expired goods by farm. Its value at expiry is a market-price estimate, not a sale, debit or realized expense.")}>
      <ModStatTiles tiles={tiles} />
      {inventory ? <Card title={tOr(`${K}.inventoryTitle`, "Current tracked freshness")}>
        {inventory.readState === "settings-only" ? <ModEmpty>{tOr(`${K}.inventoryUnavailable`,
          "Current freshness data is not ready in this export.")}</ModEmpty> : <>
          {inventory.coverage === "partial" ? <ModEmpty>{tOr(`${K}.inventoryPartial`,
            "Only containers with a verified current farm owner are shown. Some stock or rows could not be checked.")}</ModEmpty> : null}
          {inventory.expirationEnabled === false ? <ModEmpty>{tOr(`${K}.inventoryPaused`,
            "Freshness expiration is disabled; no current expiry warning is calculated.")}</ModEmpty> : null}
          <ModTable
            columns={[
              { key: "commodity", label: tOr(`${K}.commodity`, "Commodity") },
              { key: "amount", label: tOr(`${K}.inventoryAmount`, "Tracked amount"), align: "end" },
              { key: "atRisk", label: tOr(`${K}.inventoryAtRisk`, "At or within warning time"), align: "end" },
              { key: "soonest", label: tOr(`${K}.inventorySoonest`, "Soonest threshold"), align: "end" },
            ]}
            rows={inventoryRows.map((row, index) => ({
              key: `${index}-${row.fillTypeName}`,
              cells: {
                commodity: row.fillTypeName || "—",
                amount: num(row.totalLitres) == null ? "—" : `${formatNumber(row.totalLitres, 0)} L`,
                atRisk: inventory.expirationEnabled === false || num(row.expiringLitres) == null
                  ? "—" : `${formatNumber(row.expiringLitres, 0)} L`,
                soonest: inventory.expirationEnabled === false || num(row.soonestHours) == null
                  ? "—" : row.soonestHours! <= 0
                    ? tOr(`${K}.inventoryOverdue`, "Past threshold")
                    : `${formatNumber(row.soonestHours, 1)} h`,
              },
            }))}
            empty={tOr(`${K}.inventoryEmpty`, "No current perishable batches with verified farm ownership were found.")}
          />
          <p class="fd-economy__muted">{tOr(`${K}.inventoryNote`,
            "These are Ritter Fresh batch amounts, not independently measured native Storage levels. Ownership is checked against live entities or the owning object-storage building.")}</p>
        </>}
      </Card> : null}
      <Card title={tOr(`${K}.title`, "Recent logged freshness losses")}>
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`,
          "Only the most recent part of the log was scanned or listed. Counts and litres cover the scanned window only.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`,
          "Some log rows were missing a valid amount or game date and were withheld.")}</ModEmpty> : null}
        <ModTable
          columns={[
            { key: "date", label: tOr(`${K}.date`, "Game date") },
            { key: "commodity", label: tOr(`${K}.commodity`, "Commodity") },
            { key: "amount", label: tOr(`${K}.amount`, "Expired"), align: "end" },
            { key: "estimate", label: tOr(`${K}.estimate`, "Estimated value at expiry"), align: "end" },
            { key: "location", label: tOr(`${K}.location`, "Location") },
          ]}
          rows={rows.map((row, index) => ({
            key: `${index}-${row.year}-${row.period}-${row.fillTypeName}`,
            cells: {
              date: gameDate(row),
              commodity: row.fillTypeName || "—",
              amount: num(row.amountLitres) == null ? "—" : `${formatNumber(row.amountLitres, 0)} L`,
              estimate: num(row.estimatedValue) == null ? "—" : formatMoney(row.estimatedValue),
              location: row.location || "—",
            },
          }))}
          empty={page?.coverage === "truncated"
            ? tOr(`${K}.emptyWindow`, "No losses for this farm in the scanned part of the log.")
            : tOr(`${K}.empty`, "No freshness losses are logged for this farm.")}
        />
        <p class="fd-economy__muted">{tOr(`${K}.note`,
          "Farm ownership is the ID saved by Ritter Fresh when the loss was recorded. Historical ownership was not independently checked.")}</p>
      </Card>
    </ModPage>
  );
}
