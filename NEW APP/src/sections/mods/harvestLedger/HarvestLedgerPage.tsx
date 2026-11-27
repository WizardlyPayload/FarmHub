import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type HarvestRow = {
  farmId?: number;
  eventId?: number;
  scope?: string;
  field?: string;
  crop?: string;
  product?: string;
  year?: number;
  month?: number;
  areaSqm?: number;
  liters?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<HarvestRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "events", label: tOr("companionPage.harvestLedger.events", "Harvests recorded"), value: formatNumber(farmData.eventCount, 0) },
    { key: "open", label: tOr("companionPage.harvestLedger.open", "In progress"), value: formatNumber(farmData.openCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.harvestLedger.lead", "See measured harvest area and product volume saved by Harvest Ledger for your farm. These figures are physical harvests, not sales or profit. Multiplayer history is withheld until older records have verifiable farm ownership.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.harvestLedger.tableTitle", "Harvest by field and month")}>
        <ModTable
          columns={[
            { key: "period", label: tOr("companionPage.harvestLedger.period", "Month") },
            { key: "field", label: tOr("companionPage.harvestLedger.field", "Field") },
            { key: "scope", label: tOr("companionPage.harvestLedger.scope", "Scope") },
            { key: "crop", label: tOr("companionPage.harvestLedger.crop", "Crop") },
            { key: "product", label: tOr("companionPage.harvestLedger.product", "Product") },
            { key: "area", label: tOr("companionPage.harvestLedger.area", "Harvested area") , align: "end" },
            { key: "volume", label: tOr("companionPage.harvestLedger.volume", "Harvested volume"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.eventId ?? index}-${row.year ?? 0}-${row.month ?? 0}-${row.product ?? index}`,
            cells: {
              period: num(row.year) != null && num(row.month) != null ? `${formatNumber(row.year, 0)} / ${formatNumber(row.month, 0)}` : "—",
              field: row.field || "—",
              scope: row.scope === "contract"
                ? tOr("companionPage.harvestLedger.contract", "Contract")
                : tOr("companionPage.harvestLedger.farm", "Farm"),
              crop: row.crop || "—",
              product: row.product || "—",
              area: num(row.areaSqm) != null ? `${formatNumber((num(row.areaSqm) || 0) / 10000, 2)} ha` : "—",
              volume: num(row.liters) != null ? `${formatNumber(row.liters, 0)} L` : "—",
            },
          }))}
          empty={tOr("companionPage.harvestLedger.empty", "No measured harvests for this farm yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.harvestLedger.truncated", "Only part of the saved harvest history is listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
