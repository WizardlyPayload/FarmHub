import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Farmland = {
  farmId?: number;
  farmlandId?: number;
  activeCrop?: string;
  history?: string[];
  plan?: string[];
  coverPlan?: string[];
};

function cropList(value: unknown, numbered: boolean): string {
  const crops = asList<string>(value);
  const lines = crops.map((crop, index) => crop
    ? numbered ? `${index + 1}: ${crop}` : crop
    : "").filter(Boolean);
  return lines.length ? lines.join(" · ") : "—";
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Farmland>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "land", label: tOr("companionPage.realisticCropRotation.land", "Tracked land parcels"), value: formatNumber(farmData.farmlandCount, 0) },
    { key: "plans", label: tOr("companionPage.realisticCropRotation.plans", "With crop plans"), value: formatNumber(farmData.plannedCount, 0) },
    { key: "history", label: tOr("companionPage.realisticCropRotation.histories", "With history"), value: formatNumber(farmData.historyCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.realisticCropRotation.lead", "Saved crop and cover-crop plans, and recent rotation history, for land your farm currently owns. A plan is an intention, not a completed harvest; land sold to another farm is omitted.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.realisticCropRotation.tableTitle", "Owned farmland rotation records")}>
        <ModTable
          columns={[
            { key: "land", label: tOr("companionPage.realisticCropRotation.field", "Farmland") },
            { key: "current", label: tOr("companionPage.realisticCropRotation.current", "Last tracked crop") },
            { key: "history", label: tOr("companionPage.realisticCropRotation.history", "Recent history") },
            { key: "plan", label: tOr("companionPage.realisticCropRotation.plan", "Crop plan (slots 1–4)") },
            { key: "cover", label: tOr("companionPage.realisticCropRotation.cover", "Cover plan (slots 1–4)") },
          ]}
          rows={rows.map((row, index) => ({
            key: String(row.farmlandId ?? index),
            cells: {
              land: formatNumber(row.farmlandId, 0),
              current: row.activeCrop || "—",
              history: cropList(row.history, false),
              plan: cropList(row.plan, true),
              cover: cropList(row.coverPlan, true),
            },
          }))}
          empty={tOr("companionPage.realisticCropRotation.empty", "No saved rotation plan or history for this farm's land yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.realisticCropRotation.truncated", "Only part of the owned farmland record is listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
