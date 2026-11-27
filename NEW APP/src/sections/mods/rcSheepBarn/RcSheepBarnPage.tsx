import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.rcSheepBarn";

type Group = { group?: string; requiredPercent?: number; storedLitres?: number };
type Barn = {
  farmId?: number; placeableId?: string; barn?: string;
  strawLitres?: number; strawCapacityLitres?: number;
  availableRationLitres?: number; groups?: Group[];
};

const GROUP_LABELS: Record<string, string> = {
  hay: "Hay", silage: "Silage", grain: "Wheat / barley", mineral: "Mineral feed",
};

function litres(value: unknown): string {
  return num(value) === null ? "—" : `${formatNumber(value, 0)} L`;
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const barns = asList<Barn>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "barns", label: tOr(`${K}.barns`, "Owned RC sheep barns"), value: formatNumber(farmData.barnCount, 0) },
    { key: "straw", label: tOr(`${K}.straw`, "Straw stored in these barns"), value: litres(farmData.storedStrawLitres) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current straw and required ration ingredients in this farm's RC sheep barns. Ration availability is calculated from the mod's recipe. It does not prove feeding or manure production.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Sheep barn supplies")}>
        <ModTable columns={[
          { key: "barn", label: tOr(`${K}.barn`, "Barn") },
          { key: "straw", label: tOr(`${K}.strawLevel`, "Straw / capacity"), align: "end" },
          { key: "ration", label: tOr(`${K}.ration`, "Ration ingredients available"), align: "end" },
        ]} rows={barns.map((barn, index) => ({
          key: barn.placeableId || String(index),
          cells: {
            barn: barn.barn || "—",
            straw: `${litres(barn.strawLitres)} / ${litres(barn.strawCapacityLitres)}`,
            ration: litres(barn.availableRationLitres),
          },
        }))} empty={tOr(`${K}.empty`, "No owned RC sheep barn has readable supplies.")} />
      </Card>
      {barns.map((barn, index) => (
        <Card key={barn.placeableId || index} title={barn.barn || tOr(`${K}.barn`, "Barn")}>
          <ModTable columns={[
            { key: "ingredient", label: tOr(`${K}.ingredient`, "Ingredient") },
            { key: "required", label: tOr(`${K}.required`, "Required share"), align: "end" },
            { key: "stored", label: tOr(`${K}.stored`, "Stored"), align: "end" },
          ]} rows={asList<Group>(barn.groups).map((group, groupIndex) => ({
            key: `${barn.placeableId || index}-${group.group || groupIndex}`,
            cells: {
              ingredient: tOr(`${K}.group.${group.group || ""}`, GROUP_LABELS[group.group || ""] || "—"),
              required: num(group.requiredPercent) === null ? "—" : `${formatNumber(group.requiredPercent, 0)}%`,
              stored: litres(group.storedLitres),
            },
          }))} empty={tOr(`${K}.emptyGroups`, "Ration groups are unavailable.")} />
        </Card>
      ))}
      {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned barn list is shown.")}</ModEmpty> : null}
      {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "An owned barn had ambiguous identity or unreadable supplies and was withheld.")}</ModEmpty> : null}
    </ModPage>
  );
}
