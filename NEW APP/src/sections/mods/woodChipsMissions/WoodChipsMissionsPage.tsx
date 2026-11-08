import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type WoodChipsRow = {
  farmId?: number;
  missionId?: string;
  station?: string;
  expectedLitres?: number;
  deliveredLitres?: number;
  remainingLitres?: number;
  progressPercent?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<WoodChipsRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "running", label: tOr("companionPage.woodChipsMissions.running", "Running missions"), value: formatNumber(farmData.runningCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.woodChipsMissions.lead", "Wood-chip delivery targets on this farm's accepted, running missions. This progress is not a payout or completed contract.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.woodChipsMissions.tableTitle", "Wood-chip delivery progress")}>
        <ModTable
          columns={[
            { key: "station", label: tOr("companionPage.woodChipsMissions.station", "Sell point") },
            { key: "delivery", label: tOr("companionPage.woodChipsMissions.delivery", "Delivered / target"), align: "end" },
            { key: "remaining", label: tOr("companionPage.woodChipsMissions.remaining", "Remaining"), align: "end" },
            { key: "progress", label: tOr("companionPage.woodChipsMissions.progress", "Progress"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: row.missionId || String(index),
            cells: {
              station: row.station || "—",
              delivery: `${formatNumber(row.deliveredLitres, 0)} / ${formatNumber(row.expectedLitres, 0)} L`,
              remaining: `${formatNumber(row.remainingLitres, 0)} L`,
              progress: `${formatNumber(row.progressPercent, 0)}%`,
            },
          }))}
          empty={tOr("companionPage.woodChipsMissions.empty", "No running wood-chip mission is assigned to this farm.")}
        />
        {page?.readState === "partial" ? <ModEmpty>{tOr("companionPage.woodChipsMissions.partial", "A running mission had unreadable progress and was withheld.")}</ModEmpty> : null}
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.woodChipsMissions.truncated", "Only part of the mission list is shown.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
