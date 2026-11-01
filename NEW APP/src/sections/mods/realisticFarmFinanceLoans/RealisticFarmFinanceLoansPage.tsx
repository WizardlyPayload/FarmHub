import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Loan = {
  farmId?: number;
  id?: number;
  kind?: string;
  principal?: number;
  arrears?: number;
  interestRate?: number;
  remainingMonths?: number;
  paymentsMade?: number;
  legacyImported?: boolean;
};

function loanType(row: Loan): string {
  if (row.legacyImported) return tOr("companionPage.realisticFarmFinanceLoans.legacy", "Legacy farm loan");
  switch (row.kind) {
    case "TERM": return tOr("companionPage.realisticFarmFinanceLoans.term", "Term loan");
    case "MORTGAGE": return tOr("companionPage.realisticFarmFinanceLoans.mortgage", "Agricultural mortgage");
    case "BULLET": return tOr("companionPage.realisticFarmFinanceLoans.bullet", "Interest-only / bullet loan");
    default: return "—";
  }
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<Loan>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "loans", label: tOr("companionPage.realisticFarmFinanceLoans.loans", "Active loans shown"), value: formatNumber(farmData.loanCount, 0) },
    { key: "arrears", label: tOr("companionPage.realisticFarmFinanceLoans.arrearsCount", "Loans in arrears"), value: formatNumber(farmData.arrearsCount, 0) },
    { key: "other", label: tOr("companionPage.realisticFarmFinanceLoans.other", "Other loan products omitted"), value: formatNumber(farmData.otherProductCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.realisticFarmFinanceLoans.lead", "Active term, mortgage and bullet loan obligations recorded by Realistic Farm Finance for this farm. Principal and arrears are separate recorded amounts, not payments already made. Revolving credit, overdrafts, asset finance and tenancies require separate readings.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.realisticFarmFinanceLoans.tableTitle", "Farm loan obligations")}>
        <ModTable
          columns={[
            { key: "id", label: tOr("companionPage.realisticFarmFinanceLoans.id", "Loan") },
            { key: "type", label: tOr("companionPage.realisticFarmFinanceLoans.type", "Product") },
            { key: "principal", label: tOr("companionPage.realisticFarmFinanceLoans.principal", "Principal"), align: "end" },
            { key: "arrears", label: tOr("companionPage.realisticFarmFinanceLoans.arrears", "Arrears"), align: "end" },
            { key: "rate", label: tOr("companionPage.realisticFarmFinanceLoans.rate", "Interest rate"), align: "end" },
            { key: "remaining", label: tOr("companionPage.realisticFarmFinanceLoans.remaining", "Months left"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: String(row.id ?? index),
            tone: num(row.arrears) !== null && num(row.arrears)! > 0 ? "warn" as const : undefined,
            cells: {
              id: formatNumber(row.id, 0),
              type: loanType(row),
              principal: money(row.principal),
              arrears: money(row.arrears),
              rate: num(row.interestRate) === null ? "—" : `${formatNumber(row.interestRate, 2)}%`,
              remaining: formatNumber(row.remainingMonths, 0),
            },
          }))}
          empty={tOr("companionPage.realisticFarmFinanceLoans.empty", "No active term, mortgage or bullet loan for this farm.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.realisticFarmFinanceLoans.truncated", "Only some loans are listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.realisticFarmFinanceLoans.partial", "Some loan records could not be read.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
