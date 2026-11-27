import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModPage, ModStatTiles, formatNumber, useCompanionPage, useMoney,
  type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.multiplayerAchievements";

export function Page({ entry }: CompanionPageProps) {
  const { farmData } = useCompanionPage(entry.key);
  const money = useMoney();
  const tiles: ModStatTile[] = farmData ? [
    { key: "balance", label: tOr(`${K}.balance`, "Eligible balance now"), value: money(Number(farmData.eligibleBalance)) },
    { key: "peak", label: tOr(`${K}.peak`, "Highest eligible balance"), value: money(Number(farmData.eligiblePeak)) },
    { key: "cows", label: tOr(`${K}.cows`, "Eligible cows bred"), value: formatNumber(farmData.eligibleCowsBred, 0) },
    { key: "sheep", label: tOr(`${K}.sheep`, "Eligible sheep bred"), value: formatNumber(farmData.eligibleSheepBred, 0) },
    { key: "pigs", label: tOr(`${K}.pigs`, "Eligible pigs bred"), value: formatNumber(farmData.eligiblePigsBred, 0) },
    { key: "chickens", label: tOr(`${K}.chickens`, "Eligible chickens bred"), value: formatNumber(farmData.eligibleChickensBred, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "The mod's server-owned farm eligibility ledger in an active multiplayer game. Eligible balance excludes unsupported income; it is not the farm's bank balance or realized profit.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.about`, "What these counters mean")}>
        <p class="fd-economy__muted">{tOr(`${K}.note`,
          "Breeding counts include only events the mod marked eligible. The personal achievement file and map-wide collectible total are outside this farm reading.")}</p>
      </Card>
    </ModPage>
  );
}
