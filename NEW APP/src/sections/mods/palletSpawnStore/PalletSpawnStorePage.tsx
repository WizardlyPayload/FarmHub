import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type OutputRow = {
  farmId?: number;
  placeableId?: string;
  production?: string;
  fillType?: string;
  fillTitle?: string;
  mode?: "store" | "spawn" | "sell" | "distribute";
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<OutputRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const complete = page?.coverage === "complete";
  const tiles: ModStatTile[] = farmData && complete ? [
    { key: "outputs", label: tOr("companionPage.palletSpawnStore.outputs", "Owned outputs"), value: formatNumber(farmData.outputCount, 0) },
    { key: "store", label: tOr("companionPage.palletSpawnStore.storeCount", "Store without pallets"), value: formatNumber(farmData.storeCount, 0) },
    { key: "spawn", label: tOr("companionPage.palletSpawnStore.spawnCount", "Spawn pallets"), value: formatNumber(farmData.spawnCount, 0) },
  ] : [];
  const modes = {
    store: tOr("companionPage.palletSpawnStore.mode.store", "Store without pallets"),
    spawn: tOr("companionPage.palletSpawnStore.mode.spawn", "Spawn/store pallets"),
    sell: tOr("companionPage.palletSpawnStore.mode.sell", "Sell directly"),
    distribute: tOr("companionPage.palletSpawnStore.mode.distribute", "Distribute"),
  };
  return (
    <ModPage entry={entry} lead={tOr("companionPage.palletSpawnStore.lead", "Current routing of this farm's production outputs. These choices are not produced pallets, sales or deliveries.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.palletSpawnStore.table", "Production output routing")}>
        <ModTable
          columns={[
            { key: "production", label: tOr("companionPage.palletSpawnStore.production", "Production") },
            { key: "output", label: tOr("companionPage.palletSpawnStore.output", "Output") },
            { key: "mode", label: tOr("companionPage.palletSpawnStore.mode", "Current routing") },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.placeableId ?? index}:${row.fillType ?? index}`,
            cells: {
              production: row.production || "—",
              output: row.fillTitle || row.fillType || "—",
              mode: row.mode ? modes[row.mode] : "—",
            },
          }))}
          empty={tOr("companionPage.palletSpawnStore.empty", "No readable owned production output is available yet.")}
        />
        {page?.coverage === "partial" || page?.coverage === "truncated" ? (
          <ModEmpty>{tOr("companionPage.palletSpawnStore.partial", "Some owned output settings were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
