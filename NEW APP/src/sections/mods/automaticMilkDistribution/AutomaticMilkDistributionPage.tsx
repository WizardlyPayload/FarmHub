import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.automaticMilkDistribution";

type BarnRow = {
  farmId?: number;
  barn?: string;
  enabled?: boolean;
  milkTypes?: string[];
};

function milkTypeLabel(name: string): string {
  if (name === "MILK") return tOr(`${K}.cowMilk`, "Cow milk");
  if (name === "BUFFALOMILK") return tOr(`${K}.buffaloMilk`, "Buffalo milk");
  return name;
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<BarnRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "barns", label: tOr(`${K}.barns`, "Owned milk barns"), value: formatNumber(farmData.barnCount, 0) },
    { key: "enabled", label: tOr(`${K}.enabled`, "Automatic distribution enabled"), value: formatNumber(farmData.enabledCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current per-barn switch from Automatic Milk Distribution. The mod moves milk only when it runs and finds a suitable production point; this page does not record transfers or costs.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.tableTitle`, "Milk barn settings")}>
        <ModTable
          columns={[
            { key: "barn", label: tOr(`${K}.barn`, "Barn") },
            { key: "milk", label: tOr(`${K}.milk`, "Milk type") },
            { key: "state", label: tOr(`${K}.state`, "Automatic distribution") },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.barn || "barn"}-${index}`,
            cells: {
              barn: row.barn || tOr(`${K}.unnamed`, "Unnamed barn"),
              milk: asList<string>(row.milkTypes).map(milkTypeLabel).join(", ") || "—",
              state: row.enabled === true ? tOr(`${K}.on`, "On") : tOr(`${K}.off`, "Off"),
            },
          }))}
          empty={tOr(`${K}.empty`, "No owned milk barn with a readable distribution switch was found.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only the first owned milk barns are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
