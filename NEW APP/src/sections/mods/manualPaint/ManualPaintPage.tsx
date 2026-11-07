import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.manualPaint";
type PaintRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  partCount?: number;
  colors?: string[];
  finishes?: string[];
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<PaintRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "vehicles", label: tOr(`${K}.vehicleCount`, "Customized owned vehicles"), value: formatNumber(farmData.customizedVehicleCount, 0) },
    { key: "parts", label: tOr(`${K}.partCount`, "Saved customized parts"), value: formatNumber(farmData.customizedPartCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "Saved Manual Paint targets and finishes on vehicles owned by this farm. Material textures can change the visible color; these targets are not a screenshot of the rendered machine.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.tableTitle`, "Owned vehicle paint customizations")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr(`${K}.vehicle`, "Vehicle") },
            { key: "parts", label: tOr(`${K}.parts`, "Parts"), align: "end" },
            { key: "colors", label: tOr(`${K}.colors`, "Saved color targets") },
            { key: "finishes", label: tOr(`${K}.finishes`, "Saved finishes") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || "—",
              parts: formatNumber(row.partCount, 0),
              colors: asList<string>(row.colors).join(", ") || "—",
              finishes: asList<string>(row.finishes).join(", ") || "—",
            },
          }))}
          empty={tOr(`${K}.empty`, "No saved paint overrides were found on owned vehicles.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only a bounded number of customized vehicles and parts are listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Some owned paint maps could not be read completely.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
