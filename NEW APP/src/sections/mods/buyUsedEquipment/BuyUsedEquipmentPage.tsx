import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.buyUsedEquipment";
type Row = {
  farmId?: number; queueIndex?: number; equipment?: string; equipmentXml?: string;
  searchLevel?: string; hoursRemaining?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Row>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "pending", label: tOr(`${K}.pending`, "Pending searches"), value: formatNumber(farmData.pendingSearchCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Your farm's pending used-equipment broker searches. Remaining hours count down in game time. A search is not a found offer or a purchased vehicle; its result is not guaranteed.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Pending equipment searches")}>
        <ModTable columns={[
          { key: "equipment", label: tOr(`${K}.equipment`, "Equipment") },
          { key: "level", label: tOr(`${K}.level`, "Search level") },
          { key: "hours", label: tOr(`${K}.hours`, "Hours remaining") },
        ]} rows={rows.map((row, index) => ({
          key: `${row.queueIndex ?? index}:${row.equipmentXml ?? ""}`,
          cells: {
            equipment: row.equipment || row.equipmentXml || "—",
            level: row.searchLevel || "—",
            hours: row.hoursRemaining == null ? "—" : formatNumber(row.hoursRemaining, 0),
          },
        }))} empty={tOr(`${K}.empty`, "No pending searches for this farm.")} />
        {page?.coverage === "truncated" || page?.coverage === "partial" ? (
          <ModEmpty>{tOr(`${K}.partial`, "Some searches were unavailable; the total is withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
