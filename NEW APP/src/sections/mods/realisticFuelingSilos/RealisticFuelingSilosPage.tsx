import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useUnitPrice, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.realisticFuelingSilos";

type FuelSiloRow = {
  farmId?: number;
  placeableId?: string;
  name?: string;
  dieselPerLitre?: number;
  defPerLitre?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const price = useUnitPrice();
  const silos = asList<FuelSiloRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "silos", label: tOr(`${K}.silos`, "Owned fuel silos"), value: formatNumber(farmData.siloCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Configured diesel and DEF prices at this farm's fuel silos. These quotes do not prove any fuel sale, charge or income.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Fuel-silo prices")}>
        <ModTable columns={[
          { key: "silo", label: tOr(`${K}.silo`, "Silo") },
          { key: "diesel", label: tOr(`${K}.diesel`, "Diesel / L"), align: "end" },
          { key: "def", label: tOr(`${K}.def`, "DEF / L"), align: "end" },
        ]} rows={silos.map((silo, index) => ({
          key: silo.placeableId || String(index),
          cells: {
            silo: silo.name || tOr(`${K}.unnamed`, "Fuel silo"),
            diesel: price(silo.dieselPerLitre),
            def: price(silo.defPerLitre),
          },
        }))} empty={tOr(`${K}.empty`, "No owned fuel silo has readable prices.")} />
      </Card>
      {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned fuel-silo list is shown.")}</ModEmpty> : null}
      {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "An owned fuel silo had an invalid price and was withheld.")}</ModEmpty> : null}
    </ModPage>
  );
}
