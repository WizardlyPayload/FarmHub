import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Loan = {
  farmId?: number;
  id?: number;
  farmlandId?: number;
  originalPrice?: number;
  downPayment?: number;
  principal?: number;
  balance?: number;
  scheduledInstallment?: number;
  termMonths?: number;
  remainingMonths?: number;
  annualRatePercent?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<Loan>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "loans", label: tOr("companionPage.landFinancing.loans", "Active land loans"), value: formatNumber(farmData.loanCount, 0) },
    { key: "outstanding", label: tOr("companionPage.landFinancing.outstanding", "Recorded outstanding balance"), value: money(farmData.outstandingBalance) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.landFinancing.lead", "Active land loans recorded by Land Financing for this single-player farm. Installments are scheduled amounts; this page does not show payments made or a complete land transaction history.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.landFinancing.tableTitle", "Land financing obligations")}>
        <ModTable
          columns={[
            { key: "land", label: tOr("companionPage.landFinancing.land", "Farmland") },
            { key: "balance", label: tOr("companionPage.landFinancing.balance", "Balance"), align: "end" },
            { key: "installment", label: tOr("companionPage.landFinancing.installment", "Scheduled installment"), align: "end" },
            { key: "term", label: tOr("companionPage.landFinancing.term", "Months left / term") },
            { key: "rate", label: tOr("companionPage.landFinancing.rate", "Annual rate") },
            { key: "down", label: tOr("companionPage.landFinancing.down", "Down payment"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.id ?? index}`,
            cells: {
              land: `${tOr("companionPage.landFinancing.land", "Farmland")} ${formatNumber(row.farmlandId, 0)}`,
              balance: num(row.balance) === null ? "—" : money(row.balance),
              installment: num(row.scheduledInstallment) === null ? "—" : money(row.scheduledInstallment),
              term: `${formatNumber(row.remainingMonths, 0)} / ${formatNumber(row.termMonths, 0)}`,
              rate: `${formatNumber(row.annualRatePercent, 2)}%`,
              down: num(row.downPayment) === null ? "—" : money(row.downPayment),
            },
          }))}
          empty={tOr("companionPage.landFinancing.empty", "No active Land Financing loans were recorded for this farm.")}
        />
        {page?.coverage === "partial" || page?.coverage === "truncated" ? (
          <ModEmpty>{tOr("companionPage.landFinancing.partial", "Some loan records were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
