import { tOr } from "@/i18n/i18n";
import {
  ModPage, ModStatTiles, formatNumber, num, useCompanionPage, useUnitPrice,
  type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

export function Page({ entry }: CompanionPageProps) {
  const { farmData } = useCompanionPage(entry.key);
  const unitPrice = useUnitPrice();
  const tiles: ModStatTile[] = [];
  if (farmData != null && num(farmData.balanceCfc) != null) {
    tiles.push({ key: "balance", label: tOr("companionPage.cryptoFarm.balance", "Coin balance"),
      value: `${formatNumber(farmData.balanceCfc, 2)} CFC` });
  }
  if (farmData != null && num(farmData.ratePerCfc) != null) {
    tiles.push({ key: "rate", label: tOr("companionPage.cryptoFarm.rate", "Current quote per CFC"),
      value: unitPrice(farmData.ratePerCfc) });
  }
  return (
    <ModPage entry={entry} lead={tOr("companionPage.cryptoFarm.lead", "This farm's Crypto Farm coin holding is separate from its game-money balance. The quoted exchange rate is shared and can change; it does not record a sale, withdrawal or realized profit. Buy and sell fees apply in the mod.")}>
      <ModStatTiles tiles={tiles} />
    </ModPage>
  );
}
