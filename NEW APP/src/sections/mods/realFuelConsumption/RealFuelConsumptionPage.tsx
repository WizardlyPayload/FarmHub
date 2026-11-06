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
  totalLiters?: number;
  totalSeconds?: number;
  sessionLiters?: number;
  sessionSeconds?: number;
  secondsEco?: number;
  secondsNormal?: number;
  secondsPower?: number;
};

function liters(value: unknown): string {
  const n = num(value);
  return n === null ? "—" : `${formatNumber(n, 1)} L`;
}

function hours(value: unknown): string {
  const n = num(value);
  return n === null ? "—" : `${formatNumber(n / 3600, 1)} h`;
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<FuelRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "vehicles", label: tOr("companionPage.realFuelConsumption.vehicles", "Vehicles with recorded engine time"), value: formatNumber(farmData.vehicleCount, 0) },
    { key: "fuel", label: tOr("companionPage.realFuelConsumption.totalFuel", "Accumulated fuel used"), value: liters(farmData.totalLiters) },
    { key: "hours", label: tOr("companionPage.realFuelConsumption.totalHours", "Accumulated engine time"), value: hours(farmData.totalSeconds) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.realFuelConsumption.lead", "Fuel and engine-time counters recorded by Real Fuel Consumption for your farm's vehicles. Session figures reset when a save is loaded; fuel used is not a purchase or cash expense.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.realFuelConsumption.tableTitle", "Recorded usage by vehicle")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.advancedMaintenance.colMachine", "Machine") },
            { key: "totalFuel", label: tOr("companionPage.realFuelConsumption.totalFuel", "Accumulated fuel used"), align: "end" },
            { key: "totalHours", label: tOr("companionPage.realFuelConsumption.totalHours", "Accumulated engine time"), align: "end" },
            { key: "sessionFuel", label: tOr("companionPage.realFuelConsumption.sessionFuel", "This session fuel"), align: "end" },
            { key: "eco", label: tOr("companionPage.realFuelConsumption.eco", "Eco time"), align: "end" },
            { key: "normal", label: tOr("companionPage.realFuelConsumption.normal", "Normal time"), align: "end" },
            { key: "power", label: tOr("companionPage.realFuelConsumption.power", "Power time"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || row.vehicleId || "—",
              totalFuel: liters(row.totalLiters),
              totalHours: hours(row.totalSeconds),
              sessionFuel: liters(row.sessionLiters),
              eco: hours(row.secondsEco),
              normal: hours(row.secondsNormal),
              power: hours(row.secondsPower),
            },
          }))}
          empty={tOr("companionPage.realFuelConsumption.empty", "No owned vehicle has recorded engine time yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.realFuelConsumption.truncated", "Only the first vehicles are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
