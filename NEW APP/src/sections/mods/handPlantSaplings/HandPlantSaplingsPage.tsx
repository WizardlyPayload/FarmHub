import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.handPlantSaplings";
type Row = {
  farmId?: number; placeableId?: string; placeable?: string; area?: string;
  backpackIndex?: number; treeKey?: string; tree?: string; treeType?: string;
  variation?: string; pieces?: number; areaCapacityPieces?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Row>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "pieces", label: tOr(`${K}.pieces`, "Saplings in owned racks and backpacks"), value: formatNumber(farmData.recordedPieces, 0) },
    { key: "racks", label: tOr(`${K}.racks`, "Racks with saplings"), value: formatNumber(farmData.rackCount, 0) },
    { key: "backpacks", label: tOr(`${K}.backpacks`, "Backpacks with saplings"), value: formatNumber(farmData.backpackCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current sapling pieces by tree type in this farm's Hand Plant Saplings racks and linked shovel backpacks. These counts do not prove trees planted or forestry work completed.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Stored saplings")}>
        <ModTable columns={[
          { key: "placeable", label: tOr(`${K}.placeable`, "Sapling rack") },
          { key: "area", label: tOr(`${K}.area`, "Storage area") },
          { key: "tree", label: tOr(`${K}.tree`, "Tree type") },
          { key: "pieces", label: tOr(`${K}.count`, "Pieces") },
          { key: "capacity", label: tOr(`${K}.capacity`, "Area capacity") },
        ]} rows={rows.map((row, index) => ({
          key: `${row.placeableId || index}-${row.area}-${row.backpackIndex || 0}-${row.treeKey || index}`,
          cells: {
            placeable: row.placeable || tOr(`${K}.unnamed`, "Unnamed rack"),
            area: row.area === "backpack"
              ? `${tOr(`${K}.backpack`, "Backpack")} ${formatNumber(row.backpackIndex, 0)}`
              : tOr(`${K}.rack`, "Rack"),
            tree: row.tree || row.treeType || "—",
            pieces: formatNumber(row.pieces, 0),
            capacity: formatNumber(row.areaCapacityPieces, 0),
          },
        }))} empty={tOr(`${K}.empty`, "No readable saplings are stored in this farm's racks or linked backpacks.")} />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned sapling inventory is shown.")}</ModEmpty> : null}
        {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "A storage area had ambiguous ownership, identity or unreadable counts and was withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
