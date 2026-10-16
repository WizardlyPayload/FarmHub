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

type PopupRow = { key?: string; title?: string; enabled?: boolean };

const HOOKS: { key: string; label: () => string }[] = [
  { key: "shop", label: () => tOr("companionPage.iNeedALoan.hookShop", "Vehicle shop") },
  { key: "construction", label: () => tOr("companionPage.iNeedALoan.hookConstruction", "Construction") },
  { key: "farmland", label: () => tOr("companionPage.iNeedALoan.hookFarmland", "Farmland purchase") },
  { key: "animals", label: () => tOr("companionPage.iNeedALoan.hookAnimals", "Animal dealer") },
  { key: "refill", label: () => tOr("companionPage.iNeedALoan.hookRefill", "Refill dialogs") },
  { key: "workshop", label: () => tOr("companionPage.iNeedALoan.hookWorkshop", "Workshop repairs") },
  { key: "palletShop", label: () => tOr("companionPage.iNeedALoan.hookPalletShop", "Pallet shop") },
  { key: "existingPlaceable", label: () => tOr("companionPage.iNeedALoan.hookPlaceable", "Placeable upgrades") },
];

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData } = useCompanionPage(entry.key);
  const money = useMoney();
  const settings = (page?.settings && typeof page.settings === "object" ? page.settings : null) as Record<string, unknown> | null;
  const hooks = (page?.hooks && typeof page.hooks === "object" ? page.hooks : null) as Record<string, unknown> | null;
  const popups = asList<PopupRow>(page?.popups);
  const loan = num(farmData?.loan);
  const loanMax = num(farmData?.loanMax);

  const tiles: ModStatTile[] = farmData
    ? [
        {
          key: "balance",
          label: tOr("companionPage.iNeedALoan.statBalance", "Farm balance"),
          value: money(farmData.balance),
          hint:
            farmData.lowBalance === true
              ? tOr("companionPage.iNeedALoan.statLowHint", "Below the {{amount}} warning level", { amount: money(settings?.lowBalanceThreshold) })
              : null,
          tone: farmData.lowBalance === true ? "warn" : "ok",
        },
        {
          key: "loan",
          label: tOr("companionPage.iNeedALoan.statLoan", "Bank loan"),
          value: money(loan),
          hint: tOr("companionPage.iNeedALoan.statLoanHint", "{{amount}} interest per day", { amount: money(farmData.dailyInterest) }),
        },
        {
          key: "headroom",
          label: tOr("companionPage.iNeedALoan.statHeadroom", "Still available to borrow"),
          value: money(farmData.headroom),
          hint:
            num(farmData.headroomSteps) == null
              ? null
              : tOr("companionPage.iNeedALoan.statHeadroomHint", "{{steps}} steps of {{step}}", {
                  steps: formatNumber(farmData.headroomSteps, 0),
                  step: money(settings?.loanStep),
                }),
          tone: (num(farmData.headroom) ?? 1) <= 0 ? "danger" : undefined,
        },
        { key: "loanMax", label: tOr("companionPage.iNeedALoan.statLoanMax", "Credit limit"), value: money(loanMax) },
        {
          key: "rate",
          label: tOr("companionPage.iNeedALoan.statRate", "Bank interest rate"),
          value: formatPercent(page?.bankInterestRate, { ratio: true, dp: 1 }),
          hint: tOr("companionPage.iNeedALoan.statRateHint", "Per year, charged daily"),
        },
      ]
    : [];

  const settingRows: ModKeyValue[] = settings
    ? [
        { key: "loanStep", label: tOr("companionPage.iNeedALoan.setStep", "Borrowing step"), value: money(settings.loanStep) },
        { key: "buffer", label: tOr("companionPage.iNeedALoan.setBuffer", "Extra buffer on top of the price"), value: money(settings.bufferAmount) },
        { key: "bufferOn", label: tOr("companionPage.iNeedALoan.setBufferOn", "Low-balance buffer enabled"), value: yesNo(settings.lowBalanceBuffer) },
        { key: "threshold", label: tOr("companionPage.iNeedALoan.setThreshold", "Low-balance warning level"), value: money(settings.lowBalanceThreshold) },
      ]
    : [];

  return (
    <ModPage
      entry={entry}
      lead={tOr(
        "companionPage.iNeedALoan.lead",
        "I Need A Loan offers to borrow the shortfall when you buy something you cannot afford, in steps of the bank's loan size. This page shows how much credit is left and where the offer pops up.",
      )}
    >
      <ModStatTiles tiles={tiles} />
      {farmData && loanMax != null && loanMax > 0 ? (
        <Card title={tOr("companionPage.iNeedALoan.usageTitle", "Credit line used")}>
          <ModBar ratio={(loan ?? 0) / loanMax} tone={(loan ?? 0) / loanMax >= 0.9 ? "danger" : (loan ?? 0) / loanMax >= 0.6 ? "warn" : undefined} />
          <p class="fd-economy__muted">
            {tOr("companionPage.iNeedALoan.usage", "{{loan}} of {{max}} borrowed", { loan: money(loan), max: money(loanMax) })}
          </p>
        </Card>
      ) : null}
      <div class="fd-mod-page__grid">
        <Card title={tOr("companionPage.iNeedALoan.popupsTitle", "Loan offers")}>
          <ModTable
            columns={[
              { key: "title", label: tOr("companionPage.iNeedALoan.colPopup", "When buying") },
              { key: "enabled", label: tOr("companionPage.iNeedALoan.colEnabled", "Offer shown"), align: "center" },
            ]}
            rows={popups.map((row, i) => ({
              key: row.key ?? String(i),
              tone: row.enabled === false ? "warn" : undefined,
              cells: { title: row.title ?? row.key ?? "—", enabled: yesNo(row.enabled) },
            }))}
            empty={tOr("companionPage.iNeedALoan.noPopups", "The popup settings were not readable.")}
          />
          {num(page?.pendingRequests) ? (
            <p class="fd-economy__muted">
              {tOr("companionPage.iNeedALoan.pending", "{{count}} loan requests waiting for the server.", { count: formatNumber(page?.pendingRequests, 0) })}
            </p>
          ) : null}
        </Card>
        <Card title={tOr("companionPage.iNeedALoan.hooksTitle", "Where the mod is active")}>
          {hooks ? (
            <ModKeyValues rows={HOOKS.map((h) => ({ key: h.key, label: h.label(), value: yesNo(hooks[h.key]) }))} />
          ) : (
            <ModEmpty>{tOr("companionPage.iNeedALoan.noHooks", "Not readable.")}</ModEmpty>
          )}
        </Card>
        <Card title={tOr("companionPage.iNeedALoan.settingsTitle", "Mod settings")}>
          {settingRows.length > 0 ? (
            <ModKeyValues rows={settingRows} />
          ) : (
            <ModEmpty>{tOr("companionPage.iNeedALoan.noSettings", "Settings were not readable.")}</ModEmpty>
          )}
        </Card>
      </div>
      <ModAbout
        entry={entry}
        lookFor={[
          tOr("companionPage.iNeedALoan.look1", "Try to buy something above your balance: the mod offers the missing amount as a loan."),
          tOr("companionPage.iNeedALoan.look2", "The loan is the normal bank loan, so repay it on the Finances page."),
          tOr("companionPage.iNeedALoan.look3", "Each offer can be switched off in the game's settings menu."),
        ]}
      />
    </ModPage>
  );
}
