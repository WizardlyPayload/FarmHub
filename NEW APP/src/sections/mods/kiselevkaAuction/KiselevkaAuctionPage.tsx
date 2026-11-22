import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, formatNumber,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.kiselevkaAuction";

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData } = useCompanionPage(entry.key);
  const money = useMoney();
  const active = page?.readState === "ok" && farmData;
  const tiles: ModStatTile[] = active ? [
    { key: "land", label: tOr(`${K}.farmland`, "Farmland"),
      value: formatNumber(farmData.farmlandId, 0) },
    { key: "price", label: tOr(`${K}.price`, "Current bid"),
      value: money(farmData.currentPrice) },
    { key: "time", label: tOr(`${K}.time`, "Game hours remaining at export"),
      value: formatNumber(farmData.remainingGameHours, 2) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "The active Kiselevka land auction at the last export. Price and remaining game time can change; refresh before bidding. This page never places a bid or records a purchase.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.status`, "This farm's bid status")}>
        {active ? <p>{farmData.leading === true
          ? tOr(`${K}.leading`, "This farm currently leads the auction.")
          : tOr(`${K}.notLeading`, "This farm is not the current highest bidder.")}</p>
          : <ModEmpty>{tOr(`${K}.empty`, "No confirmed active auction reading is available.")}</ModEmpty>}
      </Card>
    </ModPage>
  );
}
