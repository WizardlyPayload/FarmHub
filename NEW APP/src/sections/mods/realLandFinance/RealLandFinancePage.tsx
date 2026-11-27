import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Contract = {
  farmId?: number;
  id?: number;
  farmlandId?: number;
  kind?: string;
  role?: string;
  unit?: string;
  fillTypeName?: string;
  balance?: number;
  installment?: number;
  rentPerYear?: number;
  arrearsCount?: number;
  monthsToNext?: number;
};

function contractType(kind: string | undefined): string {
  switch (kind) {
    case "MORTGAGE": return tOr("companionPage.realLandFinance.mortgage", "Mortgage");
    case "SELLER": return tOr("companionPage.realLandFinance.seller", "Seller finance");
    case "GRAIN": return tOr("companionPage.realLandFinance.grain", "Grain finance");
    case "JUDICIAL": return tOr("companionPage.realLandFinance.judicial", "Judicial purchase");
    case "DEED": return tOr("companionPage.realLandFinance.deed", "Deed balance");
    case "LEASE": return tOr("companionPage.realLandFinance.lease", "Lease");
    case "LET": return tOr("companionPage.realLandFinance.let", "Land let out");
    default: return "—";
  }
}

function contractRole(role: string | undefined): string {
  switch (role) {
    case "buyer": return tOr("companionPage.realLandFinance.buyer", "Buyer");
    case "landlord": return tOr("companionPage.realLandFinance.landlord", "Landlord");
    case "tenant": return tOr("companionPage.realLandFinance.tenant", "Tenant");
    default: return "—";
  }
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<Contract>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const amount = (value: number | undefined, row: Contract) => {
    if (num(value) == null) return "—";
    if (row.unit === "KG") {
      return `${formatNumber(value, 0)} ${tOr("companionPage.realLandFinance.kg", "kg")} ${row.fillTypeName || ""}`.trim();
    }
    return row.unit === "MONEY" ? money(value!) : "—";
  };
  const tiles: ModStatTile[] = farmData ? [
    { key: "count", label: tOr("companionPage.realLandFinance.contractCount", "Farm contracts"), value: formatNumber(farmData.contractCount, 0) },
    { key: "purchase", label: tOr("companionPage.realLandFinance.purchaseCount", "Purchase finance"), value: formatNumber(farmData.purchaseCount, 0) },
    { key: "owed", label: tOr("companionPage.realLandFinance.rentOwedCount", "Rent owed"), value: formatNumber(farmData.rentOwedCount, 0) },
    { key: "incoming", label: tOr("companionPage.realLandFinance.rentInCount", "Rent receivable"), value: formatNumber(farmData.rentInCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.realLandFinance.lead", "Current land finance contracts recorded by the mod for this farm. Purchase balances, installments and yearly rents retain their contract units. A listing is not a debt, and these figures do not prove a payment was made.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.realLandFinance.tableTitle", "Land contracts")}>
        <ModTable
          columns={[
            { key: "id", label: tOr("companionPage.realLandFinance.contract", "Contract") },
            { key: "farmland", label: tOr("companionPage.realLandFinance.farmland", "Farmland") },
            { key: "type", label: tOr("companionPage.realLandFinance.type", "Type") },
            { key: "role", label: tOr("companionPage.realLandFinance.role", "Your role") },
            { key: "balance", label: tOr("companionPage.realLandFinance.balance", "Outstanding balance"), align: "end" },
            { key: "installment", label: tOr("companionPage.realLandFinance.installment", "Installment"), align: "end" },
            { key: "rent", label: tOr("companionPage.realLandFinance.rent", "Annual rent"), align: "end" },
            { key: "arrears", label: tOr("companionPage.realLandFinance.arrears", "Missed payments"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: `${index}-${row.id ?? ""}`,
            cells: {
              id: num(row.id) == null ? "—" : formatNumber(row.id, 0),
              farmland: num(row.farmlandId) == null ? "—" : formatNumber(row.farmlandId, 0),
              type: contractType(row.kind),
              role: contractRole(row.role),
              balance: amount(row.balance, row),
              installment: amount(row.installment, row),
              rent: amount(row.rentPerYear, row),
              arrears: num(row.arrearsCount) == null ? "—" : formatNumber(row.arrearsCount, 0),
            },
          }))}
          empty={tOr("companionPage.realLandFinance.empty", "No current land finance contracts for this farm.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.realLandFinance.truncated", "Only some contracts are listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.realLandFinance.partial", "Some contract records could not be read.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
