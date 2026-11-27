import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.farmContractorServices";

type Order = {
  farmId?: number; orderId?: number; farmlandId?: number;
  fieldName?: string; service?: string; state?: string;
  bookedPrice?: number; areaHa?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<Order>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "orders", label: tOr(`${K}.orders`, "Current work orders"),
      value: formatNumber(farmData.currentOrderCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "Current single-player contractor bookings and operations for this farm. Booked price is the mod's recorded amount, not proof of completed work or final cost. The table uses farmland IDs.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Current contractor work orders")}>
        <ModTable columns={[
          { key: "id", label: tOr(`${K}.id`, "Order") },
          { key: "field", label: tOr(`${K}.field`, "Field / farmland") },
          { key: "service", label: tOr(`${K}.service`, "Service") },
          { key: "state", label: tOr(`${K}.state`, "Mod state") },
          { key: "area", label: tOr(`${K}.area`, "Area (ha)"), align: "end" },
          { key: "price", label: tOr(`${K}.price`, "Booked price"), align: "end" },
        ]} rows={rows.map((row, index) => ({
          key: `${row.orderId ?? index}`,
          cells: {
            id: formatNumber(row.orderId, 0),
            field: row.fieldName || `${tOr(`${K}.farmland`, "Farmland")} ${formatNumber(row.farmlandId, 0)}`,
            service: row.service || "—",
            state: row.state || "—",
            area: formatNumber(row.areaHa, 2),
            price: money(row.bookedPrice),
          },
        }))} empty={page?.coverage === "truncated"
          ? tOr(`${K}.truncated`, "Only part of the live work-order register was read; the total is withheld.")
          : page?.readState === "partial"
            ? tOr(`${K}.partial`, "Some work-order values were invalid or ambiguous; the total is withheld.")
            : tOr(`${K}.empty`, "No current contractor work order was recorded for this farm.")} />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`,
          "Only part of the live work-order register was read; the total is withheld.")}</ModEmpty> : null}
        {page?.readState === "partial" && page?.coverage !== "truncated" ? <ModEmpty>{tOr(`${K}.partial`,
          "Some work-order values were invalid or ambiguous; the total is withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
