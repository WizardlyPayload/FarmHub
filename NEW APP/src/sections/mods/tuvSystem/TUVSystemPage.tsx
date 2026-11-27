import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type TUVRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  result?: number;
  inspectionCount?: number;
  daysRemaining?: number;
  validUntilDay?: number;
  lastCost?: number;
};

function inspection(row: TUVRow): string {
  if (!num(row.inspectionCount)) return tOr("companionPage.tuvSystem.initial", "Initial validity; no inspection recorded");
  switch (row.result) {
    case 1: return tOr("companionPage.tuvSystem.passed", "Passed");
    case 2: return tOr("companionPage.tuvSystem.minor", "Passed with minor defects");
    case 3: return tOr("companionPage.tuvSystem.major", "Major defects");
    case 4: return tOr("companionPage.tuvSystem.unsafe", "Unsafe");
    default: return tOr("companionPage.tuvSystem.none", "No result recorded");
  }
}

function validity(row: TUVRow): string {
  const remaining = num(row.daysRemaining);
  if (remaining === null) {
    const until = num(row.validUntilDay);
    return until !== null && until >= 0
      ? tOr("companionPage.tuvSystem.until", "Until game day {{day}}", { day: formatNumber(until, 0) })
      : "—";
  }
  if (remaining < 0) return tOr("companionPage.tuvSystem.expired", "Expired {{days}} days ago", { days: formatNumber(-remaining, 0) });
  if (remaining === 0) return tOr("companionPage.tuvSystem.today", "Expires today");
  return tOr("companionPage.tuvSystem.remaining", "{{days}} days left", { days: formatNumber(remaining, 0) });
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<TUVRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "vehicles", label: tOr("companionPage.tuvSystem.vehicles", "Vehicles in TUV register"), value: formatNumber(farmData.vehicleCount, 0) },
    { key: "inspected", label: tOr("companionPage.tuvSystem.inspected", "Actually inspected"), value: formatNumber(farmData.inspectedCount, 0) },
    { key: "expired", label: tOr("companionPage.tuvSystem.expiredCount", "Expired"), value: formatNumber(farmData.expiredCount, 0) },
    { key: "failed", label: tOr("companionPage.tuvSystem.failedCount", "Major or unsafe"), value: formatNumber(farmData.failedCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.tuvSystem.lead", "Current TUV validity and recorded inspection results for vehicles this farm owns. A newly assigned validity period has no completed inspection; inspections and repairs happen in the game.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.tuvSystem.tableTitle", "Vehicle TUV records")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.tuvSystem.vehicle", "Vehicle") },
            { key: "inspection", label: tOr("companionPage.tuvSystem.result", "Last inspection result") },
            { key: "validity", label: tOr("companionPage.tuvSystem.validity", "Validity") },
            { key: "count", label: tOr("companionPage.tuvSystem.count", "Inspections"), align: "end" },
            { key: "cost", label: tOr("companionPage.tuvSystem.cost", "Last fee"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            tone: row.result === 3 || row.result === 4 || (num(row.daysRemaining) !== null && num(row.daysRemaining)! < 0)
              ? "warn" as const : undefined,
            cells: {
              vehicle: row.vehicle || "—",
              inspection: inspection(row),
              validity: validity(row),
              count: formatNumber(row.inspectionCount, 0),
              cost: num(row.inspectionCount) && num(row.lastCost) !== null ? money(row.lastCost!) : "—",
            },
          }))}
          empty={tOr("companionPage.tuvSystem.empty", "No TUV records for this farm's current vehicles yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.tuvSystem.truncated", "Only the first vehicles are listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.tuvSystem.partial", "Some vehicle inspection records could not be read.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
