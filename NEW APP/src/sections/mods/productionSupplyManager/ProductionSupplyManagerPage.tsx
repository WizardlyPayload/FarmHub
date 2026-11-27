import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Purchase = {
  farmId?: number;
  daySerial?: number;
  production?: string;
  product?: string;
  station?: string;
  liters?: number;
  cost?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<Purchase>(page?.purchases).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "count", label: tOr("companionPage.productionSupplyManager.count", "Recorded purchases"), value: formatNumber(farmData.historyCount, 0) },
    { key: "enabled", label: tOr("companionPage.productionSupplyManager.enabled", "Automatic purchasing"), value: farmData.autoPurchaseEnabled === true ? tOr("companionPage.shared.yes", "Yes") : tOr("companionPage.shared.no", "No") },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.productionSupplyManager.lead", "This farm's recent automatic input purchases recorded by the mod. These are historical purchase entries, not current stock or a promise that a named destination is still owned. The history is bounded and can be cleared in game.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.productionSupplyManager.tableTitle", "Automatic purchase history")}>
        <ModTable
          columns={[
            { key: "day", label: tOr("companionPage.productionSupplyManager.day", "Day") },
            { key: "destination", label: tOr("companionPage.productionSupplyManager.destination", "Destination") },
            { key: "product", label: tOr("companionPage.productionSupplyManager.product", "Product") },
            { key: "liters", label: tOr("companionPage.productionSupplyManager.liters", "Litres"), align: "end" },
            { key: "cost", label: tOr("companionPage.productionSupplyManager.cost", "Cost"), align: "end" },
            { key: "station", label: tOr("companionPage.productionSupplyManager.station", "Buying station") },
          ]}
          rows={rows.map((row, index) => ({
            key: `${index}-${row.daySerial ?? ""}-${row.production ?? ""}`,
            cells: {
              day: num(row.daySerial) == null ? "—" : formatNumber(row.daySerial, 0),
              destination: row.production || "—",
              product: row.product || "—",
              liters: num(row.liters) == null ? "—" : formatNumber(row.liters, 0),
              cost: num(row.cost) == null ? "—" : money(row.cost!),
              station: row.station || "—",
            },
          }))}
          empty={tOr("companionPage.productionSupplyManager.empty", "No automatic purchases recorded for this farm yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.productionSupplyManager.truncated", "Only the first purchase records are shown.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
