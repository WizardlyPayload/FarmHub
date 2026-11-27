import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.realisticMilkingTimes";
type Pen = { farmId?: number; placeableId?: string; barn?: string; pendingLitres?: number };

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const pens = asList<Pen>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "pens", label: tOr(`${K}.pens`, "Owned dairy pens"), value: formatNumber(farmData.penCount, 0) },
    { key: "pending", label: tOr(`${K}.pending`, "Milk pending release"), value: `${formatNumber(farmData.pendingLitres, 1)} L` },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Milk held by Realistic Milking Times in this farm's dairy pens until its 06:00 or 18:00 release. This is not milk already in storage, sold or earned.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.tableTitle`, "Pending milk by dairy pen")}>
        <ModTable
          columns={[
            { key: "barn", label: tOr(`${K}.barn`, "Dairy pen") },
            { key: "pending", label: tOr(`${K}.pending`, "Milk pending release"), align: "end" },
          ]}
          rows={pens.map((pen, index) => ({
            key: pen.placeableId || String(index),
            cells: {
              barn: pen.barn || pen.placeableId || "—",
              pending: num(pen.pendingLitres) === null ? "—" : `${formatNumber(pen.pendingLitres, 1)} L`,
            },
          }))}
          empty={tOr(`${K}.empty`, "No owned dairy pen has a readable pending milk buffer.")}
        />
        {page?.coverage === "truncated" || page?.coverage === "partial" ? (
          <ModEmpty>{tOr(`${K}.partial`, "Some dairy-pen milk buffers were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
