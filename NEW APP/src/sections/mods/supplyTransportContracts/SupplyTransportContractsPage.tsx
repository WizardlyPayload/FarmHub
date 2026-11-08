import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.supplyTransportContracts";
type Row = {
  farmId?: number; missionId?: string; destination?: string; fillType?: string;
  expectedLitres?: number; deliveredLitres?: number; remainingLitres?: number;
  listedReward?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Row>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" && farmData.runningCount != null ? [
    { key: "running", label: tOr(`${K}.running`, "Running deliveries"), value: formatNumber(farmData.runningCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current delivery progress for this farm's accepted, running Supply and Transport Contracts. Listed rewards are potential payment, not money received.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Accepted delivery contracts")}>
        <ModTable columns={[
          { key: "destination", label: tOr(`${K}.destination`, "Destination") },
          { key: "fillType", label: tOr(`${K}.fillType`, "Commodity") },
          { key: "delivery", label: tOr(`${K}.delivery`, "Delivered / target"), align: "end" },
          { key: "remaining", label: tOr(`${K}.remaining`, "Remaining"), align: "end" },
          { key: "reward", label: tOr(`${K}.reward`, "Listed reward"), align: "end" },
        ]} rows={rows.map((row, index) => ({
          key: row.missionId || String(index),
          cells: {
            destination: row.destination || "—",
            fillType: row.fillType || "—",
            delivery: `${formatNumber(row.deliveredLitres, 0)} / ${formatNumber(row.expectedLitres, 0)} L`,
            remaining: `${formatNumber(row.remainingLitres, 0)} L`,
            reward: formatNumber(row.listedReward, 0),
          },
        }))} empty={tOr(`${K}.empty`, "No accepted, running delivery contract is assigned to this farm.")} />
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "A running contract had ambiguous or unreadable details and was withheld; the total is withheld.")}</ModEmpty> : null}
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the mission register is shown; the total is withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
