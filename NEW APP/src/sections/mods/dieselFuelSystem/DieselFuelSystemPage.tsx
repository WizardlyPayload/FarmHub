import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type FuelRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  filterHours?: number;
  filterBlockagePct?: number;
  trapWaterLitres?: number;
  fuelAgeDays?: number;
  oxidationPct?: number;
  airInLine?: boolean;
  filterMissing?: boolean;
};

const reading = (value: unknown, decimals: number, unit: string) =>
  num(value) === null ? "—" : `${formatNumber(value, decimals)} ${unit}`;

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<FuelRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "vehicles", label: tOr("companionPage.dieselFuelSystem.vehicles", "Diesel vehicles"), value: formatNumber(farmData.vehicleCount, 0) },
    { key: "water", label: tOr("companionPage.dieselFuelSystem.waterCount", "Water in trap"), value: formatNumber(farmData.waterTrapCount, 0) },
    { key: "air", label: tOr("companionPage.dieselFuelSystem.airCount", "Air in fuel line"), value: formatNumber(farmData.airInLineCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.dieselFuelSystem.lead", "Fuel and filter condition recorded by Diesel Fuel System on this farm's currently owned diesel vehicles. These are current readings, not completed maintenance or a fuel purchase history.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.dieselFuelSystem.tableTitle", "Owned diesel vehicle condition")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.dieselFuelSystem.vehicle", "Vehicle") },
            { key: "hours", label: tOr("companionPage.dieselFuelSystem.filterHours", "Filter hours"), align: "end" },
            { key: "blockage", label: tOr("companionPage.dieselFuelSystem.blockage", "Filter blockage"), align: "end" },
            { key: "water", label: tOr("companionPage.dieselFuelSystem.trapWater", "Trap water"), align: "end" },
            { key: "age", label: tOr("companionPage.dieselFuelSystem.fuelAge", "Fuel age"), align: "end" },
            { key: "condition", label: tOr("companionPage.dieselFuelSystem.condition", "Condition") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            tone: row.airInLine || row.filterMissing ? "warn" as const : undefined,
            cells: {
              vehicle: row.vehicle || "—",
              hours: reading(row.filterHours, 1, "h"),
              blockage: reading(row.filterBlockagePct, 1, "%"),
              water: reading(row.trapWaterLitres, 2, "L"),
              age: reading(row.fuelAgeDays, 1, tOr("companionPage.dieselFuelSystem.days", "days")),
              condition: row.filterMissing
                ? tOr("companionPage.dieselFuelSystem.noFilter", "Filter missing")
                : row.airInLine
                  ? tOr("companionPage.dieselFuelSystem.airPresent", "Air in line")
                  : num(row.oxidationPct) === null ? "—" : tOr("companionPage.dieselFuelSystem.oxidation", "Oxidation {{value}}%", { value: formatNumber(row.oxidationPct, 1) }),
            },
          }))}
          empty={tOr("companionPage.dieselFuelSystem.empty", "No applicable owned diesel vehicle has mod fuel state yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.dieselFuelSystem.truncated", "Only the first applicable vehicles are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
