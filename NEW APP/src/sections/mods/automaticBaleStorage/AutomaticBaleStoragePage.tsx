import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.automaticBaleStorage";

type Storage = {
  farmId?: number; placeableId?: string; storage?: string; pendingUnload?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Storage>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "owned", label: tOr(`${K}.owned`, "Owned object storages"), value: formatNumber(farmData.ownedStorageCount, 0) },
    { key: "queued", label: tOr(`${K}.queued`, "Storages with pending unloads"), value: formatNumber(farmData.queuedStorageCount, 0) },
    { key: "pending", label: tOr(`${K}.pending`, "Objects still queued"), value: formatNumber(farmData.pendingUnload, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Pending unload requests at this farm's object storages. Counts can change as the mod retries batches. They are not delivered objects or the number stored.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Pending unload queues")}>
        <ModTable columns={[
          { key: "storage", label: tOr(`${K}.storage`, "Storage") },
          { key: "pending", label: tOr(`${K}.pending`, "Objects still queued"), align: "end" },
        ]} rows={rows.map((row, index) => ({
          key: row.placeableId || String(index),
          cells: {
            storage: row.storage || tOr(`${K}.unnamed`, "Unnamed storage"),
            pending: num(row.pendingUnload) === null ? "—" : formatNumber(row.pendingUnload, 0),
          },
        }))} empty={tOr(`${K}.empty`, "No owned storage has an unload request pending.")} />
      </Card>
      {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned storage list was read; totals are withheld.")}</ModEmpty> : null}
      {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "An owned storage had ambiguous identity or unreadable queue state and was withheld; totals are withheld.")}</ModEmpty> : null}
    </ModPage>
  );
}
