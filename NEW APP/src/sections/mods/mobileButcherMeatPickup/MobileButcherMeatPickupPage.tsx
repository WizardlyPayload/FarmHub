import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type MeatRow = {
  farmId?: number;
  fillTypeIndex?: number;
  fillType?: string;
  pendingKg?: number;
  reservedKg?: number;
  pendingBonus?: number;
  reservedBonus?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<MeatRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "types", label: tOr("companionPage.mobileButcherMeatPickup.types", "Meat types awaiting pickup"), value: formatNumber(farmData.fillTypeCount, 0) },
    { key: "reserved", label: tOr("companionPage.mobileButcherMeatPickup.reserved", "Reserved for butcher visit"), value: `${formatNumber(farmData.reservedKg, 0)} kg` },
    { key: "pending", label: tOr("companionPage.mobileButcherMeatPickup.pending", "Awaiting pallets"), value: `${formatNumber(farmData.pendingKg, 0)} kg` },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.mobileButcherMeatPickup.lead", "Meat promised by an unfinished butcher visit or waiting at this farm's Meat Pickup to become pallets. These are not delivered pallets or realized sales.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.mobileButcherMeatPickup.tableTitle", "Meat Pickup queue")}>
        <ModTable
          columns={[
            { key: "meat", label: tOr("companionPage.mobileButcherMeatPickup.meat", "Meat type") },
            { key: "reserved", label: tOr("companionPage.mobileButcherMeatPickup.reserved", "Reserved for butcher visit") },
            { key: "pending", label: tOr("companionPage.mobileButcherMeatPickup.pending", "Awaiting pallets") },
            { key: "bonus", label: tOr("companionPage.mobileButcherMeatPickup.bonus", "Pending sale bonus") },
          ]}
          rows={rows.map((row, index) => ({
            key: String(row.fillTypeIndex || index),
            cells: {
              meat: row.fillType || String(row.fillTypeIndex || "—"),
              reserved: `${formatNumber(row.reservedKg, 0)} kg`,
              pending: `${formatNumber(row.pendingKg, 0)} kg`,
              bonus: money((num(row.pendingBonus) || 0) + (num(row.reservedBonus) || 0)),
            },
          }))}
          empty={tOr("companionPage.mobileButcherMeatPickup.empty", "No meat is reserved or awaiting pallets at this farm's Meat Pickup.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.mobileButcherMeatPickup.truncated", "Only the first queued meat types are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
