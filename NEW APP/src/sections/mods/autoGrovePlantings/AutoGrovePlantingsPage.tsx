import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.autoGrovePlantings";
type Planting = {
  farmId?: number; fieldId?: number; crop?: string; plantedCount?: number;
  headingDeg?: number; rowSpacing?: number; plantSpacing?: number;
  treeMode?: boolean; placeableLinked?: boolean;
};

function spacing(value: number | undefined): string {
  return num(value) == null || num(value) === 0 ? "—" : `${formatNumber(value, 1)} m`;
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Planting>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "fields", label: tOr(`${K}.fieldCount`, "Currently owned fields with records"), value: formatNumber(farmData.recordedFieldCount, 0) },
    { key: "withheld", label: tOr(`${K}.withheld`, "Ownership not confirmed"), value: formatNumber(farmData.withheldOwnership, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Auto Grove's last successful planting record for fields this farm still owns. A saved count does not prove that the grove or every planted unit still exists after later manual changes.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Recorded plantings")}>
        <ModTable columns={[
          { key: "field", label: tOr(`${K}.field`, "Field") },
          { key: "crop", label: tOr(`${K}.crop`, "Recorded crop") },
          { key: "count", label: tOr(`${K}.count`, "Units planted"), align: "end" },
          { key: "heading", label: tOr(`${K}.heading`, "Heading"), align: "end" },
          { key: "spacing", label: tOr(`${K}.spacing`, "Row / plant spacing") },
          { key: "mode", label: tOr(`${K}.mode`, "Mode") },
        ]} rows={rows.map((row, index) => ({ key: String(row.fieldId ?? index), cells: {
          field: formatNumber(row.fieldId, 0),
          crop: row.crop || "—",
          count: formatNumber(row.plantedCount, 0),
          heading: num(row.headingDeg) == null ? "—" : `${formatNumber(row.headingDeg, 0)}°`,
          spacing: `${spacing(row.rowSpacing)} / ${spacing(row.plantSpacing)}`,
          mode: row.treeMode ? tOr(`${K}.trees`, "Trees") : tOr(`${K}.other`, "Other planting"),
        } }))} empty={page?.coverage === "truncated"
          ? tOr(`${K}.truncated`, "Only part of the saved planting register was scanned or displayed.")
          : tOr(`${K}.empty`, "No Auto Grove planting record is available for a field this farm still owns.")} />
        {page?.coverage === "truncated" && rows.length > 0 ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the saved planting register was scanned or displayed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Invalid records and plantings whose current field ownership could not be confirmed were withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
