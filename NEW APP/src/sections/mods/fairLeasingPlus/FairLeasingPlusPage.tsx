import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.fairLeasingPlus";

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData } = useCompanionPage(entry.key);
  const money = useMoney();
  const tiles: ModStatTile[] = farmData ? [
    { key: "returns", label: tOr(`${K}.returns`, "Leased vehicles returned"), value: formatNumber(farmData.returnsCount, 0) },
    { key: "points", label: tOr(`${K}.points`, "Reward points"), value: formatNumber(farmData.points, 0) },
    { key: "rank", label: tOr(`${K}.rank`, "Current reward rank"), value: String(farmData.rank || "—") },
    { key: "saving", label: tOr(`${K}.saving`, "Estimated upfront fee saving"),
      value: num(farmData.estimatedUpfrontSaving) == null ? "—" : money(farmData.estimatedUpfrontSaving) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Fair Leasing Plus records rewards when this farm returns leased vehicles. Its saved-money total estimates an upfront base leasing-fee reduction; it does not track actual day or hour savings or income received.")}>
      <ModStatTiles tiles={tiles} />
      {farmData ? (
        <>
          <Card title={tOr(`${K}.returnTitle`, "Return rewards")}>
            <ModTable columns={[
              { key: "kind", label: tOr(`${K}.kind`, "Return result") },
              { key: "count", label: tOr(`${K}.count`, "Count"), align: "end" },
            ]} rows={[
              { key: "clean", cells: { kind: tOr(`${K}.clean`, "Clean returns"), count: formatNumber(farmData.cleanReturns, 0) } },
              { key: "full", cells: { kind: tOr(`${K}.full`, "Full tank or charge returns"), count: formatNumber(farmData.fullTankReturns, 0) } },
            ]} />
          </Card>
          <Card title={tOr(`${K}.discountTitle`, "Current leasing discounts")}>
            <ModTable columns={[
              { key: "kind", label: tOr(`${K}.discountKind`, "Fee") },
              { key: "discount", label: tOr(`${K}.discount`, "Discount"), align: "end" },
            ]} rows={[
              { key: "bonus", cells: { kind: tOr(`${K}.bonus`, "Reward-rank bonus"), discount: `${formatNumber(farmData.bonusDiscountPercent, 0)}%` } },
              { key: "base", cells: { kind: tOr(`${K}.base`, "Base leasing fee"), discount: `${formatNumber(farmData.baseDiscountPercent, 0)}%` } },
              { key: "day", cells: { kind: tOr(`${K}.day`, "Daily charge"), discount: `${formatNumber(farmData.dayDiscountPercent, 0)}%` } },
              { key: "hour", cells: { kind: tOr(`${K}.hour`, "Hourly charge"), discount: `${formatNumber(farmData.hourDiscountPercent, 0)}%` } },
            ]} />
          </Card>
        </>
      ) : (
        <ModEmpty>{page?.reason === "no-return-history"
          ? tOr(`${K}.empty`, "This farm has no recorded leased-vehicle return yet.")
          : tOr(`${K}.unavailable`, "The mod's rewards register is not readable for this farm.")}</ModEmpty>
      )}
    </ModPage>
  );
}
