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

type DiseaseRow = {
  farmId?: number;
  farmlandId?: number;
  riskBand?: number;
  visibleOutbreak?: string;
};
type DiseaseReading = {
  readState?: string;
  coverage?: string;
  atRiskCount?: number;
  visibleOutbreakCount?: number;
  rows?: DiseaseRow[];
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
  const disease = page?.disease as DiseaseReading | undefined;
  const diseaseRows = asList<DiseaseRow>(disease?.rows).filter((row) => num(row.farmId) === farmId);
  const showDisease = disease?.readState === "ok" || disease?.readState === "partial";
  const tiles: ModStatTile[] = farmData ? [
    { key: "land", label: tOr("companionPage.realisticCropRotation.land", "Tracked land parcels"), value: formatNumber(farmData.farmlandCount, 0) },
    { key: "plans", label: tOr("companionPage.realisticCropRotation.plans", "With crop plans"), value: formatNumber(farmData.plannedCount, 0) },
    { key: "history", label: tOr("companionPage.realisticCropRotation.histories", "With history"), value: formatNumber(farmData.historyCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.realisticCropRotation.lead", "Crop and cover-crop plans, recent rotation history, and available disease readings for land your farm owns at the last export. A plan is an intention, not a completed harvest; land sold to another farm is omitted.")}>
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
      {showDisease ? <Card title={tOr("companionPage.realisticCropRotation.diseaseTitle", "Owned farmland disease reading")}>
        {disease?.readState === "ok" ? <ModStatTiles tiles={[
          { key: "risk", label: tOr("companionPage.realisticCropRotation.riskCount", "Tracked parcels with predictive pressure"), value: formatNumber(disease.atRiskCount, 0) },
          { key: "outbreak", label: tOr("companionPage.realisticCropRotation.outbreakCount", "Tracked parcels with visible outbreak"), value: formatNumber(disease.visibleOutbreakCount, 0) },
        ]} /> : null}
        <ModTable columns={[
          { key: "land", label: tOr("companionPage.realisticCropRotation.field", "Farmland") },
          { key: "risk", label: tOr("companionPage.realisticCropRotation.riskBand", "Predictive pressure band") },
          { key: "outbreak", label: tOr("companionPage.realisticCropRotation.visibleOutbreak", "Visible outbreak") },
        ]} rows={diseaseRows.map((row, index) => ({
          key: String(row.farmlandId ?? index),
          cells: {
            land: formatNumber(row.farmlandId, 0),
            risk: formatNumber(row.riskBand, 0),
            outbreak: row.visibleOutbreak || "—",
          },
        }))} empty={tOr("companionPage.realisticCropRotation.noDiseaseRows", "No tracked owned parcel has a positive pressure band or visible outbreak.")} />
        <ModEmpty>{tOr("companionPage.realisticCropRotation.diseaseNote", "Pressure is a prediction for the standing crop, not a confirmed infection. These are last-export readings for tracked parcels, not a complete farm survey or treatment prescription.")}</ModEmpty>
        {disease?.readState === "partial" ? <ModEmpty>{tOr("companionPage.realisticCropRotation.diseasePartial", "Some parcel disease or ownership readings were unavailable; totals are withheld.")}</ModEmpty> : null}
      </Card> : null}
    </ModPage>
  );
}
