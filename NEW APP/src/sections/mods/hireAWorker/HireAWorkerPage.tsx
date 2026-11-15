import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import { formatRfMoney } from "@/lib/realisticFarming/economy";
import { useUnitDisplay } from "@/lib/fill-unit-mode";
import { saveProfileFromUnitDisplay } from "@/lib/profile-display";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type ActiveJob = {
  farmId?: number;
  farmlandId?: number;
  phase?: string;
  phaseIndex?: number;
  phaseCount?: number;
  startCharge?: number;
};
type HistoryEntry = {
  farmId?: number;
  farmlandId?: number;
  farmlandNumber?: string;
  work?: string;
  cost?: number;
  revenue?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const profile = saveProfileFromUnitDisplay(useUnitDisplay());
  const active = asList<ActiveJob>(page?.activeFieldJobs).filter((row) => num(row.farmId) === farmId);
  const history = asList<HistoryEntry>(page?.history).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "active", label: tOr("companionPage.hireAWorker.active", "Active field jobs"), value: formatNumber(farmData.activeFieldJobCount, 0) },
    { key: "history", label: tOr("companionPage.hireAWorker.history", "Recorded jobs"), value: formatNumber(farmData.historyCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.hireAWorker.lead", "Current field jobs and recent history for your farm. The mod records a job cost at the start; the bank debit and later refunds may differ. This is not a net-spending total.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.hireAWorker.active", "Active field jobs")}>
        <ModTable
          columns={[
            { key: "field", label: tOr("companionPage.hireAWorker.field", "Land parcel") },
            { key: "phase", label: tOr("companionPage.hireAWorker.phase", "Current phase") },
            { key: "progress", label: tOr("companionPage.hireAWorker.progress", "Phase") },
            { key: "charge", label: tOr("companionPage.hireAWorker.charge", "Recorded job cost"), align: "end" },
          ]}
          rows={active.map((row, index) => ({
            key: `${row.farmlandId ?? index}`,
            cells: {
              field: row.farmlandId != null ? String(row.farmlandId) : "—",
              phase: row.phase?.replace(/[_-]+/g, " ") || "—",
              progress: row.phaseIndex != null && row.phaseCount != null ? `${row.phaseIndex}/${row.phaseCount}` : "—",
              charge: row.startCharge != null ? formatRfMoney(row.startCharge, profile) : "—",
            },
          }))}
          empty={tOr("companionPage.hireAWorker.activeEmpty", "No active field job is recorded for this farm.")}
        />
      </Card>
      <Card title={tOr("companionPage.hireAWorker.history", "Recorded jobs")}>
        <ModTable
          columns={[
            { key: "field", label: tOr("companionPage.hireAWorker.field", "Land parcel") },
            { key: "work", label: tOr("companionPage.hireAWorker.work", "Recorded work") },
            { key: "cost", label: tOr("companionPage.hireAWorker.cost", "Recorded cost"), align: "end" },
            { key: "revenue", label: tOr("companionPage.hireAWorker.revenue", "Recorded revenue"), align: "end" },
          ]}
          rows={history.map((row, index) => ({
            key: `${row.farmlandId ?? "field"}-${index}`,
            cells: {
              field: row.farmlandNumber || (row.farmlandId != null ? String(row.farmlandId) : "—"),
              work: row.work || "—",
              cost: row.cost != null ? formatRfMoney(row.cost, profile) : "—",
              revenue: row.revenue != null ? formatRfMoney(row.revenue, profile) : "—",
            },
          }))}
          empty={tOr("companionPage.hireAWorker.historyEmpty", "No job history is recorded for this farm.")}
        />
      </Card>
      {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.hireAWorker.truncated", "Only the first jobs and history entries are listed.")}</ModEmpty> : null}
    </ModPage>
  );
}
