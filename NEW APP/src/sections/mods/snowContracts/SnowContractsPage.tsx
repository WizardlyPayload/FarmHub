import { tOr } from "@/i18n/i18n";
import {
  ModPage, ModStatTiles, num, useCompanionPage, useMoney,
  type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

export function Page({ entry }: CompanionPageProps) {
  const { farmData } = useCompanionPage(entry.key);
  const money = useMoney();
  const amount = num(farmData?.pendingAmount);
  const tiles: ModStatTile[] = amount == null ? [] : [
    { key: "pending", label: tOr("companionPage.snowContracts.pending", "Unpaid snow clearing"), value: money(amount) },
  ];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.snowContracts.lead", "Snow Contracts credits this farm for eligible snow cleared on other owners' land. This is the mod's current unpaid amount; a payout is credited to the farm on a later game day. It is not contract income already received.")}>
      <ModStatTiles tiles={tiles} />
    </ModPage>
  );
}
