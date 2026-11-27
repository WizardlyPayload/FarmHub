import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData } = useCompanionPage(entry.key);
  const money = useMoney();
  const complete = page?.coverage === "complete";
  const amount = complete ? num(farmData?.pendingAmount) : null;
  const year = complete ? num(farmData?.saleYear) : null;
  const period = complete ? num(farmData?.salePeriod) : null;
  const tiles: ModStatTile[] = amount != null ? [
    { key: "pending", label: tOr("companionPage.autoSwitchCoop.pending", "Awaiting co-operative payment"), value: money(amount) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.autoSwitchCoop.lead", "Co-operative sale proceeds held for a later game period. This is a pending receivable, not farm cash already received or a completed payment ledger.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.autoSwitchCoop.details", "Payment details")}>
        {amount != null && amount > 0 && year != null && period != null ? (
          <div>{tOr("companionPage.autoSwitchCoop.salePeriod", "Sale period")}: {formatNumber(year, 0)} / {formatNumber(period, 0)}</div>
        ) : null}
        {complete && page?.reason === "no-pending-coop-payment" ? <ModEmpty>{tOr("companionPage.autoSwitchCoop.empty", "The live register reports no pending co-operative payment for this farm.")}</ModEmpty> : null}
        {amount != null && amount > 0 && (year == null || period == null) ? <ModEmpty>{tOr("companionPage.autoSwitchCoop.unknownPeriod", "The sale period was not captured.")}</ModEmpty> : null}
        {!complete ? <ModEmpty>{tOr("companionPage.autoSwitchCoop.unavailable", "The co-operative payment register is unavailable or incomplete; no amount is asserted.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
