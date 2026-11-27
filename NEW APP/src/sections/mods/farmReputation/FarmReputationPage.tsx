import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Contractor = {
  farmId?: number;
  contractor?: string;
  jobs?: number;
  reputation?: number;
  completed?: number;
  cancelled?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Contractor>(page?.contractors).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "score", label: tOr("companionPage.farmReputation.score", "Reputation score"), value: formatNumber(farmData.score, 0) },
    { key: "rank", label: tOr("companionPage.farmReputation.rank", "Rank"), value: farmData.rank || "—" },
    { key: "limit", label: tOr("companionPage.farmReputation.limit", "Mission limit"), value: formatNumber(farmData.missionLimit, 0) },
    { key: "contractors", label: tOr("companionPage.farmReputation.contractors", "Contractors"), value: formatNumber(farmData.contractorCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.farmReputation.lead", "Read this farm's saved reputation and contractor record. Rank and mission limit follow the mod's current thresholds; this page does not claim a completed mission or payout.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.farmReputation.tableTitle", "Contractor record")}>
        <ModTable
          columns={[
            { key: "name", label: tOr("companionPage.farmReputation.name", "Contractor") },
            { key: "jobs", label: tOr("companionPage.farmReputation.jobs", "Jobs"), align: "end" },
            { key: "reputation", label: tOr("companionPage.farmReputation.reputation", "Reputation"), align: "end" },
            { key: "completed", label: tOr("companionPage.farmReputation.completed", "Completed"), align: "end" },
            { key: "cancelled", label: tOr("companionPage.farmReputation.cancelled", "Cancelled"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.contractor || index}-${index}`,
            cells: {
              name: row.contractor || "—",
              jobs: num(row.jobs) == null ? "—" : formatNumber(row.jobs, 0),
              reputation: num(row.reputation) == null ? "—" : formatNumber(row.reputation, 0),
              completed: num(row.completed) == null ? "—" : formatNumber(row.completed, 0),
              cancelled: num(row.cancelled) == null ? "—" : formatNumber(row.cancelled, 0),
            },
          }))}
          empty={tOr("companionPage.farmReputation.empty", "No contractor record for this farm yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.farmReputation.truncated", "Only part of this farm's contractor record is listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
