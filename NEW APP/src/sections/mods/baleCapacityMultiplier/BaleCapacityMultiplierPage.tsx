import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type BalerRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  multiplierIndex?: number;
  multiplier?: number;
  baseCapacityLitres?: number;
  selectedCapacityLitres?: number;
  currentFillUnitCapacityLitres?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<BalerRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "balers", label: tOr("companionPage.baleCapacityMultiplier.balers", "Owned balers"), value: formatNumber(farmData.balerCount, 0) },
    { key: "modified", label: tOr("companionPage.baleCapacityMultiplier.modified", "Changed from 1×"), value: formatNumber(farmData.modifiedCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.baleCapacityMultiplier.lead", "Current selected bale capacity on balers owned by this farm. This is a setting, not bales produced or stored.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.baleCapacityMultiplier.tableTitle", "Owned baler capacity settings")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.baleCapacityMultiplier.vehicle", "Baler") },
            { key: "multiplier", label: tOr("companionPage.baleCapacityMultiplier.multiplier", "Selected multiplier") },
            { key: "base", label: tOr("companionPage.baleCapacityMultiplier.base", "Base capacity") },
            { key: "selected", label: tOr("companionPage.baleCapacityMultiplier.selected", "Selected capacity") },
            { key: "actual", label: tOr("companionPage.baleCapacityMultiplier.actual", "Current fill-unit capacity") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || "—",
              multiplier: typeof row.multiplier === "number" ? `${row.multiplier}×` : "—",
              base: typeof row.baseCapacityLitres === "number" ? `${formatNumber(row.baseCapacityLitres, 0)} L` : "—",
              selected: typeof row.selectedCapacityLitres === "number" ? `${formatNumber(row.selectedCapacityLitres, 0)} L` : "—",
              actual: typeof row.currentFillUnitCapacityLitres === "number" ? `${formatNumber(row.currentFillUnitCapacityLitres, 0)} L` : "—",
            },
          }))}
          empty={tOr("companionPage.baleCapacityMultiplier.empty", "No owned baler has a readable capacity multiplier yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.baleCapacityMultiplier.truncated", "Only the first owned balers are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
