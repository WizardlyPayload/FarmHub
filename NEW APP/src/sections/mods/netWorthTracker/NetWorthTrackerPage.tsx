import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type WorthSample = {
  farmId?: number;
  dayId?: number;
  year?: number;
  period?: number;
  dayInPeriod?: number;
  amount?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<WorthSample>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "samples", label: tOr("companionPage.netWorthTracker.samples", "Recorded days"), value: formatNumber(farmData.sampleCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.netWorthTracker.lead", "See the net-worth samples recorded by Net Worth Tracker for this farm on game day changes. The mod's calculation may differ from Farm Dashboard's current estimate; a missing sample is not zero.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.netWorthTracker.tableTitle", "Saved net-worth history")}>
        <ModTable
          columns={[
            { key: "day", label: tOr("companionPage.netWorthTracker.day", "Game day") },
            { key: "period", label: tOr("companionPage.netWorthTracker.period", "Year / period / day") },
            { key: "amount", label: tOr("companionPage.netWorthTracker.amount", "Net worth"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.dayId ?? index}-${index}`,
            cells: {
              day: formatNumber(row.dayId, 0),
              period: num(row.year) != null && num(row.period) != null && num(row.dayInPeriod) != null
                ? `${formatNumber(row.year, 0)} / ${formatNumber(row.period, 0)} / ${formatNumber(row.dayInPeriod, 0)}` : "—",
              amount: num(row.amount) != null ? money(num(row.amount) || 0) : "—",
            },
          }))}
          empty={tOr("companionPage.netWorthTracker.empty", "No dated net-worth samples for this farm yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.netWorthTracker.truncated", "Only part of the saved history is listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
