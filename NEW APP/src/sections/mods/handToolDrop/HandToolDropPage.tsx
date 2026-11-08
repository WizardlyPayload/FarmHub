import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type DropRow = { farmId?: number; toolId?: string; tool?: string; x?: number; z?: number };

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<DropRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const complete = page?.coverage === "complete";
  const tiles: ModStatTile[] = farmData && complete ? [
    { key: "tools", label: tOr("companionPage.handToolDrop.tools", "Owned hand tools with this feature"), value: formatNumber(farmData.handToolCount, 0) },
    { key: "dropped", label: tOr("companionPage.handToolDrop.dropped", "Currently dropped"), value: formatNumber(farmData.droppedCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.handToolDrop.lead", "Current locations of this farm's hand tools with live dropped objects. Coordinates are game-world metres; this is not a drop history or proof of tool use.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.handToolDrop.table", "Dropped hand tools")}>
        <ModTable
          columns={[
            { key: "tool", label: tOr("companionPage.handToolDrop.tool", "Hand tool") },
            { key: "x", label: tOr("companionPage.handToolDrop.x", "World X (m)") },
            { key: "z", label: tOr("companionPage.handToolDrop.z", "World Z (m)") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.toolId || String(index),
            cells: {
              tool: row.tool || "—",
              x: row.x == null ? "—" : formatNumber(row.x, 2),
              z: row.z == null ? "—" : formatNumber(row.z, 2),
            },
          }))}
          empty={tOr("companionPage.handToolDrop.empty", "No readable hand tool is currently dropped by this farm.")}
        />
        {page?.coverage === "partial" || page?.coverage === "truncated" ? (
          <ModEmpty>{tOr("companionPage.handToolDrop.partial", "Some dropped hand tools could not be located; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
