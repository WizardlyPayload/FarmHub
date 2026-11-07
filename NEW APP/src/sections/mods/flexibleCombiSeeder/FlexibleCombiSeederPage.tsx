import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.flexibleCombiSeeder";

type SeederRow = { farmId?: number; vehicleId?: string; vehicle?: string; mode?: string };

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<SeederRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "eligible", label: tOr(`${K}.eligible`, "Eligible owned combi seeders"), value: formatNumber(farmData.eligibleCount, 0) },
    { key: "seedMode", label: tOr(`${K}.seedModeCount`, "Using both tanks for seed"), value: formatNumber(farmData.seedModeCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "Current fertilizer-tank mode on eligible combi seeders owned by this farm. Seed mode does not prove any field was sown or fertilized.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.tableTitle`, "Owned combi seeder tank modes")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr(`${K}.vehicle`, "Seeder") },
            { key: "mode", label: tOr(`${K}.mode`, "Fertilizer tank use") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || "—",
              mode: row.mode === "seeds" ? tOr(`${K}.seeds`, "Seeds") : tOr(`${K}.fertilizer`, "Fertilizer"),
            },
          }))}
          empty={tOr(`${K}.empty`, "No eligible owned combi seeder has a readable tank mode.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only the first eligible owned seeders are listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Some eligible seeders had an unreadable mode.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
