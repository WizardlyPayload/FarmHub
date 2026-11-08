import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type BatchRow = {
  farmId?: number;
  batchId?: number;
  daysRemaining?: number;
  outputLitres?: number;
  ready?: boolean;
  organicSafe?: boolean;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<BatchRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "batches", label: tOr("companionPage.soilCompostBatches.batches", "Open batches"), value: formatNumber(farmData.batchCount, 0) },
    { key: "ready", label: tOr("companionPage.soilCompostBatches.ready", "Ready to collect"), value: formatNumber(farmData.readyCount, 0) },
    { key: "output", label: tOr("companionPage.soilCompostBatches.output", "Expected output"), value: `${formatNumber(farmData.expectedOutputLitres, 0)} L` },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.soilCompostBatches.lead", "Farm-owned managed compost batches from Soil & Fertilizer. Expected output is not compost already delivered to storage; collect ready batches in the game.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.soilCompostBatches.table", "Compost batches")}>
        <ModTable
          columns={[
            { key: "batch", label: tOr("companionPage.soilCompostBatches.batch", "Batch") },
            { key: "status", label: tOr("companionPage.soilCompostBatches.status", "Status") },
            { key: "output", label: tOr("companionPage.soilCompostBatches.output", "Expected output"), align: "end" },
            { key: "organic", label: tOr("companionPage.soilCompostBatches.organic", "Organic-safe") },
          ]}
          rows={rows.map((row, index) => ({
            key: String(row.batchId ?? index),
            tone: row.ready ? "ok" as const : undefined,
            cells: {
              batch: `#${formatNumber(row.batchId, 0)}`,
              status: row.ready
                ? tOr("companionPage.soilCompostBatches.ready", "Ready to collect")
                : tOr("companionPage.soilCompostBatches.days", "{{days}} in-game days left", { days: formatNumber(row.daysRemaining, 0) }),
              output: `${formatNumber(row.outputLitres, 0)} L`,
              organic: row.organicSafe
                ? tOr("companionPage.soilCompostBatches.yes", "Yes")
                : tOr("companionPage.soilCompostBatches.no", "No"),
            },
          }))}
          empty={tOr("companionPage.soilCompostBatches.empty", "No open compost batches for this farm.")}
        />
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.soilCompostBatches.partial", "An unreadable owned batch was withheld; totals are unavailable.")}</ModEmpty> : null}
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.soilCompostBatches.truncated", "Only part of the batch register was scanned; totals are unavailable.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
