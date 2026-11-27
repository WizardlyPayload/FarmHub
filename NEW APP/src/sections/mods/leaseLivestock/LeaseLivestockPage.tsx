import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.leaseLivestock";
type LeaseGroup = {
  farmId?: number; pen?: string; subTypeIndex?: number; animal?: string;
  leasedCount?: number; ratePerAnimal?: number; estimatedPeriodCharge?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<LeaseGroup>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "count", label: tOr(`${K}.leasedAnimals`, "Currently leased animals"), value: formatNumber(farmData.leasedAnimals, 0) },
    { key: "charge", label: tOr(`${K}.estimatedCharge`, "Estimated charge next period"), value: num(farmData.estimatedPeriodCharge) === null ? "—" : money(farmData.estimatedPeriodCharge) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Lease Livestock marks current animals as leased in the husbandry. Charges are calculated from today's subtype price at age 18. They are estimates for a future period, not a record of money paid.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Current leased animal groups")}>
        <ModTable columns={[
          { key: "pen", label: tOr(`${K}.pen`, "Husbandry") },
          { key: "animal", label: tOr(`${K}.animal`, "Animal subtype") },
          { key: "count", label: tOr(`${K}.count`, "Leased animals"), align: "end" },
          { key: "rate", label: tOr(`${K}.rate`, "Rate per animal / period"), align: "end" },
          { key: "charge", label: tOr(`${K}.charge`, "Estimated period charge"), align: "end" },
        ]} rows={rows.map((row, index) => ({ key: `${row.pen || "pen"}-${row.subTypeIndex ?? index}-${index}`, cells: {
          pen: row.pen || "—",
          animal: row.animal || "—",
          count: formatNumber(row.leasedCount, 0),
          rate: num(row.ratePerAnimal) === null ? "—" : money(row.ratePerAnimal),
          charge: num(row.estimatedPeriodCharge) === null ? "—" : money(row.estimatedPeriodCharge),
        } }))} empty={tOr(`${K}.empty`, "No leased animal group was found in a husbandry owned by this farm.")} />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the current husbandry register was scanned or displayed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Some husbandry or leased-cluster values were unavailable; totals and charges may be incomplete.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
