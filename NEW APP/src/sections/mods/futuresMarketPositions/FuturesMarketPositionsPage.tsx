import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Position = {
  farmId?: number;
  crop?: string;
  direction?: string;
  amount?: number;
  leverage?: number;
  entryPrice?: number;
  postedMargin?: number;
  expiryPeriod?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const positions = asList<Position>(page?.positions).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "positions", label: tOr("companionPage.futuresMarketPositions.positions", "Open positions"), value: formatNumber(farmData.positionCount, 0) },
    { key: "margin", label: tOr("companionPage.futuresMarketPositions.margin", "Posted margin"), value: money(farmData.postedMargin) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.futuresMarketPositions.lead", "Open commodity contracts recorded by Futures Market for this farm. Margin is money posted when a position opened; entry terms and the mod's expiry index are not realized profit or a payout forecast.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.futuresMarketPositions.tableTitle", "Open commodity positions")}>
        <ModTable
          columns={[
            { key: "crop", label: tOr("companionPage.futuresMarketPositions.crop", "Crop") },
            { key: "direction", label: tOr("companionPage.futuresMarketPositions.direction", "Direction") },
            { key: "amount", label: tOr("companionPage.futuresMarketPositions.amount", "Contract amount"), align: "end" },
            { key: "leverage", label: tOr("companionPage.futuresMarketPositions.leverage", "Leverage"), align: "end" },
            { key: "entry", label: tOr("companionPage.futuresMarketPositions.entry", "Entry price"), align: "end" },
            { key: "margin", label: tOr("companionPage.futuresMarketPositions.margin", "Posted margin"), align: "end" },
            { key: "expiry", label: tOr("companionPage.futuresMarketPositions.expiry", "Mod expiry index"), align: "end" },
          ]}
          rows={positions.map((position, index) => ({
            key: `${position.crop ?? "crop"}-${index}`,
            cells: {
              crop: position.crop || "—",
              direction: position.direction === "LONG" ? tOr("companionPage.futuresMarketPositions.long", "Long / buy") : tOr("companionPage.futuresMarketPositions.short", "Short / sell"),
              amount: formatNumber(position.amount, 0),
              leverage: `${formatNumber(position.leverage, 0)}×`,
              entry: money(position.entryPrice),
              margin: money(position.postedMargin),
              expiry: formatNumber(position.expiryPeriod, 0),
            },
          }))}
          empty={tOr("companionPage.futuresMarketPositions.empty", "No open Futures Market position for this farm.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.futuresMarketPositions.truncated", "Only some positions are listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.futuresMarketPositions.partial", "Some position terms could not be read.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
