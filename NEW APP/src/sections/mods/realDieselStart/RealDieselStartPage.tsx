import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.realDieselStart";
type Row = {
  farmId?: number; vehicleId?: string; vehicle?: string;
  residualHeatPercent?: number; airPressureBar?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Row>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" && farmData.vehicleCount != null ? [
    { key: "vehicles", label: tOr(`${K}.vehicles`, "Owned motorized vehicles with a reading"), value: formatNumber(farmData.vehicleCount, 0) },
    { key: "air", label: tOr(`${K}.airSystems`, "Trucks with air system"), value: formatNumber(farmData.airSystemCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Residual heat is the mod's 0–100% model, not measured engine temperature. Air pressure is the mod's current truck reservoir reading; neither value proves a trip or a successful start.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Current diesel-start readings")}>
        <ModTable columns={[
          { key: "vehicle", label: tOr(`${K}.vehicle`, "Vehicle") },
          { key: "heat", label: tOr(`${K}.heat`, "Modeled residual heat"), align: "end" },
          { key: "air", label: tOr(`${K}.air`, "Truck air pressure"), align: "end" },
        ]} rows={rows.map((row, index) => ({
          key: row.vehicleId || String(index),
          cells: {
            vehicle: row.vehicle || "—",
            heat: row.residualHeatPercent == null ? "—" : `${formatNumber(row.residualHeatPercent, 1)}%`,
            air: row.airPressureBar == null ? "—" : `${formatNumber(row.airPressureBar, 2)} bar`,
          },
        }))} empty={tOr(`${K}.empty`, "No owned non-electric vehicle with a readable diesel-start state is available.")} />
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "An owned vehicle had ambiguous identity or unreadable state and was withheld; totals are withheld.")}</ModEmpty> : null}
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned vehicle list is shown; totals are withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
