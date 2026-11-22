import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Pending = { farmId?: number; amount?: number; monthsRemaining?: number };

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const pending = asList<Pending>(page?.pending).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "count", label: tOr("companionPage.autoSellSilo.count", "Deferred payments"), value: formatNumber(farmData.pendingCount, 0) },
    { key: "amount", label: tOr("companionPage.autoSellSilo.amount", "Unpaid amount"), value: money(farmData.pendingAmount) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.autoSellSilo.lead", "When Auto Sell Silo defers payment for a sale, the amount is owed to this farm; it is not income already received. The mod does not retain which crop, station or quantity produced each payment.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.autoSellSilo.tableTitle", "Outstanding payments")}>
        <ModTable
          columns={[
            { key: "due", label: tOr("companionPage.autoSellSilo.due", "Months remaining"), align: "end" },
            { key: "amount", label: tOr("companionPage.autoSellSilo.rowAmount", "Amount owed"), align: "end" },
          ]}
          rows={pending.map((row, index) => ({
            key: String(index),
            cells: { due: formatNumber(row.monthsRemaining, 0), amount: money(row.amount) },
          }))}
          empty={page?.coverage === "truncated"
            ? tOr("companionPage.autoSellSilo.truncated", "Only some payments are listed.")
            : page?.readState === "partial"
              ? tOr("companionPage.autoSellSilo.partial", "Some payment terms could not be read.")
              : tOr("companionPage.autoSellSilo.empty", "No deferred Auto Sell Silo payment for this farm.")}
        />
        {pending.length > 0 && page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.autoSellSilo.truncated", "Only some payments are listed.")}</ModEmpty> : null}
        {pending.length > 0 && page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.autoSellSilo.partial", "Some payment terms could not be read.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
