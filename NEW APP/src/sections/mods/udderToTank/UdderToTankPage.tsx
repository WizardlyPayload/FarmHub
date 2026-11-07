import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.udderToTank";

type UdderRow = {
  farmId?: number; pen?: string; milkType?: string; animals?: number;
  avgStoredLitres?: number; avgCapacityLitres?: number; totalStoredLitres?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<UdderRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "clusters", label: tOr(`${K}.clusters`, "Producing groups"), value: formatNumber(farmData.clusterCount, 0) },
    { key: "animals", label: tOr(`${K}.animals`, "Animals with a reading"), value: formatNumber(farmData.animalCount, 0) },
    { key: "stored", label: tOr(`${K}.stored`, "Milk stored in udders"), value: `${formatNumber(farmData.storedLitres, 1)} L` },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current milk held in producing animals' udders at this farm's pens. This is separate from milk already in a barn tank and does not measure milk sold or produced over time.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.tableTitle`, "Udder milk by pen and group")}>
        <ModTable
          columns={[
            { key: "pen", label: tOr(`${K}.pen`, "Pen") },
            { key: "type", label: tOr(`${K}.type`, "Milk group") },
            { key: "animals", label: tOr(`${K}.animals`, "Animals with a reading"), align: "end" },
            { key: "average", label: tOr(`${K}.average`, "Average stored / capacity (L)"), align: "end" },
            { key: "total", label: tOr(`${K}.total`, "Group stored (L)"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.pen || "pen"}-${index}`,
            cells: {
              pen: row.pen || tOr(`${K}.unnamed`, "Unnamed pen"),
              type: row.milkType === "goat" ? tOr(`${K}.goat`, "Goat milk") : tOr(`${K}.dairy`, "Cow or buffalo milk"),
              animals: formatNumber(row.animals, 0),
              average: `${formatNumber(row.avgStoredLitres, 1)} / ${formatNumber(row.avgCapacityLitres, 1)}`,
              total: formatNumber(row.totalStoredLitres, 1),
            },
          }))}
          empty={tOr(`${K}.empty`, "No producing animal with a readable udder record was found for this farm.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned animal reading is shown.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Some animal records could not be read; totals include only complete groups.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
