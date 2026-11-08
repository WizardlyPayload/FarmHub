import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.bullMilkProduction";

type Barn = {
  farmId?: number; placeableId?: string; barn?: string;
  detectedBulls?: number; calculatedLitresPerHour?: number;
};

function rate(value: unknown): string {
  return num(value) === null ? "—" : `${formatNumber(value, 1)} L/h`;
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const barns = asList<Barn>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "barns", label: tOr(`${K}.barns`, "Owned cow barns with a reading"), value: formatNumber(farmData.barnCount, 0) },
    { key: "bulls", label: tOr(`${K}.bulls`, "Recognized bulls"), value: formatNumber(farmData.detectedBulls, 0) },
    { key: "rate", label: tOr(`${K}.rate`, "Calculated rate now"), value: rate(farmData.calculatedLitresPerHour) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Bull Milk Production's current calculated hourly rate for this farm's cow barns. The rate is not milk collected, sold or earned. Actual Bull Milk litres belong to Storage.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Cow barn rate readings")}>
        <ModTable columns={[
          { key: "barn", label: tOr(`${K}.barn`, "Barn") },
          { key: "bulls", label: tOr(`${K}.bulls`, "Recognized bulls"), align: "end" },
          { key: "rate", label: tOr(`${K}.hourly`, "Calculated hourly rate"), align: "end" },
        ]} rows={barns.map((barn, index) => ({
          key: barn.placeableId || String(index),
          cells: {
            barn: barn.barn || tOr(`${K}.unnamed`, "Unnamed cow barn"),
            bulls: num(barn.detectedBulls) === null ? "—" : formatNumber(barn.detectedBulls, 0),
            rate: rate(barn.calculatedLitresPerHour),
          },
        }))} empty={tOr(`${K}.empty`, "No owned cow barn has a calculated Bull Milk rate yet.")} />
      </Card>
      {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned cow barn list was read; totals are withheld.")}</ModEmpty> : null}
      {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "An owned cow barn had ambiguous identity or unreadable Bull Milk state and was withheld; totals are withheld.")}</ModEmpty> : null}
    </ModPage>
  );
}
