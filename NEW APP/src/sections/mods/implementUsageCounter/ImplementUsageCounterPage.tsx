import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type UsageRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  activity?: string;
  unit?: "ha" | "bales";
  lifetime?: number;
  session?: number;
};

const activities: Record<string, string> = {
  cultivator: "Cultivation", cutter: "Harvesting", mower: "Mowing", plow: "Plowing",
  sowingMachine: "Seeding / planting", sprayer: "Spraying", baleWrap: "Bale wrapping",
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<UsageRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "implements", label: tOr("companionPage.implementUsageCounter.implements", "Implements"), value: formatNumber(farmData.vehicleCount, 0) },
    { key: "area", label: tOr("companionPage.implementUsageCounter.areaCounters", "Area counters"), value: formatNumber(farmData.areaCounterCount, 0) },
    { key: "bales", label: tOr("companionPage.implementUsageCounter.baleCounters", "Bale counters"), value: formatNumber(farmData.baleCounterCount, 0) },
    { key: "used", label: tOr("companionPage.implementUsageCounter.nonzero", "Used counters"), value: formatNumber(farmData.nonzeroCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.implementUsageCounter.lead", "See the worked area or wrapped-bale counts recorded for your implements. Session counters can be reset in the game.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.implementUsageCounter.tableTitle", "Implement usage")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.implementUsageCounter.vehicle", "Implement") },
            { key: "activity", label: tOr("companionPage.implementUsageCounter.activity", "Activity") },
            { key: "lifetime", label: tOr("companionPage.implementUsageCounter.lifetime", "Lifetime"), align: "end" },
            { key: "session", label: tOr("companionPage.implementUsageCounter.session", "Since reset"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.vehicleId || index}:${row.activity || ""}`,
            cells: {
              vehicle: row.vehicle || "—",
              activity: tOr(`companionPage.implementUsageCounter.activity.${row.activity || ""}`, activities[row.activity || ""] || row.activity || "—"),
              lifetime: `${formatNumber(row.lifetime, row.unit === "ha" ? 2 : 0)} ${row.unit || ""}`,
              session: `${formatNumber(row.session, row.unit === "ha" ? 2 : 0)} ${row.unit || ""}`,
            },
          }))}
          empty={tOr("companionPage.implementUsageCounter.empty", "No usage counters for your current implements yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.implementUsageCounter.truncated", "Only the first implement counters are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
