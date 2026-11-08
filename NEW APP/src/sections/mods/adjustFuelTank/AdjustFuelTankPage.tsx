import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.adjustFuelTank";
type TankRow = {
  farmId?: number; vehicleId?: string; vehicle?: string; kind?: string;
  fillUnitIndex?: number; selectedPercent?: number;
  originalCapacityLitres?: number; expectedCapacityLitres?: number;
  currentCapacityLitres?: number; capacityMatchesSelection?: boolean;
};

function litres(value?: number): string {
  return num(value) === null ? "—" : `${formatNumber(value, 0)} L`;
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<TankRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "vehicles", label: tOr(`${K}.vehicles`, "Owned vehicles with non-stock tanks"), value: formatNumber(farmData.selectedVehicleCount, 0) },
    { key: "verified", label: tOr(`${K}.verified`, "Tank units matching selected capacity"), value: formatNumber(farmData.matchingFillUnitCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Adjustable Fuel Tank selections on vehicles this farm owns. The original, selected and observed capacities are separate readings. This is not fuel consumed or purchased.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Non-stock tank capacity choices")}>
        <ModTable columns={[
          { key: "vehicle", label: tOr(`${K}.vehicle`, "Vehicle") },
          { key: "kind", label: tOr(`${K}.kind`, "Tank") },
          { key: "selection", label: tOr(`${K}.selection`, "Selected capacity"), align: "end" },
          { key: "base", label: tOr(`${K}.base`, "Original capacity"), align: "end" },
          { key: "expected", label: tOr(`${K}.expected`, "Expected capacity"), align: "end" },
          { key: "current", label: tOr(`${K}.current`, "Observed capacity"), align: "end" },
          { key: "effect", label: tOr(`${K}.effect`, "Observed effect") },
        ]} rows={rows.map((row, index) => ({ key: `${row.vehicleId || index}-${row.kind || index}-${row.fillUnitIndex || 0}`, cells: {
          vehicle: row.vehicle || "—", kind: row.kind || "—",
          selection: num(row.selectedPercent) === null ? "—" : `${formatNumber(row.selectedPercent, 0)}%`,
          base: litres(row.originalCapacityLitres),
          expected: litres(row.expectedCapacityLitres),
          current: litres(row.currentCapacityLitres),
          effect: row.capacityMatchesSelection === true
            ? tOr(`${K}.matches`, "Capacity matches") : tOr(`${K}.unverified`, "Not verified"),
        } }))} empty={tOr(`${K}.empty`, "No owned vehicle has a non-stock Adjustable Fuel Tank choice yet.")} />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the selected tank register was scanned or displayed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Some selected tank capacities could not be verified against the observed fill units.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
