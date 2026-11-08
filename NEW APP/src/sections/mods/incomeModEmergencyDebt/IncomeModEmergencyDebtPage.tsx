import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.incomeModEmergencyDebt";

export function Page({ entry }: CompanionPageProps) {
  const { farmData } = useCompanionPage(entry.key);
  const money = useMoney();
  const principal = num(farmData?.principal);
  const interest = num(farmData?.accruedInterest);
  const outstanding = num(farmData?.outstanding);
  const tiles: ModStatTile[] = farmData ? [
    { key: "status", label: tOr(`${K}.status`, "Record status"),
      value: farmData.active === true ? tOr(`${K}.active`, "Active debt") : tOr(`${K}.retired`, "Retired record") },
    { key: "outstanding", label: tOr(`${K}.outstanding`, "Emergency debt outstanding"),
      value: outstanding == null ? "—" : money(outstanding) },
    { key: "principal", label: tOr(`${K}.principal`, "Principal"),
      value: principal == null ? "—" : money(principal) },
    { key: "interest", label: tOr(`${K}.interest`, "Accrued interest"),
      value: interest == null ? "—" : money(interest) },
    { key: "draws", label: tOr(`${K}.draws`, "Recorded draws"),
      value: formatNumber(farmData.drawCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Income Mod's emergency-debt record for this farm. This debt is separate from the game's native bank loan. A retained retired record can show past draw count without an amount currently owed.")}>
      <Card title={tOr(`${K}.title`, "Emergency-debt record")}>
        {farmData ? <ModStatTiles tiles={tiles} /> :
          <ModEmpty>{tOr(`${K}.empty`, "No ready Income Mod emergency-debt record is available for this farm.")}</ModEmpty>}
        {farmData && num(farmData.lastSettledMonth) != null ?
          <p>{tOr(`${K}.settled`, "Last settled period counter")}: {formatNumber(farmData.lastSettledMonth, 0)}</p> : null}
        {farmData && num(farmData.interestEligibleFromMonth) != null ?
          <p>{tOr(`${K}.eligible`, "Interest eligible from period counter")}: {formatNumber(farmData.interestEligibleFromMonth, 0)}</p> : null}
      </Card>
    </ModPage>
  );
}
