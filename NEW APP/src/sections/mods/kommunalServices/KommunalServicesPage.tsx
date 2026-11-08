import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Mission = {
  farmId?: number; missionId?: string;
  targetSquareMeters?: number; trimmedSquareMeters?: number;
  remainingSquareMeters?: number; progressPercent?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Mission>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "running", label: tOr("companionPage.kommunalServices.running", "Accepted missions in progress"), value: formatNumber(farmData.runningCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.kommunalServices.lead", "Trimmed-area progress for this farm's accepted, running Kommunal Services missions. These are game-area readings, not completed contracts or payments.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.kommunalServices.tableTitle", "Running municipal work")}>
        <ModTable
          columns={[
            { key: "mission", label: tOr("companionPage.kommunalServices.mission", "Mission") },
            { key: "target", label: tOr("companionPage.kommunalServices.target", "Area target") },
            { key: "trimmed", label: tOr("companionPage.kommunalServices.trimmed", "Trimmed area") },
            { key: "remaining", label: tOr("companionPage.kommunalServices.remaining", "Area remaining") },
            { key: "progress", label: tOr("companionPage.kommunalServices.progress", "Progress") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.missionId || `${index}`,
            cells: {
              mission: row.missionId || "—",
              target: `${formatNumber(row.targetSquareMeters, 2)} m²`,
              trimmed: `${formatNumber(row.trimmedSquareMeters, 2)} m²`,
              remaining: `${formatNumber(row.remainingSquareMeters, 2)} m²`,
              progress: `${formatNumber(row.progressPercent, 2)}%`,
            },
          }))}
          empty={tOr("companionPage.kommunalServices.empty", "No accepted Kommunal Services mission is currently running for this farm.")}
        />
        {page?.coverage === "partial" || page?.coverage === "truncated" ? (
          <ModEmpty>{tOr("companionPage.kommunalServices.partial", "Some running mission readings were unavailable; counts are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
