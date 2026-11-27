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

type Facility = {
  farmId?: number;
  id?: number;
  kind?: "REVOLVING" | "OVERDRAFT";
  creditLimit?: number;
  used?: number;
  available?: number;
  overLimit?: number;
  arrears?: number;
  interestRate?: number;
  remainingMonths?: number;
  suspended?: boolean;
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

type InsurancePolicy = {
  farmId?: number;
  id?: number;
  vehicle?: string;
  cover?: string;
  status?: string;
  endPeriod?: number;
  premiumDue?: number;
  autoRenew?: boolean;
};

type InsuranceClaim = {
  farmId?: number;
  id?: number;
  kind?: string;
  subject?: string;
  status?: string;
  amountClaimed?: number;
  approvedAmount?: number;
  paidAmount?: number;
};

type Application = {
  farmId?: number;
  id?: number;
  product?: string;
  status?: string;
  requestedAmount?: number;
  offeredAmount?: number;
  offerHoursLeft?: number;
};

type OpenAnimalLoss = {
  farmId?: number;
  id?: number;
  animal?: string;
  animalType?: string;
  reason?: string;
  periodsLeft?: number;
};

type VeterinaryExpense = {
  farmId?: number;
  id?: number;
  animal?: string;
  animalType?: string;
  diseases?: string;
  treatmentCost?: number;
  periodsLeft?: number;
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

function financePeriodLabel(value: unknown): string {
  const absolutePeriod = num(value);
  if (absolutePeriod === null || !Number.isInteger(absolutePeriod) || absolutePeriod < 1) return "—";
  const year = Math.floor((absolutePeriod - 1) / 12);
  const period = ((absolutePeriod - 1) % 12) + 1;
  return tOr("companionPage.cropContracts.period", "Y{{year}} / P{{period}}", {
    year: formatNumber(year, 0), period: formatNumber(period, 0),
  });
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<Loan>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const facilityRows = asList<Facility>(page?.facilityRows).filter((row) => num(row.farmId) === farmId);
  const assetRows = asList<AssetAgreement>(page?.assetRows).filter((row) => num(row.farmId) === farmId);
  const tenancyRows = asList<Tenancy>(page?.tenancyRows).filter((row) => num(row.farmId) === farmId);
  const applicationRows = asList<Application>(page?.applicationRows).filter((row) => num(row.farmId) === farmId);
  const insurancePolicyRows = asList<InsurancePolicy>(page?.insurancePolicyRows).filter((row) => num(row.farmId) === farmId);
  const insuranceClaimRows = asList<InsuranceClaim>(page?.insuranceClaimRows).filter((row) => num(row.farmId) === farmId);
  const openAnimalLossRows = asList<OpenAnimalLoss>(page?.openAnimalLossRows).filter((row) => num(row.farmId) === farmId);
  const veterinaryExpenseRows = asList<VeterinaryExpense>(page?.eligibleVeterinaryExpenseRows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "loans", label: tOr("companionPage.realisticFarmFinanceLoans.loans", "Active loans shown"), value: formatNumber(farmData.loanCount, 0) },
    { key: "arrears", label: tOr("companionPage.realisticFarmFinanceLoans.arrearsCount", "Loans in arrears"), value: formatNumber(farmData.arrearsCount, 0) },
    { key: "facilities", label: tOr("companionPage.realisticFarmFinanceLoans.facilities", "Active credit facilities"), value: formatNumber(farmData.facilityCount, 0) },
    { key: "other", label: tOr("companionPage.realisticFarmFinanceLoans.other", "Other loan products omitted"), value: formatNumber(farmData.otherProductCount, 0) },
    ...(farmData.assetRegisterAvailable === true ? [
      { key: "assets", label: tOr("companionPage.realisticFarmFinanceLoans.assets", "Active asset agreements shown"), value: formatNumber(farmData.assetFinanceCount, 0) },
      { key: "assetArrears", label: tOr("companionPage.realisticFarmFinanceLoans.assetArrearsCount", "Asset agreements in arrears"), value: formatNumber(farmData.assetArrearsCount, 0) },
    ] : []),
    ...(farmData.tenancyRegisterAvailable === true ? [
      { key: "tenancies", label: tOr("companionPage.realisticFarmFinanceLoans.tenancies", "Current tenancies shown"), value: formatNumber(farmData.tenancyCount, 0) },
      { key: "tenancyArrears", label: tOr("companionPage.realisticFarmFinanceLoans.tenancyArrearsCount", "Tenancies in arrears"), value: formatNumber(farmData.tenancyArrearsCount, 0) },
    ] : []),
    ...(farmData.applicationRegisterAvailable === true ? [
      { key: "applications", label: tOr("companionPage.realisticFarmFinanceLoans.applications", "Open applications"), value: formatNumber(farmData.applicationCount, 0) },
      { key: "offers", label: tOr("companionPage.realisticFarmFinanceLoans.offers", "Offers awaiting a decision"), value: formatNumber(farmData.applicationOfferCount, 0) },
    ] : []),
    ...(farmData.insurancePolicyRegisterAvailable === true ? [
      { key: "insurancePolicies", label: tOr("companionPage.realisticFarmFinanceLoans.insurancePolicies", "Vehicle policies recorded"), value: formatNumber(farmData.insurancePolicyCount, 0) },
      { key: "premiumsDue", label: tOr("companionPage.realisticFarmFinanceLoans.premiumsDue", "Policies with premium due"), value: formatNumber(farmData.insurancePremiumDueCount, 0) },
    ] : []),
    ...(farmData.insuranceClaimRegisterAvailable === true ? [
      { key: "insuranceClaims", label: tOr("companionPage.realisticFarmFinanceLoans.insuranceClaims", "Insurance claims recorded"), value: formatNumber(farmData.insuranceClaimCount, 0) },
    ] : []),
    ...(farmData.animalLossRegisterComplete === true ? [
      { key: "openAnimalLosses", label: tOr("companionPage.realisticFarmFinanceLoans.openAnimalLosses", "Animal loss reports still within filing window"), value: formatNumber(farmData.openAnimalLossCount, 0) },
    ] : []),
    ...(farmData.veterinaryExpenseRegisterComplete === true ? [
      { key: "veterinaryExpenses", label: tOr("companionPage.realisticFarmFinanceLoans.veterinaryExpenses", "Veterinary expenses the mod accepts for filing"), value: formatNumber(farmData.eligibleVeterinaryExpenseCount, 0) },
    ] : []),
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.realisticFarmFinanceLoans.lead", "Current finance obligations, applications, vehicle policies and claims recorded by Realistic Farm Finance for this farm. Contract and policy names do not prove current vehicle ownership. An offer or approved claim is not money already paid.")}>
      <ModStatTiles tiles={tiles} />
      {rows.length === 0 && facilityRows.length === 0 && assetRows.length === 0 && tenancyRows.length === 0
          && applicationRows.length === 0 && insurancePolicyRows.length === 0 && insuranceClaimRows.length === 0
          && openAnimalLossRows.length === 0 && veterinaryExpenseRows.length === 0
        ? <ModEmpty>{tOr("companionPage.realisticFarmFinanceLoans.noObligations", "No supported farm finance record was captured for this farm.")}</ModEmpty> : null}
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
      {facilityRows.length > 0 ? (
      <Card title={tOr("companionPage.realisticFarmFinanceLoans.facilityTitle", "Credit facilities") }>
        <ModTable
          columns={[
            { key: "id", label: tOr("companionPage.realisticFarmFinanceLoans.id", "Loan") },
            { key: "kind", label: tOr("companionPage.realisticFarmFinanceLoans.type", "Product") },
            { key: "limit", label: tOr("companionPage.realisticFarmFinanceLoans.creditLimit", "Credit limit"), align: "end" },
            { key: "used", label: tOr("companionPage.realisticFarmFinanceLoans.used", "Currently used"), align: "end" },
            { key: "available", label: tOr("companionPage.realisticFarmFinanceLoans.available", "Facility headroom"), align: "end" },
            { key: "arrears", label: tOr("companionPage.realisticFarmFinanceLoans.arrears", "Arrears"), align: "end" },
            { key: "status", label: tOr("companionPage.realisticFarmFinanceLoans.assetStatus", "Status") },
          ]}
          rows={facilityRows.map((row, index) => ({
            key: String(row.id ?? index),
            tone: row.suspended || (num(row.overLimit) ?? 0) > 0 || (num(row.arrears) ?? 0) > 0 ? "warn" as const : undefined,
            cells: {
              id: formatNumber(row.id, 0),
              kind: row.kind === "OVERDRAFT"
                ? tOr("companionPage.realisticFarmFinanceLoans.overdraft", "Overdraft")
                : tOr("companionPage.realisticFarmFinanceLoans.revolving", "Revolving credit"),
              limit: money(row.creditLimit),
              used: money(row.used),
              available: money(row.available),
              arrears: money(row.arrears),
              status: row.suspended
                ? tOr("companionPage.realisticFarmFinanceLoans.suspended", "Suspended")
                : (num(row.overLimit) ?? 0) > 0
                  ? tOr("companionPage.realisticFarmFinanceLoans.overLimit", "Over limit")
                  : tOr("companionPage.realisticFarmFinanceLoans.active", "Active"),
            },
          }))}
          empty={tOr("companionPage.realisticFarmFinanceLoans.facilityEmpty", "No active credit facility for this farm.")}
        />
        <ModEmpty>{tOr("companionPage.realisticFarmFinanceLoans.facilityNote", "Revolving usage is the mod's drawn balance. Overdraft usage is the current bank-account debit, not loan principal. Headroom is zero while an overdraft is suspended; arrears are separate.")}</ModEmpty>
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
              period: financePeriodLabel(row.nextRentDuePeriod),
            },
          }))}
          empty={farmData?.tenancyRegisterAvailable === true
            ? tOr("companionPage.realisticFarmFinanceLoans.tenancyEmpty", "No current tenancy for this farm.")
            : tOr("companionPage.realisticFarmFinanceLoans.tenancyUnavailable", "Tenancy register unavailable in this reading.")}
        />
        <ModEmpty>{tOr("companionPage.realisticFarmFinanceLoans.tenancyNote", "Monthly rent is the contract rate; rent due and arrears are separate recorded balances. A tenancy does not make the farm the legal landowner.")}</ModEmpty>
      </Card>
      ) : null}
      {applicationRows.length > 0 ? (
        <Card title={tOr("companionPage.realisticFarmFinanceLoans.applicationTitle", "Loan applications and offers")}>
          <ModTable
            columns={[
              { key: "id", label: tOr("companionPage.realisticFarmFinanceLoans.applicationId", "Application") },
              { key: "product", label: tOr("companionPage.realisticFarmFinanceLoans.applicationProduct", "Product") },
              { key: "status", label: tOr("companionPage.realisticFarmFinanceLoans.applicationStatus", "Status") },
              { key: "requested", label: tOr("companionPage.realisticFarmFinanceLoans.requested", "Requested"), align: "end" },
              { key: "offered", label: tOr("companionPage.realisticFarmFinanceLoans.offered", "Offered"), align: "end" },
              { key: "expiry", label: tOr("companionPage.realisticFarmFinanceLoans.offerHours", "Offer time left (h)"), align: "end" },
            ]}
            rows={applicationRows.map((row, index) => ({
              key: `application-${row.id ?? index}`,
              tone: row.status === "OFFERED" ? "warn" as const : undefined,
              cells: {
                id: formatNumber(row.id, 0), product: row.product || "—",
                status: row.status || "—", requested: money(row.requestedAmount),
                offered: row.status === "OFFERED" ? money(row.offeredAmount) : "—",
                expiry: row.status === "OFFERED" ? formatNumber(row.offerHoursLeft, 0) : "—",
              },
            }))}
          />
          <ModEmpty>{tOr("companionPage.realisticFarmFinanceLoans.applicationNote", "An offer is a proposal awaiting a decision, not a paid advance. Offer time is shown only when the game's clock is readable.")}</ModEmpty>
        </Card>
      ) : null}
      {insurancePolicyRows.length > 0 ? (
        <Card title={tOr("companionPage.realisticFarmFinanceLoans.insurancePolicyTitle", "Vehicle insurance policies")}>
          <ModTable
            columns={[
              { key: "vehicle", label: tOr("companionPage.realisticFarmFinanceLoans.policyVehicle", "Vehicle on policy") },
              { key: "cover", label: tOr("companionPage.realisticFarmFinanceLoans.policyCover", "Cover") },
              { key: "status", label: tOr("companionPage.realisticFarmFinanceLoans.policyStatus", "Status") },
              { key: "end", label: tOr("companionPage.realisticFarmFinanceLoans.policyEnd", "Cover ends period"), align: "end" },
              { key: "due", label: tOr("companionPage.realisticFarmFinanceLoans.policyDue", "Premium due"), align: "end" },
              { key: "renew", label: tOr("companionPage.realisticFarmFinanceLoans.policyRenew", "Auto renew") },
            ]}
            rows={insurancePolicyRows.map((row, index) => ({
              key: `policy-${row.id ?? index}`,
              tone: (num(row.premiumDue) ?? 0) > 0 || row.status !== "ACTIVE" ? "warn" as const : undefined,
              cells: {
                vehicle: row.vehicle || "—", cover: row.cover || "—", status: row.status || "—",
                end: financePeriodLabel(row.endPeriod), due: money(row.premiumDue),
                renew: row.autoRenew ? tOr("companionPage.realisticFarmFinanceLoans.yes", "Yes") : tOr("companionPage.realisticFarmFinanceLoans.no", "No"),
              },
            }))}
          />
        </Card>
      ) : null}
      {insuranceClaimRows.length > 0 ? (
        <Card title={tOr("companionPage.realisticFarmFinanceLoans.insuranceClaimTitle", "Insurance claims")}>
          <ModTable
            columns={[
              { key: "id", label: tOr("companionPage.realisticFarmFinanceLoans.claimId", "Claim") },
              { key: "subject", label: tOr("companionPage.realisticFarmFinanceLoans.claimSubject", "Subject") },
              { key: "status", label: tOr("companionPage.realisticFarmFinanceLoans.claimStatus", "Status") },
              { key: "claimed", label: tOr("companionPage.realisticFarmFinanceLoans.claimed", "Claimed"), align: "end" },
              { key: "approved", label: tOr("companionPage.realisticFarmFinanceLoans.approved", "Approved"), align: "end" },
              { key: "paid", label: tOr("companionPage.realisticFarmFinanceLoans.paid", "Paid"), align: "end" },
            ]}
            rows={insuranceClaimRows.map((row, index) => ({
              key: `claim-${row.id ?? index}`,
              tone: row.status !== "PAID" && row.status !== "SETTLED" ? "warn" as const : undefined,
              cells: {
                id: formatNumber(row.id, 0), subject: row.subject || row.kind || "—",
                status: row.status || "—", claimed: money(row.amountClaimed),
                approved: money(row.approvedAmount), paid: money(row.paidAmount),
              },
            }))}
          />
          <ModEmpty>{tOr("companionPage.realisticFarmFinanceLoans.insuranceNote", "Claimed and approved amounts are separate from recorded payments. A policy's vehicle name does not prove current ownership.")}</ModEmpty>
        </Card>
      ) : null}
      {openAnimalLossRows.length > 0 ? (
        <Card title={tOr("companionPage.realisticFarmFinanceLoans.animalLossTitle", "Animal loss filing windows")}>
          <ModTable
            columns={[
              { key: "id", label: tOr("companionPage.realisticFarmFinanceLoans.lossId", "Loss report") },
              { key: "animal", label: tOr("companionPage.realisticFarmFinanceLoans.lossAnimal", "Animal") },
              { key: "reason", label: tOr("companionPage.realisticFarmFinanceLoans.lossReason", "Recorded reason") },
              { key: "left", label: tOr("companionPage.realisticFarmFinanceLoans.lossPeriodsLeft", "Periods left to file"), align: "end" },
            ]}
            rows={openAnimalLossRows.map((row, index) => ({
              key: `loss-${row.id ?? index}`,
              tone: "warn" as const,
              cells: {
                id: formatNumber(row.id, 0), animal: row.animal || row.animalType || "—",
                reason: row.reason || "—", left: formatNumber(row.periodsLeft, 0),
              },
            }))}
          />
          <ModEmpty>{tOr("companionPage.realisticFarmFinanceLoans.lossNote", "These losses are recorded and have not been submitted as claims. Check the mod's claim form and policy terms before the filing window closes; a report does not guarantee approval or payment.")}</ModEmpty>
        </Card>
      ) : null}
      {veterinaryExpenseRows.length > 0 ? (
        <Card title={tOr("companionPage.realisticFarmFinanceLoans.veterinaryTitle", "Veterinary expense filing windows")}>
          <ModTable
            columns={[
              { key: "id", label: tOr("companionPage.realisticFarmFinanceLoans.veterinaryId", "Expense") },
              { key: "animal", label: tOr("companionPage.realisticFarmFinanceLoans.lossAnimal", "Animal") },
              { key: "disease", label: tOr("companionPage.realisticFarmFinanceLoans.veterinaryDisease", "Recorded illness") },
              { key: "cost", label: tOr("companionPage.realisticFarmFinanceLoans.veterinaryCost", "Treatment cost"), align: "end" },
              { key: "left", label: tOr("companionPage.realisticFarmFinanceLoans.lossPeriodsLeft", "Periods left to file"), align: "end" },
            ]}
            rows={veterinaryExpenseRows.map((row, index) => ({
              key: `vet-${row.id ?? index}`,
              tone: "warn" as const,
              cells: {
                id: formatNumber(row.id, 0), animal: row.animal || row.animalType || "—",
                disease: row.diseases || "—", cost: money(row.treatmentCost),
                left: formatNumber(row.periodsLeft, 0),
              },
            }))}
          />
          <ModEmpty>{tOr("companionPage.realisticFarmFinanceLoans.veterinaryNote", "The mod currently accepts these expense records for filing under its policy and deadline checks. File through its claim form; the treatment cost is not an approved or paid claim.")}</ModEmpty>
        </Card>
      ) : null}
      {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.realisticFarmFinanceLoans.partialAsset", "Some finance records could not be read.")}</ModEmpty> : null}
      {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.realisticFarmFinanceLoans.truncatedAsset", "Only some finance records are listed.")}</ModEmpty> : null}
    </ModPage>
  );
}
