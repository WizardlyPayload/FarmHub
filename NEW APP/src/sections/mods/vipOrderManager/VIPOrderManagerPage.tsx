import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.vipOrderManager";

type OrderItem = {
  farmId?: number; fillType?: string; title?: string;
  quantity?: number; delivered?: number; remaining?: number;
  potentialPayout?: number; isAnimal?: boolean; neededAgeInMonths?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<OrderItem>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "level", label: tOr(`${K}.level`, "Current order level"),
      value: formatNumber(farmData.currentLevel, 0) },
    { key: "items", label: tOr(`${K}.items`, "Requested items"),
      value: formatNumber(farmData.itemCount, 0) },
  ] : [];
  const unit = (row: OrderItem) => row.isAnimal
    ? tOr(`${K}.animals`, "animals") : "L";
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "Current VIP order for the local single-player farm. Recorded progress is from the mod's live order list; listed item payouts are potential amounts, not earned income. Future orders are excluded.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Current VIP order items")}>
        <ModTable columns={[
          { key: "item", label: tOr(`${K}.item`, "Requested item") },
          { key: "target", label: tOr(`${K}.target`, "Target"), align: "end" },
          { key: "delivered", label: tOr(`${K}.delivered`, "Recorded progress"), align: "end" },
          { key: "remaining", label: tOr(`${K}.remaining`, "Remaining"), align: "end" },
          { key: "payout", label: tOr(`${K}.payout`, "Listed item payout"), align: "end" },
        ]} rows={rows.map((row, index) => ({
          key: `${row.fillType ?? index}`,
          cells: {
            item: row.title || row.fillType || "—",
            target: `${formatNumber(row.quantity, 0)} ${unit(row)}`,
            delivered: `${formatNumber(row.delivered, 0)} ${unit(row)}`,
            remaining: `${formatNumber(row.remaining, 0)} ${unit(row)}`,
            payout: money(row.potentialPayout),
          },
        }))} empty={tOr(`${K}.empty`, "No current VIP order was recorded for this farm.")} />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`,
          "Only part of the current order was read; item totals are withheld.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`,
          "Some current-order values were invalid; item totals are withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
