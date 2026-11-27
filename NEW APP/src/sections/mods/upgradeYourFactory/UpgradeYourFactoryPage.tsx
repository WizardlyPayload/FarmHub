import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Production = {
  farmId?: number; production?: string; level?: number;
  maxLevel?: number; nextUpgradePrice?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const productions = asList<Production>(page?.productions).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "upgradable", label: tOr("companionPage.upgradeYourFactory.upgradable", "Upgradable productions"), value: formatNumber(farmData.upgradableCount, 0) },
    { key: "upgraded", label: tOr("companionPage.upgradeYourFactory.upgraded", "Above level 1"), value: formatNumber(farmData.upgradedCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.upgradeYourFactory.lead", "Current Upgrade Your Factory levels for this farm's owned productions in single player. Prices are previews for a possible next upgrade, not purchases or expenses already paid.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.upgradeYourFactory.tableTitle", "Production upgrades")}>
        <ModTable
          columns={[
            { key: "production", label: tOr("companionPage.upgradeYourFactory.production", "Production") },
            { key: "level", label: tOr("companionPage.upgradeYourFactory.level", "Current level"), align: "end" },
            { key: "max", label: tOr("companionPage.upgradeYourFactory.max", "Maximum level"), align: "end" },
            { key: "price", label: tOr("companionPage.upgradeYourFactory.price", "Next upgrade preview"), align: "end" },
          ]}
          rows={productions.map((row, index) => ({
            key: `${row.production ?? "production"}-${index}`,
            cells: {
              production: row.production ?? "—", level: formatNumber(row.level, 0),
              max: formatNumber(row.maxLevel, 0), price: row.nextUpgradePrice == null ? "—" : money(row.nextUpgradePrice),
            },
          }))}
          empty={tOr("companionPage.upgradeYourFactory.empty", "No owned upgradable production is active in this reading.")}
        />
        <ModEmpty>{tOr("companionPage.upgradeYourFactory.note", "The mod changes native production speed, cost and storage capacity. This page records its upgrade level and next-price preview; it does not count realized output or paid upgrades.")}</ModEmpty>
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.upgradeYourFactory.truncated", "Only some owned productions were scanned or displayed; summary counts are withheld.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.upgradeYourFactory.partial", "Some owned production levels or prices could not be verified; summary counts are withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
