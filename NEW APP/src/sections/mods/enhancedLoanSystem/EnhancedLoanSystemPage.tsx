import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModAbout,
  ModBar,
  ModEmpty,
  ModKeyValues,
  ModPage,
  ModStatTiles,
  ModTable,
  asList,
  formatNumber,
  formatPercent,
  num,
  useCompanionPage,
  useMoney,
  yesNo,
  type CompanionPageProps,
  type ModKeyValue,
  type ModStatTile,
} from "@/sections/mods/shared";

type LoanRow = {
  amount?: number;
  restAmount?: number;
  interest?: number;
  durationYears?: number;
  restMonths?: number;
  monthlyAnnuity?: number;
  monthlyInterest?: number;
  monthlyRepayment?: number;
  remainingCost?: number;
  remainingInterest?: number;
  specialRedemptionDone?: boolean;
};

type PaidRow = { amount?: number; interest?: number; durationYears?: number };

function monthsText(value: unknown): string {
  const n = num(value);
  if (n == null) return "—";
  const years = Math.floor(n / 12);
  const months = Math.round(n % 12);
  if (years === 0) return tOr("companionPage.enhancedLoanSystem.months", "{{months}} mo", { months });
  return tOr("companionPage.enhancedLoanSystem.yearsMonths", "{{years}} y {{months}} mo", { years, months });
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData } = useCompanionPage(entry.key);
  const money = useMoney();
  const loans = asList<LoanRow>(farmData?.loans);
  const paid = asList<PaidRow>(farmData?.paidOff);
  const settings = (page?.settings && typeof page.settings === "object" ? page.settings : null) as Record<string, unknown> | null;
  const capacity = num(farmData?.borrowingCapacity);

  const tiles: ModStatTile[] = farmData
    ? [
        {
          key: "debt",
          label: tOr("companionPage.enhancedLoanSystem.statDebt", "Outstanding debt"),
          value: money(farmData.debt),
          hint: tOr("companionPage.enhancedLoanSystem.statDebtHint", "{{count}} open loans", { count: formatNumber(farmData.loanCount, 0) }),
          tone: (num(farmData.debt) ?? 0) > 0 ? "warn" : "ok",
        },
        {
          key: "monthly",
          label: tOr("companionPage.enhancedLoanSystem.statMonthly", "Monthly payment"),
          value: money(farmData.monthlyAnnuity),
          hint: tOr("companionPage.enhancedLoanSystem.statMonthlyHint", "{{interest}} of it is interest", { interest: money(farmData.monthlyInterest) }),
        },
        {
          key: "remainingInterest",
          label: tOr("companionPage.enhancedLoanSystem.statRemainingInterest", "Interest still to pay"),
          value: money(farmData.remainingInterest),
          hint: tOr("companionPage.enhancedLoanSystem.statRemainingCostHint", "{{total}} in total if paid as scheduled", {
            total: money(farmData.remainingCost),
          }),
        },
        {
          key: "capacity",
          label: tOr("companionPage.enhancedLoanSystem.statCapacity", "Borrowing capacity"),
          value: money(capacity),
          hint: tOr("companionPage.enhancedLoanSystem.statCapacityHint", "Cash plus collateral, minus twice the open debt"),
          tone: capacity == null ? undefined : capacity <= 0 ? "danger" : "ok",
        },
        {
          key: "paidOff",
          label: tOr("companionPage.enhancedLoanSystem.statPaidOff", "Loans paid off"),
          value: formatNumber(farmData.paidOffCount, 0),
          hint: money(farmData.paidOffTotal),
        },
      ]
    : [];

  const collateralRows: ModKeyValue[] = farmData
    ? [
        { key: "money", label: tOr("companionPage.enhancedLoanSystem.colMoney", "Cash"), value: money(farmData.money) },
        { key: "vehicleValue", label: tOr("companionPage.enhancedLoanSystem.colVehicleValue", "Vehicle value"), value: money(farmData.vehicleValue) },
        {
          key: "vehicleCollateral",
          label: tOr("companionPage.enhancedLoanSystem.colVehicleCollateral", "Counts as collateral ({{pct}})", {
            pct: formatPercent(settings?.vehicleMortgage, { ratio: true, dp: 0 }),
          }),
          value: money(farmData.vehicleCollateral),
        },
        { key: "farmlandValue", label: tOr("companionPage.enhancedLoanSystem.colFarmlandValue", "Farmland value"), value: money(farmData.farmlandValue) },
        {
          key: "farmlandCollateral",
          label: tOr("companionPage.enhancedLoanSystem.colFarmlandCollateral", "Counts as collateral ({{pct}})", {
            pct: formatPercent(settings?.farmlandMortgage, { ratio: true, dp: 0 }),
          }),
          value: money(farmData.farmlandCollateral),
        },
        { key: "debtTwice", label: tOr("companionPage.enhancedLoanSystem.colDebtTwice", "Minus open debt × 2"), value: money((num(farmData.debt) ?? 0) * 2) },
        { key: "capacity", label: tOr("companionPage.enhancedLoanSystem.statCapacity", "Borrowing capacity"), value: money(capacity) },
      ]
    : [];

  const settingRows: ModKeyValue[] = settings
    ? [
        { key: "loanInterest", label: tOr("companionPage.enhancedLoanSystem.setInterest", "Bank interest rate"), value: formatPercent(settings.loanInterest, { dp: 2 }) },
        { key: "dynamicInterest", label: tOr("companionPage.enhancedLoanSystem.setDynamic", "Dynamic interest"), value: yesNo(settings.dynamicInterest) },
        {
          key: "interestRange",
          label: tOr("companionPage.enhancedLoanSystem.setRange", "Interest range in settings"),
          value:
            num(settings.minInterest) == null
              ? "—"
              : tOr("companionPage.enhancedLoanSystem.range", "{{min}} – {{max}}", {
                  min: formatPercent(settings.minInterest, { dp: 1 }),
                  max: formatPercent(settings.maxInterest, { dp: 1 }),
                }),
        },
        {
          key: "maxDuration",
          label: tOr("companionPage.enhancedLoanSystem.setDuration", "Longest loan term"),
          value: num(settings.maxDurationYears) == null ? "—" : tOr("companionPage.enhancedLoanSystem.years", "{{years}} years", { years: formatNumber(settings.maxDurationYears, 0) }),
        },
        { key: "vehicleMortgage", label: tOr("companionPage.enhancedLoanSystem.setVehicle", "Vehicle mortgage share"), value: formatPercent(settings.vehicleMortgage, { ratio: true, dp: 0 }) },
        { key: "farmlandMortgage", label: tOr("companionPage.enhancedLoanSystem.setFarmland", "Farmland mortgage share"), value: formatPercent(settings.farmlandMortgage, { ratio: true, dp: 0 }) },
        {
          key: "specialShare",
          label: tOr("companionPage.enhancedLoanSystem.setSpecial", "Max special repayment per year"),
          value: formatPercent(settings.specialRedemptionShare, { ratio: true, dp: 0 }),
        },
        { key: "multipleSpecial", label: tOr("companionPage.enhancedLoanSystem.setMultiple", "Several special repayments per year"), value: yesNo(settings.multipleSpecialRedemptions) },
      ]
    : [];

  return (
    <ModPage
      entry={entry}
      lead={tOr(
        "companionPage.enhancedLoanSystem.lead",
        "Enhanced Loan System replaces the bank's single credit line with annuity loans: each loan has its own rate and term and is paid monthly. This page lists your open loans, what they still cost and how much more the bank will lend.",
      )}
    >
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.enhancedLoanSystem.loansTitle", "Open loans")}>
        <ModTable
          columns={[
            { key: "amount", label: tOr("companionPage.enhancedLoanSystem.colAmount", "Borrowed"), align: "end" },
            { key: "rest", label: tOr("companionPage.enhancedLoanSystem.colRest", "Still owed") },
            { key: "rate", label: tOr("companionPage.enhancedLoanSystem.colRate", "Rate"), align: "end" },
            { key: "left", label: tOr("companionPage.enhancedLoanSystem.colLeft", "Time left"), align: "end" },
            { key: "annuity", label: tOr("companionPage.enhancedLoanSystem.colAnnuity", "Monthly"), align: "end" },
            { key: "split", label: tOr("companionPage.enhancedLoanSystem.colSplit", "Repayment / interest"), align: "end" },
            { key: "cost", label: tOr("companionPage.enhancedLoanSystem.colCost", "Remaining interest"), align: "end" },
            { key: "special", label: tOr("companionPage.enhancedLoanSystem.colSpecial", "Special repaid this year"), align: "center" },
          ]}
          rows={loans.map((loan, i) => {
            const amount = num(loan.amount) ?? 0;
            const rest = num(loan.restAmount) ?? 0;
            return {
              key: String(i),
              cells: {
                amount: money(loan.amount),
                rest: (
                  <>
                    <ModBar ratio={amount > 0 ? rest / amount : 0} />
                    <small class="fd-economy__muted">{money(loan.restAmount)}</small>
                  </>
                ),
                rate: formatPercent(loan.interest, { dp: 2 }),
                left: monthsText(loan.restMonths),
                annuity: money(loan.monthlyAnnuity),
                split: `${money(loan.monthlyRepayment)} / ${money(loan.monthlyInterest)}`,
                cost: money(loan.remainingInterest),
                special: yesNo(loan.specialRedemptionDone),
              },
            };
          })}
          empty={
            farmData
              ? tOr("companionPage.enhancedLoanSystem.noLoans", "This farm has no open loans.")
              : tOr("companionPage.enhancedLoanSystem.waitingLoans", "Loans appear once the mod's loan list is readable.")
          }
        />
      </Card>
      <div class="fd-mod-page__grid">
        <Card title={tOr("companionPage.enhancedLoanSystem.capacityTitle", "How much the bank will lend")}>
          {collateralRows.length > 0 ? (
            <ModKeyValues rows={collateralRows} />
          ) : (
            <ModEmpty>{tOr("companionPage.enhancedLoanSystem.noCapacity", "Collateral values were not readable.")}</ModEmpty>
          )}
        </Card>
        <Card title={tOr("companionPage.enhancedLoanSystem.settingsTitle", "Bank settings")}>
          {settingRows.length > 0 ? (
            <ModKeyValues rows={settingRows} />
          ) : (
            <ModEmpty>{tOr("companionPage.enhancedLoanSystem.noSettings", "Bank settings were not readable.")}</ModEmpty>
          )}
        </Card>
      </div>
      {paid.length > 0 ? (
        <Card title={tOr("companionPage.enhancedLoanSystem.paidTitle", "Paid-off loans")}>
          <ModTable
            columns={[
              { key: "amount", label: tOr("companionPage.enhancedLoanSystem.colAmount", "Borrowed"), align: "end" },
              { key: "rate", label: tOr("companionPage.enhancedLoanSystem.colRate", "Rate"), align: "end" },
              { key: "term", label: tOr("companionPage.enhancedLoanSystem.colTerm", "Term"), align: "end" },
            ]}
            rows={paid.map((row, i) => ({
              key: `paid-${i}`,
              tone: "ok",
              cells: {
                amount: money(row.amount),
                rate: formatPercent(row.interest, { dp: 2 }),
                term: num(row.durationYears) == null ? "—" : tOr("companionPage.enhancedLoanSystem.years", "{{years}} years", { years: formatNumber(row.durationYears, 0) }),
              },
            }))}
          />
        </Card>
      ) : null}
      <ModAbout
        entry={entry}
        lookFor={[
          tOr("companionPage.enhancedLoanSystem.look1", "Open the Finances page in the in-game menu to take out a new loan or make a special repayment."),
          tOr("companionPage.enhancedLoanSystem.look2", "Payments are taken at each month change; keep enough cash on hand."),
          tOr("companionPage.enhancedLoanSystem.look3", "Selling vehicles or land lowers your collateral and so the amount you can borrow."),
        ]}
      />
    </ModPage>
  );
}
