import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Row = {
  farmId?: number;
  source?: string;
  product?: string;
  disabled?: boolean;
  capacityLitres?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Row>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "default", label: tOr("companionPage.productionPalletManager.default", "Farm default capacity"),
      value: `${formatNumber(farmData.defaultCapacityLitres, 0)} L` },
    { key: "weight", label: tOr("companionPage.productionPalletManager.weight", "Normal pallet weight"),
      value: farmData.normalWeight === false
        ? tOr("companionPage.productionPalletManager.no", "No")
        : tOr("companionPage.productionPalletManager.yes", "Yes") },
    { key: "overrides", label: tOr("companionPage.productionPalletManager.overrides", "Owned output overrides"),
      value: formatNumber(farmData.overrideCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.productionPalletManager.lead",
      "Pallet capacity settings for your farm's current production, husbandry and beehive sources. A setting is not a spawned pallet or completed sale.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.productionPalletManager.tableTitle", "Owned source overrides")}>
        <ModTable
          columns={[
            { key: "source", label: tOr("companionPage.productionPalletManager.source", "Source") },
            { key: "product", label: tOr("companionPage.productionPalletManager.product", "Output") },
            { key: "capacity", label: tOr("companionPage.productionPalletManager.capacity", "Pallet capacity") },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.source}-${row.product}-${index}`,
            cells: {
              source: row.source || "—",
              product: row.product || "—",
              capacity: row.disabled
                ? tOr("companionPage.productionPalletManager.disabled", "Mod override disabled")
                : num(row.capacityLitres) == null ? "—" : `${formatNumber(row.capacityLitres, 0)} L`,
            },
          }))}
          empty={tOr("companionPage.productionPalletManager.empty", "No explicit override for a source your farm currently owns.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.productionPalletManager.truncated", "Only part of the owned source list is shown.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.productionPalletManager.partial", "Some saved settings could not be matched safely to current owned sources.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
