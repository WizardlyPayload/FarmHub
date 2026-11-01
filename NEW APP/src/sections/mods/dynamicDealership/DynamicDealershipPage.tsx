import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type CustomerOrder = {
  farmId?: number;
  orderId?: number;
  vehicle?: string;
  quantity?: number;
  deliveryDay?: number;
  paidAmount?: number;
  remainingAmount?: number;
  financed?: boolean;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<CustomerOrder>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "orders", label: tOr("companionPage.dynamicDealership.orders", "Pending orders"), value: formatNumber(farmData.orderCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.dynamicDealership.lead", "Pending customer vehicle orders for this farm, as recorded by Dynamic Dealership. A delivery day is the game's running day number. Amounts are the order register's paid and remaining fields; a financed order's remaining field is not its full loan balance. Dealer stock and delivered vehicles are excluded.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.dynamicDealership.tableTitle", "Vehicle orders awaiting delivery")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.dynamicDealership.vehicle", "Vehicle") },
            { key: "quantity", label: tOr("companionPage.dynamicDealership.quantity", "Quantity"), align: "end" },
            { key: "delivery", label: tOr("companionPage.dynamicDealership.delivery", "Game delivery day"), align: "end" },
            { key: "paid", label: tOr("companionPage.dynamicDealership.paid", "Paid on order"), align: "end" },
            { key: "remaining", label: tOr("companionPage.dynamicDealership.remaining", "Order balance"), align: "end" },
            { key: "finance", label: tOr("companionPage.dynamicDealership.finance", "Financed") },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.orderId ?? index}`,
            cells: {
              vehicle: row.vehicle || "—",
              quantity: formatNumber(row.quantity, 0),
              delivery: formatNumber(row.deliveryDay, 0),
              paid: num(row.paidAmount) == null ? "—" : money(row.paidAmount!),
              remaining: num(row.remainingAmount) == null ? "—" : money(row.remainingAmount!),
              finance: row.financed ? tOr("companionPage.dynamicDealership.yes", "Yes") : tOr("companionPage.dynamicDealership.no", "No"),
            },
          }))}
          empty={tOr("companionPage.dynamicDealership.empty", "No pending customer vehicle order recorded for this farm.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.dynamicDealership.truncated", "Only some current orders are listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.dynamicDealership.partial", "Some current orders could not be read.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
