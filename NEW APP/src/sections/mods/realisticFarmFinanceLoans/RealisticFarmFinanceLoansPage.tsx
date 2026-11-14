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

type AssetAgreement = {
  farmId?: number;
  id?: number;
  product?: string;
  status?: string;
  asset?: string;
  principal?: number;
  monthlyPayment?: number;
  arrears?: number;
  remainingMonths?: number;
  refundableDeposit?: number;
};

type Tenancy = {
  farmId?: number;
  id?: number;
  holding?: string;
  status?: string;
  monthlyRent?: number;
  rentDue?: number;
  arrears?: number;
  nextRentDuePeriod?: number;
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
  const assetRows = asList<AssetAgreement>(page?.assetRows).filter((row) => num(row.farmId) === farmId);
  const tenancyRows = asList<Tenancy>(page?.tenancyRows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "loans", label: tOr("companionPage.realisticFarmFinanceLoans.loans", "Active loans shown"), value: formatNumber(farmData.loanCount, 0) },
    { key: "arrears", label: tOr("companionPage.realisticFarmFinanceLoans.arrearsCount", "Loans in arrears"), value: formatNumber(farmData.arrearsCount, 0) },
    { key: "other", label: tOr("companionPage.realisticFarmFinanceLoans.other", "Other loan products omitted"), value: formatNumber(farmData.otherProductCount, 0) },
    ...(farmData.assetRegisterAvailable === true ? [
      { key: "assets", label: tOr("companionPage.realisticFarmFinanceLoans.assets", "Active asset agreements shown"), value: formatNumber(farmData.assetFinanceCount, 0) },
      { key: "assetArrears", label: tOr("companionPage.realisticFarmFinanceLoans.assetArrearsCount", "Asset agreements in arrears"), value: formatNumber(farmData.assetArrearsCount, 0) },
    ] : []),
    ...(farmData.tenancyRegisterAvailable === true ? [
      { key: "tenancies", label: tOr("companionPage.realisticFarmFinanceLoans.tenancies", "Current tenancies shown"), value: formatNumber(farmData.tenancyCount, 0) },
      { key: "tenancyArrears", label: tOr("companionPage.realisticFarmFinanceLoans.tenancyArrearsCount", "Tenancies in arrears"), value: formatNumber(farmData.tenancyArrearsCount, 0) },
    ] : []),
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.realisticFarmFinanceLoans.leadObligations", "Current loans, asset-finance agreements and tenancies recorded by Realistic Farm Finance for this farm. Contract asset names do not prove vehicle ownership; scheduled payments are not payments already made. Revolving credit, overdrafts and insurance require separate readings.")}>
      <ModStatTiles tiles={tiles} />
      {rows.length === 0 && assetRows.length === 0 && tenancyRows.length === 0
        ? <ModEmpty>{tOr("companionPage.realisticFarmFinanceLoans.noObligations", "No current supported obligation was captured for this farm.")}</ModEmpty> : null}
      {rows.length > 0 ? (
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
      </Card>
      ) : null}
      {assetRows.length > 0 ? (
      <Card title={tOr("companionPage.realisticFarmFinanceLoans.assetTitle", "Asset-finance obligations")}>
        <ModTable
          columns={[
            { key: "asset", label: tOr("companionPage.realisticFarmFinanceLoans.asset", "Contract asset") },
            { key: "product", label: tOr("companionPage.realisticFarmFinanceLoans.assetProduct", "Agreement") },
            { key: "status", label: tOr("companionPage.realisticFarmFinanceLoans.assetStatus", "Status") },
            { key: "principal", label: tOr("companionPage.realisticFarmFinanceLoans.assetPrincipal", "Principal"), align: "end" },
            { key: "payment", label: tOr("companionPage.realisticFarmFinanceLoans.assetPayment", "Scheduled monthly"), align: "end" },
            { key: "arrears", label: tOr("companionPage.realisticFarmFinanceLoans.assetArrears", "Arrears"), align: "end" },
            { key: "deposit", label: tOr("companionPage.realisticFarmFinanceLoans.assetDeposit", "Refundable deposit"), align: "end" },
            { key: "remaining", label: tOr("companionPage.realisticFarmFinanceLoans.assetRemaining", "Months left"), align: "end" },
          ]}
          rows={assetRows.map((row, index) => ({
            key: String(row.id ?? index),
            tone: num(row.arrears) !== null && num(row.arrears)! > 0 ? "warn" as const : undefined,
            cells: {
              asset: row.asset || "—",
              product: row.product === "HIRE_PURCHASE" ? tOr("companionPage.realisticFarmFinanceLoans.hirePurchase", "Hire purchase") : tOr("companionPage.realisticFarmFinanceLoans.operatingLease", "Operating lease"),
              status: row.status === "RETURN_DUE" ? tOr("companionPage.realisticFarmFinanceLoans.returnDue", "Return due") : tOr("companionPage.realisticFarmFinanceLoans.active", "Active"),
              principal: money(row.principal),
              payment: money(row.monthlyPayment),
              arrears: money(row.arrears),
              deposit: row.product === "OPERATING_LEASE" ? money(row.refundableDeposit) : "—",
              remaining: formatNumber(row.remainingMonths, 0),
            },
          }))}
          empty={farmData?.assetRegisterAvailable === true
            ? tOr("companionPage.realisticFarmFinanceLoans.assetEmpty", "No active asset-finance agreement for this farm.")
            : tOr("companionPage.realisticFarmFinanceLoans.assetUnavailable", "Asset-finance register unavailable in this reading.")}
        />
        {assetRows.some((row) => row.product === "OPERATING_LEASE") ? <ModEmpty>{tOr("companionPage.realisticFarmFinanceLoans.leaseNote", "Operating-lease principal is zero by this mod's contract model; refundable deposits are held separately.")}</ModEmpty> : null}
      </Card>
      ) : null}
      {tenancyRows.length > 0 ? (
      <Card title={tOr("companionPage.realisticFarmFinanceLoans.tenancyTitle", "Farm tenancies")}>
        <ModTable
          columns={[
            { key: "holding", label: tOr("companionPage.realisticFarmFinanceLoans.holding", "Holding") },
            { key: "status", label: tOr("companionPage.realisticFarmFinanceLoans.tenancyStatus", "Status") },
            { key: "monthly", label: tOr("companionPage.realisticFarmFinanceLoans.monthlyRent", "Contract monthly rent"), align: "end" },
            { key: "due", label: tOr("companionPage.realisticFarmFinanceLoans.rentDue", "Rent due"), align: "end" },
            { key: "arrears", label: tOr("companionPage.realisticFarmFinanceLoans.rentArrears", "Arrears"), align: "end" },
            { key: "period", label: tOr("companionPage.realisticFarmFinanceLoans.nextRentPeriod", "Next due period"), align: "end" },
          ]}
          rows={tenancyRows.map((row, index) => ({
            key: String(row.id ?? index),
            tone: num(row.arrears) !== null && num(row.arrears)! > 0 ? "warn" as const : undefined,
            cells: {
              holding: row.holding || "—",
              status: row.status === "NOTICE_SERVED" ? tOr("companionPage.realisticFarmFinanceLoans.noticeServed", "Notice served")
                : row.status === "RENEWAL_OFFERED" ? tOr("companionPage.realisticFarmFinanceLoans.renewalOffered", "Renewal offered")
                : row.status === "EXPIRING" ? tOr("companionPage.realisticFarmFinanceLoans.expiring", "Expiring")
                : tOr("companionPage.realisticFarmFinanceLoans.active", "Active"),
              monthly: money(row.monthlyRent),
              due: money(row.rentDue),
              arrears: money(row.arrears),
              period: formatNumber(row.nextRentDuePeriod, 0),
            },
          }))}
          empty={farmData?.tenancyRegisterAvailable === true
            ? tOr("companionPage.realisticFarmFinanceLoans.tenancyEmpty", "No current tenancy for this farm.")
            : tOr("companionPage.realisticFarmFinanceLoans.tenancyUnavailable", "Tenancy register unavailable in this reading.")}
        />
        <ModEmpty>{tOr("companionPage.realisticFarmFinanceLoans.tenancyNote", "Monthly rent is the contract rate; rent due and arrears are separate recorded balances. A tenancy does not make the farm the legal landowner.")}</ModEmpty>
      </Card>
      ) : null}
      {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.realisticFarmFinanceLoans.partialAsset", "Some obligation records could not be read.")}</ModEmpty> : null}
      {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.realisticFarmFinanceLoans.truncatedAsset", "Only some obligation records are listed.")}</ModEmpty> : null}
    </ModPage>
  );
}
