import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModPage, ModStatTiles, ModTable, asList, formatNumber, useCompanionPage,
  useUnitPrice, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type WoodRow = {
  splitType?: string; title?: string;
  pricePerLitre?: number; defaultPricePerLitre?: number;
  woodChipsPerLitre?: number; defaultWoodChipsPerLitre?: number;
};

const K = "companionPage.woodManager";

export function Page({ entry }: CompanionPageProps) {
  const { page } = useCompanionPage(entry.key);
  const unitPrice = useUnitPrice();
  const rows = asList<WoodRow>(page?.rows);
  const tiles: ModStatTile[] = page ? [
    { key: "overrides", label: tOr(`${K}.count`, "Applied split-wood overrides"), value: formatNumber(page.overrideCount) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "These nondefault split-wood price and wood-chip yield settings apply across this save. They are live rules, not this farm's wood sales, harvested volume or income. The mod's configuration may not yet be saved to disk.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.tableTitle`, "Active split-wood rules")}>
        <ModTable
          columns={[
            { key: "type", label: tOr(`${K}.type`, "Wood type") },
            { key: "price", label: tOr(`${K}.price`, "Current price / L"), align: "end" },
            { key: "defaultPrice", label: tOr(`${K}.defaultPrice`, "Default price / L"), align: "end" },
            { key: "chips", label: tOr(`${K}.chips`, "Current chips L / wood L"), align: "end" },
            { key: "defaultChips", label: tOr(`${K}.defaultChips`, "Default chips L / wood L"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.splitType ?? "wood"}-${index}`,
            cells: {
              type: row.title || row.splitType || "—",
              price: unitPrice(row.pricePerLitre),
              defaultPrice: unitPrice(row.defaultPricePerLitre),
              chips: row.woodChipsPerLitre == null ? "—" : formatNumber(row.woodChipsPerLitre, 3),
              defaultChips: row.defaultWoodChipsPerLitre == null ? "—" : formatNumber(row.defaultWoodChipsPerLitre, 3),
            },
          }))}
          empty={tOr(`${K}.empty`, "No applied nondefault split-wood settings are available.")}
        />
      </Card>
    </ModPage>
  );
}
