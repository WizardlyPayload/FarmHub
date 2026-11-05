import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type TyreRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  mode?: number;
  currentBar?: number;
  targetBar?: number;
};

const bar = (value: unknown) => typeof value === "number" ? `${formatNumber(value, 2)} bar` : "—";
const modeLabel = (mode: number | undefined) => {
  switch (mode) {
    case 0: return tOr("companionPage.variableTirePressure.road", "Road");
    case 1: return tOr("companionPage.variableTirePressure.field", "Field");
    case 2: return tOr("companionPage.variableTirePressure.frontRoad", "Front road / rear field");
    case 3: return tOr("companionPage.variableTirePressure.frontField", "Front field / rear road");
    default: return "—";
  }
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<TyreRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "equipped", label: tOr("companionPage.variableTirePressure.equipped", "Equipped vehicles"), value: formatNumber(farmData.equippedCount, 0) },
    { key: "field", label: tOr("companionPage.variableTirePressure.fieldOrMixed", "Field or mixed mode"), value: formatNumber(farmData.fieldOrMixedCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.variableTirePressure.lead", "Current tyre-pressure mode and pressure on equipped vehicles owned by this farm. Mixed-axle pressure is an average. This is not a tyre-wear or work-history reading.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.variableTirePressure.tableTitle", "Owned equipped vehicles")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.variableTirePressure.vehicle", "Vehicle") },
            { key: "mode", label: tOr("companionPage.variableTirePressure.mode", "Mode") },
            { key: "current", label: tOr("companionPage.variableTirePressure.current", "Current pressure") },
            { key: "target", label: tOr("companionPage.variableTirePressure.target", "Target pressure") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: { vehicle: row.vehicle || "—", mode: modeLabel(row.mode), current: bar(row.currentBar), target: bar(row.targetBar) },
          }))}
          empty={tOr("companionPage.variableTirePressure.empty", "No equipped owned vehicle has readable tyre pressure yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.variableTirePressure.truncated", "Only the first equipped owned vehicles are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
