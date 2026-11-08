import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Pending = { farmId?: number; saleId?: number; netAmount?: number; baleCount?: number; saleYear?: number };

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const pending = asList<Pending>(page?.pending).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "count", label: tOr("companionPage.baleDirect.count", "Pending sales"), value: formatNumber(farmData.pendingCount, 0) },
    { key: "amount", label: tOr("companionPage.baleDirect.amount", "Net amount awaiting payment"), value: money(farmData.pendingNetAmount) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.baleDirect.lead", "Standard-delivery bale or windrow sales awaiting payment after the game year changes. These amounts are not farm money received; express sales are paid immediately and do not appear here.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.baleDirect.tableTitle", "Pending Bale Direct payments")}>
        <ModTable
          columns={[
            { key: "sale", label: tOr("companionPage.baleDirect.sale", "Sale ID") },
            { key: "year", label: tOr("companionPage.baleDirect.year", "Sale year"), align: "end" },
            { key: "bales", label: tOr("companionPage.baleDirect.bales", "Bales recorded"), align: "end" },
            { key: "amount", label: tOr("companionPage.baleDirect.rowAmount", "Net pending"), align: "end" },
          ]}
          rows={pending.map((row, index) => ({
            key: String(row.saleId ?? index),
            cells: {
              sale: formatNumber(row.saleId, 0), year: formatNumber(row.saleYear, 0),
              bales: formatNumber(row.baleCount, 0), amount: money(row.netAmount),
            },
          }))}
          empty={tOr("companionPage.baleDirect.empty", "No pending Bale Direct payment for this farm.")}
        />
        <ModEmpty>{tOr("companionPage.baleDirect.note", "A zero bale count can be a windrow sale. The saved record has no crop or volume breakdown.")}</ModEmpty>
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.baleDirect.truncated", "Only some pending sales are listed; totals are withheld.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.baleDirect.partial", "Some pending sale records could not be read.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
