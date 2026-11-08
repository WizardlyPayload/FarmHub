import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type SeederRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  selectedUnload?: "potato" | "seeds" | "fertilizer";
  supportsFertilizer?: boolean;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<SeederRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const complete = page?.coverage === "complete";
  const modes = {
    potato: tOr("companionPage.unloadPotatoSeeders.potato", "Potatoes"),
    seeds: tOr("companionPage.unloadPotatoSeeders.seeds", "Seeds"),
    fertilizer: tOr("companionPage.unloadPotatoSeeders.fertilizer", "Fertilizer"),
  };
  const tiles: ModStatTile[] = farmData && complete ? [
    { key: "seeders", label: tOr("companionPage.unloadPotatoSeeders.seeders", "Owned potato seeders"), value: formatNumber(farmData.seederCount, 0) },
    { key: "potato", label: modes.potato, value: formatNumber(farmData.potatoCount, 0) },
    { key: "seeds", label: modes.seeds, value: formatNumber(farmData.seedsCount, 0) },
    { key: "fertilizer", label: modes.fertilizer, value: formatNumber(farmData.fertilizerCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.unloadPotatoSeeders.lead", "Current selected unload type on owned potato seeders. This choice resets on reload and does not prove any material was unloaded.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.unloadPotatoSeeders.table", "Owned potato seeders")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.unloadPotatoSeeders.vehicle", "Seeder") },
            { key: "selected", label: tOr("companionPage.unloadPotatoSeeders.selected", "Selected unload type") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || "—",
              selected: row.selectedUnload ? modes[row.selectedUnload] : "—",
            },
          }))}
          empty={tOr("companionPage.unloadPotatoSeeders.empty", "No readable owned potato seeder is available yet.")}
        />
        {page?.coverage === "partial" || page?.coverage === "truncated" ? (
          <ModEmpty>{tOr("companionPage.unloadPotatoSeeders.partial", "Some owned seeder choices were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
