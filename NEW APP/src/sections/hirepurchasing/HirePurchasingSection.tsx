import { Badge, Card } from "@/components/ui";
import { t } from "@/i18n/i18n";
import {
  asArray,
  dealVehicleLabel,
  formatMoney,
  formatMonthsLeft,
  getHirePurchasingForActiveFarm,
  isHirePurchasingModActive,
  type HirePurchasingDeal,
  type HirePurchasingPayload,
} from "@/lib/hirePurchasing";
import { useDashboardStore } from "@/store/dashboard-store";
import type { DashboardPayload } from "@/types/dashboard";
import "@/sections/economy/economy.css";

function HirePurchasingTab({
  payload,
  farmId,
}: {
  payload: DashboardPayload;
  farmId: number;
}) {
  const hirePurchasing = payload.hirePurchasing as HirePurchasingPayload | null | undefined;

  if (!isHirePurchasingModActive(hirePurchasing)) {
    return (
      <div class="fd-economy__empty">
        <h3>{t("hirepurchasing.subtitleDisabled")}</h3>
        <p>{t("hirepurchasing.hintDisabled")}</p>
      </div>
    );
  }

  const farm = getHirePurchasingForActiveFarm(hirePurchasing, farmId);
  const deals = asArray<HirePurchasingDeal>(farm?.deals);
  const summary = farm?.summary;

  if (!farm) {
    return <div class="fd-economy__empty">{t("hirepurchasing.subtitleEmpty")}</div>;
  }

  return (
    <>
      <p class="fd-economy__muted">
        {t("hirepurchasing.subtitleFarm", { farmId })}
      </p>
      {summary ? (
        <div class="fd-economy__env">
          <Badge tone="default">
            {t("hirepurchasing.summaryDeals", {
              count: Number(summary.dealCount) || deals.length,
            })}
          </Badge>
          {summary.totalMonthly != null ? (
            <Badge>
              {t("hirepurchasing.summaryMonthly", {
                amount: formatMoney(summary.totalMonthly),
              })}
            </Badge>
          ) : null}
          {summary.totalRemaining != null ? (
            <Badge tone="warn">
              {t("hirepurchasing.summaryRemaining", {
                amount: formatMoney(summary.totalRemaining),
              })}
            </Badge>
          ) : null}
        </div>
      ) : null}

      <Card title={t("hirepurchasing.dealsTitle")}>
        {deals.length === 0 ? (
          <p class="fd-economy__muted">{t("hirepurchasing.noDeals")}</p>
        ) : (
          <div class="fd-economy__table-wrap">
            <table class="fd-economy__table">
              <thead>
                <tr>
                  <th>{t("hirepurchasing.colVehicle")}</th>
                  <th class="text-end">{t("hirepurchasing.colMonthly")}</th>
                  <th class="text-end">{t("hirepurchasing.colRemaining")}</th>
                  <th class="text-end">{t("hirepurchasing.colMonths")}</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((deal, i) => (
                  <tr key={String(deal.id ?? deal.vehicleUniqueId ?? i)}>
                    <td>{dealVehicleLabel(deal)}</td>
                    <td class="text-end">{formatMoney(deal.monthlyPayment)}</td>
                    <td class="text-end">{formatMoney(deal.remainingCost)}</td>
                    <td class="text-end">{formatMonthsLeft(deal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

export function HirePurchasingSection() {
  const payload = useDashboardStore((s) => s.payload);
  const farmId = useDashboardStore((s) => s.activeFarmId) ?? 1;

  const hirePurchasing = payload?.hirePurchasing as HirePurchasingPayload | null | undefined;

  if (!payload || !isHirePurchasingModActive(hirePurchasing)) {
    return (
      <div class="fd-economy">
        <header class="fd-section-header">
          <h2>{t("nav.mod.hirepurchasing")}</h2>
          <p class="fd-muted-sm">{t("hirepurchasing.hintDisabled")}</p>
        </header>
      </div>
    );
  }

  const byFarm = hirePurchasing?.byFarm;
  const waitingFirstCollect =
    !byFarm ||
    (Array.isArray(byFarm)
      ? byFarm.length === 0
      : Object.keys(byFarm as object).length === 0);

  return (
    <div class="fd-economy">
      <header class="fd-section-header">
        <h2>{t("nav.mod.hirepurchasing")}</h2>
        <p class="fd-muted-sm">
          {waitingFirstCollect
            ? t("hirepurchasing.hintWaiting")
            : t("hirepurchasing.subtitle")}
        </p>
      </header>
      <HirePurchasingTab payload={payload} farmId={farmId} />
    </div>
  );
}

export { HirePurchasingTab };
