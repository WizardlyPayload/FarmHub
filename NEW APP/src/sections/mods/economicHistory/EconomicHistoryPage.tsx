import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type HistoryMonth = {
  farmId?: number;
  year?: number;
  period?: number;
  financeTotal?: number;
  balance?: number;
  loanBalance?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<HistoryMonth>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [{
    key: "months", label: tOr("companionPage.economicHistory.months", "Recorded months"),
    value: formatNumber(farmData.recordedMonths, 0),
  }] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.economicHistory.lead", "Completed monthly finance records saved by Economic History for this farm. Finance total is the mod's sum of finance categories, not a profit figure. The latest balance and loan balance are recorded snapshots.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.economicHistory.tableTitle", "Recorded monthly finances")}>
        <ModTable
          columns={[
            { key: "period", label: tOr("companionPage.economicHistory.period", "Year / period") },
            { key: "total", label: tOr("companionPage.economicHistory.total", "Finance total"), align: "end" },
            { key: "balance", label: tOr("companionPage.economicHistory.balance", "Closing balance"), align: "end" },
            { key: "loan", label: tOr("companionPage.economicHistory.loan", "Loan balance"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.year ?? "unknown"}-${row.period ?? "unknown"}-${index}`,
            cells: {
              period: num(row.year) != null && num(row.period) != null
                ? `${formatNumber(row.year, 0)} / ${formatNumber(row.period, 0)}` : "—",
              total: money(row.financeTotal),
              balance: money(row.balance),
              loan: money(row.loanBalance),
            },
          }))}
          empty={tOr("companionPage.economicHistory.empty", "No completed month has been recorded for this farm yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.economicHistory.truncated", "Only the latest recorded months are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
