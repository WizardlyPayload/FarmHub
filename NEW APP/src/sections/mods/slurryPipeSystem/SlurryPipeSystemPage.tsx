import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Store = {
  farmId?: number; placeable?: string; storeId?: number; storeIndex?: number;
  settlingPercent?: number; dryMatterPoolLitres?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const stores = asList<Store>(page?.stores).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "count", label: tOr("companionPage.slurryPipeSystem.count", "Owned active slurry stores"), value: formatNumber(farmData.activeStores, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.slurryPipeSystem.lead", "Live settling and dry matter pools in this farm's registered slurry stores. Pipe connections belong to the whole map and are not assigned to this farm.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.slurryPipeSystem.tableTitle", "Slurry store condition")}>
        <ModTable
          columns={[
            { key: "placeable", label: tOr("companionPage.slurryPipeSystem.placeable", "Placeable") },
            { key: "store", label: tOr("companionPage.slurryPipeSystem.store", "Store ID"), align: "end" },
            { key: "settling", label: tOr("companionPage.slurryPipeSystem.settling", "Settling (%)"), align: "end" },
            { key: "solids", label: tOr("companionPage.slurryPipeSystem.solids", "Dry matter pool (L equivalent)"), align: "end" },
          ]}
          rows={stores.map((row, index) => ({
            key: `${row.placeable ?? "store"}-${row.storeId ?? row.storeIndex ?? index}-${index}`,
            cells: {
              placeable: row.placeable ?? "—",
              store: formatNumber(row.storeId, 0),
              settling: formatNumber(row.settlingPercent, 1),
              solids: formatNumber(row.dryMatterPoolLitres, 1),
            },
          }))}
          empty={tOr("companionPage.slurryPipeSystem.empty", "No owned store has a live settling pool yet.")}
        />
        <ModEmpty>{tOr("companionPage.slurryPipeSystem.note", "Settling is the mod's current 0–100% crust offset; the dry matter pool is a mod estimate, not a laboratory measurement or delivered slurry.")}</ModEmpty>
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.slurryPipeSystem.truncated", "Only some registered stores were scanned or displayed; the count is withheld.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.slurryPipeSystem.partial", "Some owned store pools were not ready or had invalid values; the count is withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
