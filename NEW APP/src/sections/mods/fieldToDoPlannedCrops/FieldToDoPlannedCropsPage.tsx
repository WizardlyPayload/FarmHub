import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.fieldToDoPlannedCrops";
type PlanRow = {
  farmId?: number; fieldId?: number; farmlandId?: number;
  fruitTypeIndex?: number; plannedCrop?: string;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<PlanRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = page?.coverage === "complete" && num(farmData?.plannedCountScanned) != null ? [
    { key: "plans", label: tOr(`${K}.count`, "Saved plans on currently owned land"),
      value: formatNumber(farmData?.plannedCountScanned, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "Saved sowing plans from Field To-Do List for land this farm currently owns. Plans may predate a change of owner; they are not proof of planting or harvest.")}>
      <ModStatTiles tiles={tiles} />
      {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`,
        "Only part of the saved plan register could be checked or listed. Unresolved land ownership and invalid entries are withheld.")}</ModEmpty> : null}
      <Card title={tOr(`${K}.title`, "Stored plans on currently owned land")}>
        <ModTable
          columns={[
            { key: "field", label: tOr(`${K}.field`, "Stored field ID") },
            { key: "land", label: tOr(`${K}.land`, "Current farmland ID") },
            { key: "crop", label: tOr(`${K}.crop`, "Planned sowing") },
          ]}
          rows={rows.map((row, index) => ({
            key: String(row.fieldId ?? index),
            cells: {
              field: formatNumber(row.fieldId, 0),
              land: formatNumber(row.farmlandId, 0),
              crop: row.plannedCrop === "farmyard" ? tOr(`${K}.farmyard`, "Farmyard")
                : row.plannedCrop === "crop-index-unresolved"
                  ? `${tOr(`${K}.cropIndex`, "Crop type index")} ${formatNumber(row.fruitTypeIndex, 0)}`
                  : row.plannedCrop || "—",
            },
          }))}
          empty={page?.coverage === "partial"
            ? tOr(`${K}.partial`, "Only part of the saved plan register could be checked or listed. Unresolved land ownership and invalid entries are withheld.")
            : tOr(`${K}.empty`, "No saved plans were found on currently owned land.")}
        />
        <p class="fd-economy__muted">{tOr(`${K}.note`,
          "The mod does not store who set a plan. Its task records are withheld because legacy tasks may be assigned to the local farm during load.")}</p>
      </Card>
    </ModPage>
  );
}
