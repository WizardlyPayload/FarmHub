import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Loan = {
  farmId?: number;
  id?: number;
  kind?: "annuity" | "bullet" | "revolving";
  creditLimit?: number;
  outstanding?: number;
  interestRate?: number;
  monthlyPayment?: number;
  remainingMonths?: number;
};

function loanType(kind: Loan["kind"]): string {
  switch (kind) {
    case "annuity": return tOr("companionPage.bankAndCreditLoans.annuity", "Annuity");
    case "bullet": return tOr("companionPage.bankAndCreditLoans.bullet", "Bullet");
    case "revolving": return tOr("companionPage.bankAndCreditLoans.revolving", "Revolving credit");
    default: return "—";
  }
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<Loan>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "loans", label: tOr("companionPage.bankAndCreditLoans.loans", "Active loans shown"), value: formatNumber(farmData.activeCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.bankAndCreditLoans.lead", "Active Bank And Credit contracts recorded for this farm. Revolving credit shows the credit limit and amount drawn; other rows show original and remaining principal. This is a separate lender from Realistic Farm Finance and native loans.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.bankAndCreditLoans.tableTitle", "Bank And Credit obligations")}>
        <ModTable
          columns={[
            { key: "id", label: tOr("companionPage.bankAndCreditLoans.id", "Loan") },
            { key: "type", label: tOr("companionPage.bankAndCreditLoans.type", "Product") },
            { key: "limit", label: tOr("companionPage.bankAndCreditLoans.limit", "Original / limit"), align: "end" },
            { key: "outstanding", label: tOr("companionPage.bankAndCreditLoans.outstanding", "Outstanding / drawn"), align: "end" },
            { key: "payment", label: tOr("companionPage.bankAndCreditLoans.payment", "Monthly payment"), align: "end" },
            { key: "rate", label: tOr("companionPage.bankAndCreditLoans.rate", "Interest rate"), align: "end" },
            { key: "months", label: tOr("companionPage.bankAndCreditLoans.months", "Months left"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: String(row.id ?? index),
            cells: {
              id: formatNumber(row.id, 0),
              type: loanType(row.kind),
              limit: money(row.creditLimit),
              outstanding: money(row.outstanding),
              payment: row.kind === "revolving" ? "—" : money(row.monthlyPayment),
              rate: num(row.interestRate) === null ? "—" : `${formatNumber(row.interestRate, 2)}%`,
              months: row.kind === "revolving" ? "—" : formatNumber(row.remainingMonths, 0),
            },
          }))}
          empty={tOr("companionPage.bankAndCreditLoans.empty", "No active Bank And Credit loans recorded for this farm.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.bankAndCreditLoans.truncated", "Only some loans are listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.bankAndCreditLoans.partial", "Some loan records could not be read.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
