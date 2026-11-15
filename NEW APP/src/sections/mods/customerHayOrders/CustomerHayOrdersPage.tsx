import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type HayOrder = {
  farmId?: number;
  customer?: string;
  fillType?: string;
  dropName?: string;
  round?: boolean;
  wrapped?: boolean;
  status?: string;
  required?: number;
  progress?: number;
  rewardOffered?: number;
  deadlineDay?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const orders = asList<HayOrder>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const showOrders = page?.readState === "ok" || page?.readState === "partial" || page?.readState === "settings-only";
  const tiles: ModStatTile[] = farmData ? [
    { key: "offers", label: tOr("companionPage.customerHayOrders.offers", "Offers awaiting response"), value: formatNumber(farmData.offerCount, 0) },
    { key: "accepted", label: tOr("companionPage.customerHayOrders.accepted", "Accepted deliveries"), value: formatNumber(farmData.acceptedCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.customerHayOrders.lead", "Single-player customer bale orders from the mod's saved order register. Rewards shown are offers, not income received. Delivery progress is the mod's recorded bale count at the last game-data reading.")}>
      <ModStatTiles tiles={tiles} />
      {page?.reason === "single-player-only" ? <ModEmpty>{tOr("companionPage.customerHayOrders.singlePlayer", "The mod does not assign orders to farms in multiplayer, so shared orders are withheld here.")}</ModEmpty> : null}
      {showOrders ? <Card title={tOr("companionPage.customerHayOrders.tableTitle", "Customer bale orders")}>
        <ModTable
          columns={[
            { key: "customer", label: tOr("companionPage.customerHayOrders.customer", "Customer") },
            { key: "bales", label: tOr("companionPage.customerHayOrders.bales", "Bales") },
            { key: "progress", label: tOr("companionPage.customerHayOrders.progress", "Delivered") },
            { key: "destination", label: tOr("companionPage.customerHayOrders.destination", "Deliver to") },
            { key: "deadline", label: tOr("companionPage.customerHayOrders.deadline", "Deadline day"), align: "end" },
            { key: "reward", label: tOr("companionPage.customerHayOrders.reward", "Offered reward"), align: "end" },
            { key: "status", label: tOr("companionPage.customerHayOrders.status", "Status") },
          ]}
          rows={orders.map((row, index) => ({
            key: String(index),
            cells: {
              customer: row.customer || "—",
              bales: `${row.fillType || "—"} · ${row.round ? tOr("companionPage.customerHayOrders.round", "round") : tOr("companionPage.customerHayOrders.square", "square")} · ${row.wrapped ? tOr("companionPage.customerHayOrders.wrapped", "wrapped") : tOr("companionPage.customerHayOrders.unwrapped", "unwrapped")}`,
              progress: `${formatNumber(row.progress, 0)} / ${formatNumber(row.required, 0)}`,
              destination: row.dropName || "—",
              deadline: formatNumber(row.deadlineDay, 0),
              reward: money(row.rewardOffered),
              status: row.status === "offer" ? tOr("companionPage.customerHayOrders.pending", "Awaiting response") : tOr("companionPage.customerHayOrders.active", "Accepted"),
            },
          }))}
          empty={page?.readState === "settings-only"
            ? tOr("companionPage.customerHayOrders.empty", "No current customer bale orders were recorded.")
            : tOr("companionPage.customerHayOrders.noValid", "No valid order row could be read.")}
        />
        {page?.coverage === "partial" || page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.customerHayOrders.partial", "Some order details could not be read; the list may be incomplete.")}</ModEmpty> : null}
      </Card> : null}
    </ModPage>
  );
}
