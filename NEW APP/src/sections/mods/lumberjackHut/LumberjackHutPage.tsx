import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type HutRow = {
  farmId?: number;
  siteId?: string;
  site?: string;
  farmlandId?: number;
  pendingLitres?: number;
  cycleProgressPercent?: number;
  autoSuspended?: boolean;
};

const K = "companionPage.lumberjackHut";

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<HutRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const complete = page?.coverage === "complete";
  const tiles: ModStatTile[] = complete && farmData ? [
    { key: "huts", label: tOr(`${K}.huts`, "Owned huts"), value: formatNumber(farmData.hutCount, 0) },
    { key: "pending", label: tOr(`${K}.pending`, "Wood awaiting tree removal (L)"), value: formatNumber(farmData.pendingLitres, 2) },
    { key: "stopped", label: tOr(`${K}.stopped`, "Automatically suspended"), value: formatNumber(farmData.autoSuspendedCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current production credit and cycle progress at this farm's owned Lumberjack Huts. Pending wood still awaits a matching standing tree; it is not stored, delivered or sold wood. The tree inventory is shared between huts on the same farmland and is not counted here.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.tableTitle`, "Owned hut status")}>
        <ModTable
          columns={[
            { key: "site", label: tOr(`${K}.site`, "Hut") },
            { key: "farmland", label: tOr(`${K}.farmland`, "Farmland"), align: "end" },
            { key: "pending", label: tOr(`${K}.pendingColumn`, "Wood awaiting tree removal (L)"), align: "end" },
            { key: "progress", label: tOr(`${K}.progress`, "Next cycle"), align: "end" },
            { key: "status", label: tOr(`${K}.status`, "Automatic status") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.siteId || String(index),
            cells: {
              site: row.site || "—",
              farmland: formatNumber(row.farmlandId, 0),
              pending: formatNumber(row.pendingLitres, 2),
              progress: num(row.cycleProgressPercent) == null ? "—" : `${formatNumber(row.cycleProgressPercent, 2)}%`,
              status: row.autoSuspended === true
                ? tOr(`${K}.suspended`, "Suspended: no standing trees")
                : tOr(`${K}.notSuspended`, "Not automatically suspended"),
            },
          }))}
          empty={tOr(`${K}.empty`, "No owned Lumberjack Hut has a readable current state.")}
        />
        {page?.coverage === "partial" || page?.coverage === "truncated" ? (
          <ModEmpty>{tOr(`${K}.incomplete`, "Some owned hut values could not be verified; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
