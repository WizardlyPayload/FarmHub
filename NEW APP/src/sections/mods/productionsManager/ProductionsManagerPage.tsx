import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type ScheduleRow = {
  farmId?: number;
  point?: string;
  recipe?: string;
  scheduleEnabled?: boolean;
  months?: number[];
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<ScheduleRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "count", label: tOr("companionPage.productionsManager.count", "Saved schedules"), value: formatNumber(farmData.scheduleCount, 0) },
    { key: "enabled", label: tOr("companionPage.productionsManager.enabledCount", "Enabled schedules"), value: formatNumber(farmData.enabledCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.productionsManager.lead", "Saved recipe schedules for production points this farm currently owns. These choices come from a profile-wide settings file; a chosen period is a plan, not proof that production ran.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.productionsManager.tableTitle", "Owned production schedules")}>
        <ModTable
          columns={[
            { key: "point", label: tOr("companionPage.productionsManager.point", "Production") },
            { key: "recipe", label: tOr("companionPage.productionsManager.recipe", "Recipe") },
            { key: "enabled", label: tOr("companionPage.productionsManager.enabled", "Schedule") },
            { key: "months", label: tOr("companionPage.productionsManager.months", "Selected periods") },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.point}-${row.recipe}-${index}`,
            cells: {
              point: row.point || "—",
              recipe: row.recipe || "—",
              enabled: row.scheduleEnabled
                ? tOr("companionPage.productionsManager.on", "Enabled")
                : tOr("companionPage.productionsManager.off", "Disabled"),
              months: asList<number>(row.months).length
                ? asList<number>(row.months).join(", ")
                : tOr("companionPage.productionsManager.all", "All periods"),
            },
          }))}
          empty={tOr("companionPage.productionsManager.empty", "No saved schedule for this farm's current production lines yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.productionsManager.truncated", "Only part of the saved schedules is listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
