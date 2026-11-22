import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type CapacityRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  fillUnitIndex?: number;
  selectedMultiplier?: number;
  originalCapacityLitres?: number;
  selectedCapacityLitres?: number;
  currentCapacityLitres?: number;
  capacityMatchesSelection?: boolean;
};

function litres(value?: number): string {
  return typeof value === "number" ? `${formatNumber(value, 0)} L` : "—";
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<CapacityRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "vehicles", label: tOr("companionPage.adjustableFillLevelAdvanced.vehicles", "Owned vehicles with non-stock choice"), value: formatNumber(farmData.selectedVehicleCount, 0) },
    { key: "units", label: tOr("companionPage.adjustableFillLevelAdvanced.units", "Fill units with observed base"), value: formatNumber(farmData.observedFillUnitCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.adjustableFillLevelAdvanced.lead", "Selected fill capacity on vehicles owned by this farm. Observed fill-unit capacity is shown separately; this is not a record of filled volume or work done.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.adjustableFillLevelAdvanced.tableTitle", "Non-stock fill capacity choices")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.adjustableFillLevelAdvanced.vehicle", "Vehicle") },
            { key: "unit", label: tOr("companionPage.adjustableFillLevelAdvanced.unit", "Fill unit") },
            { key: "choice", label: tOr("companionPage.adjustableFillLevelAdvanced.choice", "Selected multiplier") },
            { key: "base", label: tOr("companionPage.adjustableFillLevelAdvanced.base", "Original capacity") },
            { key: "selected", label: tOr("companionPage.adjustableFillLevelAdvanced.selected", "Selected capacity") },
            { key: "current", label: tOr("companionPage.adjustableFillLevelAdvanced.current", "Current capacity") },
            { key: "match", label: tOr("companionPage.adjustableFillLevelAdvanced.match", "Observed effect") },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.vehicleId || index}:${row.fillUnitIndex || 0}`,
            cells: {
              vehicle: row.vehicle || "—",
              unit: row.fillUnitIndex ? String(row.fillUnitIndex) : "—",
              choice: typeof row.selectedMultiplier === "number" ? `${row.selectedMultiplier}×` : "—",
              base: litres(row.originalCapacityLitres),
              selected: litres(row.selectedCapacityLitres),
              current: litres(row.currentCapacityLitres),
              match: row.capacityMatchesSelection === true
                ? tOr("companionPage.adjustableFillLevelAdvanced.matches", "Capacity matches")
                : tOr("companionPage.adjustableFillLevelAdvanced.unverified", "Not verified"),
            },
          }))}
          empty={page?.coverage === "truncated"
            ? tOr("companionPage.adjustableFillLevelAdvanced.truncated", "Vehicle scan incomplete; additional selections may be missing.")
            : tOr("companionPage.adjustableFillLevelAdvanced.empty", "No owned vehicle has a non-stock Adjustable Fill Level choice yet.")}
        />
        {page?.coverage === "truncated" && rows.length > 0 ? <ModEmpty>{tOr("companionPage.adjustableFillLevelAdvanced.truncated", "Vehicle scan incomplete; additional selections may be missing.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
