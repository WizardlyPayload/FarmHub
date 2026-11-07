import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.sellToTheBestBidder";
type Listing = {
  farmId?: number; vehicle?: string; askingPrice?: number; offerPrice?: number;
  workshopPrice?: number; buyerArrived?: boolean; buyerDelayMinutes?: number;
  elapsedGameMinutes?: number; buyerWaitElapsed?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<Listing>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "listed", label: tOr(`${K}.listed`, "Currently listed"), value: formatNumber(farmData.listingCount, 0) },
    { key: "offers", label: tOr(`${K}.offers`, "Buyer offers now"), value: formatNumber(farmData.activeOfferCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current Sell To The Best Bidder listings for vehicles this farm still owns. A buyer offer is provisional; it is not a completed sale or farm revenue.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.tableTitle`, "Vehicles offered for sale")}>
        <ModTable columns={[
          { key: "vehicle", label: tOr(`${K}.vehicle`, "Vehicle") },
          { key: "asking", label: tOr(`${K}.asking`, "Asking price"), align: "end" },
          { key: "status", label: tOr(`${K}.status`, "Buyer status") },
          { key: "offer", label: tOr(`${K}.offer`, "Current offer"), align: "end" },
          { key: "dealer", label: tOr(`${K}.dealer`, "Dealer comparison"), align: "end" },
        ]} rows={rows.map((row, index) => ({ key: `${row.vehicle ?? "vehicle"}-${index}`, cells: {
          vehicle: row.vehicle || "—",
          asking: num(row.askingPrice) == null ? "—" : money(row.askingPrice!),
          status: row.buyerArrived ? tOr(`${K}.arrived`, "Buyer on site") : tOr(`${K}.waiting`, "Waiting for buyer"),
          offer: num(row.offerPrice) == null ? "—" : money(row.offerPrice!),
          dealer: num(row.workshopPrice) == null ? "—" : money(row.workshopPrice!),
        } }))} empty={tOr(`${K}.empty`, "No vehicle is currently listed by this farm.")} />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the active listing register was scanned or displayed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Listings with uncertain current ownership or invalid values were withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
