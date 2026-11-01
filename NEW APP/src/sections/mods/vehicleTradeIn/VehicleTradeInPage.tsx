import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Trade = {
  farmId?: number;
  vehicle?: string;
  brand?: string;
  date?: string;
  baseAppraisal?: number;
  tradeCredit?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<Trade>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "trades", label: tOr("companionPage.vehicleTradeIn.trades", "Recorded trades"), value: formatNumber(farmData.tradeCount, 0) },
    { key: "credit", label: tOr("companionPage.vehicleTradeIn.credit", "Total trade credit"), value: num(farmData.totalCredit) == null ? "—" : money(num(farmData.totalCredit)!) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.vehicleTradeIn.lead", "Completed Vehicle Trade In dealer transactions recorded for this farm. Trade credit is the mod's recorded final value, not profit or a current vehicle valuation. Shared used-market offers are excluded.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.vehicleTradeIn.tableTitle", "Trade history")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.vehicleTradeIn.vehicle", "Vehicle") },
            { key: "date", label: tOr("companionPage.vehicleTradeIn.date", "Date") },
            { key: "base", label: tOr("companionPage.vehicleTradeIn.base", "Base appraisal"), align: "end" },
            { key: "credit", label: tOr("companionPage.vehicleTradeIn.final", "Trade credit"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.vehicle ?? "trade"}-${row.date ?? ""}-${index}`,
            cells: {
              vehicle: row.vehicle || "—",
              date: row.date || "—",
              base: num(row.baseAppraisal) == null ? "—" : money(row.baseAppraisal!),
              credit: num(row.tradeCredit) == null ? "—" : money(row.tradeCredit!),
            },
          }))}
          empty={tOr("companionPage.vehicleTradeIn.empty", "No completed Vehicle Trade In transaction recorded for this farm.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.vehicleTradeIn.truncated", "Only recent trades are listed; the mod retains up to 200.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.vehicleTradeIn.partial", "Some trade records could not be read.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
