import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.vehicleWeightModifier";

type ConfiguredVehicle = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  weightFactor?: number;
  brakeFactor?: number;
  engineFactor?: number;
};

function factor(value: unknown): string {
  const n = num(value);
  return n == null ? "—" : `${formatNumber(n, 1)}×`;
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<ConfiguredVehicle>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "vehicles", label: tOr(`${K}.vehicles`, "Owned vehicles with saved factors"), value: formatNumber(farmData.vehicleCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Saved weight, braking and engine factors for vehicles this farm currently owns. These are configured multipliers, not measured mass, braking distance or engine power.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Vehicle settings")}>
        <ModTable columns={[
          { key: "vehicle", label: tOr(`${K}.vehicle`, "Vehicle") },
          { key: "weight", label: tOr(`${K}.weight`, "Weight factor"), align: "end" },
          { key: "brake", label: tOr(`${K}.brake`, "Brake factor"), align: "end" },
          { key: "engine", label: tOr(`${K}.engine`, "Engine factor"), align: "end" },
        ]} rows={rows.map((row, index) => ({
          key: row.vehicleId || String(index),
          cells: {
            vehicle: row.vehicle || row.vehicleId || "—",
            weight: factor(row.weightFactor),
            brake: factor(row.brakeFactor),
            engine: factor(row.engineFactor),
          },
        }))} empty={tOr(`${K}.empty`, "No saved settings are linked to a vehicle this farm currently owns.")} />
      </Card>
      {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned vehicle list is shown.")}</ModEmpty> : null}
      {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "A saved factor is invalid; the reading has been withheld.")}</ModEmpty> : null}
    </ModPage>
  );
}
