import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Rule = {
  crop?: string;
  playerEnabled?: boolean;
  npcAllowed?: boolean;
  npcMaxHa?: number;
  resetNpcFields?: boolean;
  reseedWeight?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page } = useCompanionPage(entry.key);
  const rules = asList<Rule>(page?.rules);
  const yes = tOr("companionPage.cropControlOverride.yes", "Yes");
  const no = tOr("companionPage.cropControlOverride.no", "No");
  const tiles: ModStatTile[] = page ? [
    { key: "rules", label: tOr("companionPage.cropControlOverride.total", "Crop rules inspected"), value: formatNumber(page.ruleCount, 0) },
    { key: "changed", label: tOr("companionPage.cropControlOverride.changed", "Nondefault rules"), value: formatNumber(page.changedCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.cropControlOverride.lead", "These live crop rules apply to the whole save and every farm. This page lists changed rules only. It does not prove an NPC field was reset, a crop was planted, or a harvest occurred. The newer beta's regional calendar settings are outside this reading.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.cropControlOverride.tableTitle", "Changed crop rules for this save")}>
        <ModTable
          columns={[
            { key: "crop", label: tOr("companionPage.cropControlOverride.crop", "Crop") },
            { key: "player", label: tOr("companionPage.cropControlOverride.player", "Player can plant") },
            { key: "npc", label: tOr("companionPage.cropControlOverride.npc", "NPC allowed") },
            { key: "area", label: tOr("companionPage.cropControlOverride.area", "NPC field maximum") },
            { key: "reset", label: tOr("companionPage.cropControlOverride.reset", "NPC reset enabled") },
            { key: "weight", label: tOr("companionPage.cropControlOverride.weight", "Reseed weight") },
          ]}
          rows={rules.map((rule, index) => ({
            key: `${rule.crop ?? "crop"}-${index}`,
            cells: {
              crop: rule.crop || "—",
              player: rule.playerEnabled === false ? no : yes,
              npc: rule.npcAllowed == null ? tOr("companionPage.cropControlOverride.mapDefault", "Map default") : rule.npcAllowed ? yes : no,
              area: rule.npcMaxHa == null ? tOr("companionPage.cropControlOverride.unlimited", "No limit") : `${formatNumber(rule.npcMaxHa, 2)} ha`,
              reset: rule.resetNpcFields === false ? no : yes,
              weight: formatNumber(rule.reseedWeight, 0),
            },
          }))}
          empty={tOr("companionPage.cropControlOverride.empty", "No changed crop rule is readable in the live server policy.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.cropControlOverride.truncated", "Only part of this save's crop rules was inspected or listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.cropControlOverride.partial", "Some live crop rules could not be read as named rows.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
