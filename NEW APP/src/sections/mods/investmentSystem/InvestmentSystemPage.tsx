import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.investmentSystem";
type Investment = {
  farmId?: number; id?: number; amount?: number; originalAmount?: number;
  annualRatePercent?: number; compounding?: boolean; termYears?: number;
  earnedInterest?: number; depositMonth?: number; endMonth?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<Investment>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    ...(num(farmData.investmentCount) == null ? [] : [
      { key: "investments", label: tOr(`${K}.count`, "Current investments"), value: formatNumber(farmData.investmentCount, 0) },
    ]),
    ...(num(farmData.totalEarnedAllTime) == null ? [] : [
      { key: "earned", label: tOr(`${K}.earned`, "All-time interest recorded"), value: money(farmData.totalEarnedAllTime) },
    ]),
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Investment System's farm-owned deposit records. Earned interest is a mod counter and may already be reflected in native farm money; it is not added to cash here. Deposit and maturity months are the mod's absolute month indices.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Current investment records")}>
        <ModTable columns={[
          { key: "id", label: tOr(`${K}.id`, "Deposit") },
          { key: "amount", label: tOr(`${K}.amount`, "Recorded amount"), align: "end" },
          { key: "rate", label: tOr(`${K}.rate`, "Annual rate"), align: "end" },
          { key: "mode", label: tOr(`${K}.mode`, "Interest mode") },
          { key: "earned", label: tOr(`${K}.rowEarned`, "Earned interest"), align: "end" },
          { key: "term", label: tOr(`${K}.term`, "Term / maturity month") },
        ]} rows={rows.map((row, index) => ({ key: `${row.id ?? index}`, cells: {
          id: num(row.id) == null ? "—" : `#${formatNumber(row.id, 0)}`,
          amount: money(row.amount),
          rate: num(row.annualRatePercent) == null ? "—" : `${formatNumber(row.annualRatePercent, 1)}%`,
          mode: row.compounding ? tOr(`${K}.compound`, "Compounding") : tOr(`${K}.paidOut`, "Paid to farm"),
          earned: money(row.earnedInterest),
          term: num(row.termYears) == null && num(row.endMonth) == null ? "—"
            : `${formatNumber(row.termYears, 0)} y / ${formatNumber(row.endMonth, 0)}`,
        } }))} empty={page?.coverage === "truncated"
          ? tOr(`${K}.truncated`, "Only part of this farm's investment register was scanned.")
          : page?.readState === "partial"
            ? tOr(`${K}.partial`, "Invalid or foreign investment records were withheld.")
            : tOr(`${K}.empty`, "No current investment is recorded for this farm.")} />
        {rows.length > 0 && page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of this farm's investment register was scanned.")}</ModEmpty> : null}
        {rows.length > 0 && page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Invalid or foreign investment records were withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
