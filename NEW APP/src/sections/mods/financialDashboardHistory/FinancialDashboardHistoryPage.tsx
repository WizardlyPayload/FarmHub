import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.financialDashboardHistory";

type DailyReading = {
  farmId?: number; day?: number; observedInflow?: number;
  observedOutflow?: number; observedChanges?: number; closingBalance?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const days = asList<DailyReading>(page?.recentDays)
    .filter((day) => num(day.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "days", label: tOr(`${K}.days`, "Days with observed changes"), value: formatNumber(farmData.changedDays, 0) },
    { key: "changes", label: tOr(`${K}.changes`, "Observed balance changes"), value: formatNumber(farmData.observedChanges, 0) },
    { key: "balance", label: tOr(`${K}.balance`, "Last recorded balance"), value: money(farmData.lastRecordedBalance) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Single-player history for the local farm. Inflow and outflow are estimates from observed balance changes, not classified transactions. Changes while the game was closed are unknown. The table shows the most recent 60 recorded days.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Estimated daily movements")}>
        <ModTable columns={[
          { key: "day", label: tOr(`${K}.day`, "Game day") },
          { key: "inflow", label: tOr(`${K}.inflow`, "Observed inflow"), align: "end" },
          { key: "outflow", label: tOr(`${K}.outflow`, "Observed outflow"), align: "end" },
          { key: "changes", label: tOr(`${K}.changes`, "Observed balance changes"), align: "end" },
          { key: "balance", label: tOr(`${K}.closing`, "Recorded closing balance"), align: "end" },
        ]} rows={days.map((day, index) => ({
          key: `${day.day ?? "unknown"}-${index}`,
          cells: {
            day: num(day.day) === null ? "—" : formatNumber(day.day, 0),
            inflow: money(day.observedInflow),
            outflow: money(day.observedOutflow),
            changes: num(day.observedChanges) === null ? "—" : formatNumber(day.observedChanges, 0),
            balance: money(day.closingBalance),
          },
        }))} empty={tOr(`${K}.empty`, "No daily balance reading has been captured for this farm yet.")} />
      </Card>
      {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Some saved history could not be validated, so totals and daily rows are withheld.")}</ModEmpty> : null}
    </ModPage>
  );
}
