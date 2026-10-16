import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModAbout,
  ModEmpty,
  ModKeyValues,
  ModPage,
  ModStatTiles,
  asList,
  formatNumber,
  num,
  useCompanionPage,
  useMoney,
  yesNo,
  type CompanionPageProps,
  type ModKeyValue,
  type ModStatTile,
} from "@/sections/mods/shared";

function hourText(value: unknown): string {
  const n = num(value);
  if (n == null) return "—";
  return `${String(Math.round(n) % 24).padStart(2, "0")}:00`;
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData } = useCompanionPage(entry.key);
  const money = useMoney();
  const settings = (page?.settings && typeof page.settings === "object" ? page.settings : null) as Record<string, unknown> | null;
  const schedule = (page?.schedule && typeof page.schedule === "object" ? page.schedule : null) as Record<string, unknown> | null;
  const options = asList<number>(settings?.minimumBalanceOptions);
  const next = num(farmData?.nextRepayment);
  const loan = num(farmData?.loan);

  const tiles: ModStatTile[] = farmData
    ? [
        {
          key: "loan",
          label: tOr("companionPage.automaticLoanRepay.statLoan", "Bank loan"),
          value: money(loan),
          hint: tOr("companionPage.automaticLoanRepay.statLoanHint", "{{amount}} interest per day", { amount: money(farmData.dailyInterest) }),
          tone: loan === 0 ? "ok" : undefined,
        },
        { key: "balance", label: tOr("companionPage.automaticLoanRepay.statBalance", "Farm balance"), value: money(farmData.balance) },
        {
          key: "next",
          label: tOr("companionPage.automaticLoanRepay.statNext", "Next automatic repayment"),
          value: money(next),
          hint:
            schedule?.runArmed === true
              ? tOr("companionPage.automaticLoanRepay.statNextHint", "At {{time}}", { time: hourText(settings?.repaymentHour) })
              : tOr("companionPage.automaticLoanRepay.statNextDone", "Already ran this month"),
          tone: (next ?? 0) > 0 ? "ok" : undefined,
        },
        {
          key: "loanAfter",
          label: tOr("companionPage.automaticLoanRepay.statLoanAfter", "Loan afterwards"),
          value: money(farmData.loanAfter),
          hint: tOr("companionPage.automaticLoanRepay.statBalanceAfter", "Balance afterwards {{amount}}", { amount: money(farmData.balanceAfter) }),
        },
        {
          key: "minimum",
          label: tOr("companionPage.automaticLoanRepay.statMinimum", "Cash kept back"),
          value: money(settings?.minimumBalance),
          hint: tOr("companionPage.automaticLoanRepay.statMinimumHint", "Never repays below this balance"),
        },
      ]
    : [];

  const planRows: ModKeyValue[] = farmData
    ? [
        { key: "armed", label: tOr("companionPage.automaticLoanRepay.planArmed", "Repayment due this month"), value: yesNo(schedule?.runArmed) },
        { key: "time", label: tOr("companionPage.automaticLoanRepay.planTime", "Runs at"), value: hourText(settings?.repaymentHour) },
        {
          key: "until",
          label: tOr("companionPage.automaticLoanRepay.planUntil", "In"),
          value:
            num(schedule?.hoursUntilRun) == null
              ? "—"
              : tOr("companionPage.automaticLoanRepay.hours", "{{hours}} h", { hours: formatNumber(schedule?.hoursUntilRun, 0) }),
        },
        { key: "spare", label: tOr("companionPage.automaticLoanRepay.planSpare", "Cash above the kept-back amount"), value: money(farmData.spareAboveMinimum) },
        { key: "step", label: tOr("companionPage.automaticLoanRepay.planStep", "Repaid in steps of"), value: money(settings?.loanStep) },
      ]
    : [];

  const shortOf = num(farmData?.shortOfStep);

  return (
    <ModPage
      entry={entry}
      lead={tOr(
        "companionPage.automaticLoanRepay.lead",
        "Automatic Loan Repay pays down the bank loan once a month at a set hour, using only the cash above the amount you keep back, in whole loan steps. This page shows what the next run will repay.",
      )}
    >
      <ModStatTiles tiles={tiles} />
      <div class="fd-mod-page__grid">
        <Card title={tOr("companionPage.automaticLoanRepay.planTitle", "Next run")}>
          {planRows.length > 0 ? (
            <>
              <ModKeyValues rows={planRows} />
              {loan === 0 ? (
                <ModEmpty>{tOr("companionPage.automaticLoanRepay.noLoan", "No bank loan: nothing to repay.")}</ModEmpty>
              ) : shortOf != null && shortOf > 0 ? (
                <ModEmpty>
                  {tOr("companionPage.automaticLoanRepay.shortOf", "{{amount}} more cash is needed before the next step can be repaid.", { amount: money(shortOf) })}
                </ModEmpty>
              ) : null}
            </>
          ) : (
            <ModEmpty>{tOr("companionPage.automaticLoanRepay.waiting", "The repayment plan appears once the mod's settings are readable.")}</ModEmpty>
          )}
        </Card>
        <Card title={tOr("companionPage.automaticLoanRepay.settingsTitle", "Mod settings")}>
          {settings ? (
            <>
              <ModKeyValues
                rows={[
                  { key: "minimum", label: tOr("companionPage.automaticLoanRepay.statMinimum", "Cash kept back"), value: money(settings.minimumBalance) },
                  { key: "hour", label: tOr("companionPage.automaticLoanRepay.planTime", "Runs at"), value: hourText(settings.repaymentHour) },
                  { key: "step", label: tOr("companionPage.automaticLoanRepay.planStep", "Repaid in steps of"), value: money(settings.loanStep) },
                  {
                    key: "defaults",
                    label: tOr("companionPage.automaticLoanRepay.setDefaults", "Mod defaults"),
                    value: tOr("companionPage.automaticLoanRepay.defaults", "{{amount}} at {{time}}", {
                      amount: money(settings.defaultMinimumBalance),
                      time: hourText(settings.defaultRepaymentHour),
                    }),
                  },
                ]}
              />
              {options.length > 0 ? (
                <p class="fd-economy__muted">
                  {tOr("companionPage.automaticLoanRepay.options", "Kept-back choices: {{list}}", { list: options.map((o) => money(o)).join(", ") })}
                </p>
              ) : null}
            </>
          ) : (
            <ModEmpty>{tOr("companionPage.automaticLoanRepay.noSettings", "Settings were not readable.")}</ModEmpty>
          )}
        </Card>
      </div>
      <ModAbout
        entry={entry}
        lookFor={[
          tOr("companionPage.automaticLoanRepay.look1", "Change the kept-back amount and the repayment hour in the game's settings menu."),
          tOr("companionPage.automaticLoanRepay.look2", "A notification appears when a repayment is made."),
          tOr("companionPage.automaticLoanRepay.look3", "It runs once per month; if you are short that month, it waits until the next."),
        ]}
      />
    </ModPage>
  );
}
