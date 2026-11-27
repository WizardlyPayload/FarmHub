import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Offer = {
  farmId?: number;
  production?: string;
  product?: string;
  pricePer1000L?: number;
  listedLiters?: number;
  remainingLiters?: number;
  listedPallets?: number;
  remainingPallets?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const offers = asList<Offer>(page?.offers).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage !== "truncated" ? [
    { key: "posted", label: tOr("companionPage.invoicesProductionSalesOffers.posted", "Posted offers"), value: formatNumber(farmData.postedCount, 0) },
    { key: "withheld", label: tOr("companionPage.invoicesProductionSalesOffers.withheld", "Offers withheld"), value: formatNumber(farmData.withheldCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.invoicesProductionSalesOffers.lead", "Offers posted through Invoices - Production Sales for production points this farm still owns. The asking price and remaining quantity are offers, not completed sales or income.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.invoicesProductionSalesOffers.tableTitle", "Owned production offers")}>
        <ModTable
          columns={[
            { key: "production", label: tOr("companionPage.invoicesProductionSalesOffers.production", "Production") },
            { key: "product", label: tOr("companionPage.invoicesProductionSalesOffers.product", "Product") },
            { key: "price", label: tOr("companionPage.invoicesProductionSalesOffers.price", "Asking price / 1,000 L"), align: "end" },
            { key: "remaining", label: tOr("companionPage.invoicesProductionSalesOffers.remaining", "Remaining L"), align: "end" },
            { key: "pallets", label: tOr("companionPage.invoicesProductionSalesOffers.pallets", "Remaining pallets"), align: "end" },
          ]}
          rows={offers.map((offer, index) => ({
            key: `${offer.production ?? "point"}-${offer.product ?? index}`,
            cells: {
              production: offer.production || "—",
              product: offer.product || "—",
              price: money(offer.pricePer1000L),
              remaining: formatNumber(offer.remainingLiters, 0),
              pallets: num(offer.listedPallets) && num(offer.listedPallets)! > 0 ? formatNumber(offer.remainingPallets, 0) : "—",
            },
          }))}
          empty={page?.coverage === "truncated"
            ? tOr("companionPage.invoicesProductionSalesOffers.truncated", "Only some offers are listed.")
            : tOr("companionPage.invoicesProductionSalesOffers.empty", "No active owned production offer has been posted.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.invoicesProductionSalesOffers.truncated", "Only some offers are listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.invoicesProductionSalesOffers.partial", "Some posted offers no longer matched a current owned production output and were withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
