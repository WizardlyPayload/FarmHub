import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Group = {
  fillType?: string;
  title?: string;
  state?: string;
  count?: number;
  liters?: number;
  batchCount?: number;
  averageProgress?: number;
};

const stateLabels: Record<string, string> = {
  fermenting: "Fermenting", ready: "Ready", other: "Other",
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const groups = farmData && num(farmId) != null ? asList<Group>(page?.groups) : [];
  const tiles: ModStatTile[] = farmData ? [
    { key: "total", label: tOr("companionPage.baleBatchTracker.total", "Tracked bales"), value: formatNumber(farmData.totalCount, 0) },
    { key: "fermenting", label: tOr("companionPage.baleBatchTracker.fermenting", "Fermenting"), value: formatNumber(farmData.fermentingCount, 0) },
    { key: "ready", label: tOr("companionPage.baleBatchTracker.ready", "Ready"), value: formatNumber(farmData.readyCount, 0) },
    { key: "stored", label: tOr("companionPage.baleBatchTracker.stored", "In storage"), value: formatNumber(farmData.storedCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.baleBatchTracker.lead", "See the bale groups and fermentation readiness reported by Bale Batch Tracker for your current farm. Counts update in the game.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.baleBatchTracker.groups", "Bale groups")}>
        <ModTable
          columns={[
            { key: "type", label: tOr("companionPage.baleBatchTracker.type", "Bale type") },
            { key: "state", label: tOr("companionPage.baleBatchTracker.state", "State") },
            { key: "count", label: tOr("companionPage.baleBatchTracker.count", "Bales"), align: "end" },
            { key: "liters", label: tOr("companionPage.baleBatchTracker.liters", "Volume"), align: "end" },
            { key: "progress", label: tOr("companionPage.baleBatchTracker.progress", "Fermentation"), align: "end" },
          ]}
          rows={groups.map((group, index) => ({
            key: `${group.fillType || index}:${group.state || ""}`,
            cells: {
              type: group.title || group.fillType || "—",
              state: tOr(`companionPage.baleBatchTracker.state.${group.state || "other"}`, stateLabels[group.state || ""] || group.state || "—"),
              count: formatNumber(group.count, 0),
              liters: `${formatNumber(group.liters, 0)} L`,
              progress: group.state === "fermenting" && num(group.averageProgress) != null
                ? `${formatNumber((num(group.averageProgress) || 0) * 100, 0)}%` : "—",
            },
          }))}
          empty={tOr("companionPage.baleBatchTracker.empty", "No tracked bales for this farm yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.baleBatchTracker.truncated", "Only the first bale groups are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
