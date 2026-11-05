import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import { formatRfMoney } from "@/lib/realisticFarming/economy";
import { useUnitDisplay } from "@/lib/fill-unit-mode";
import { saveProfileFromUnitDisplay } from "@/lib/profile-display";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type MechanicalRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  serviceLevel?: number;
  conditionLevel?: number;
  state?: string;
  breakdownCount?: number;
  logCount?: number;
  lastLogType?: string;
  lastLogPrice?: number;
  lastLogCompleted?: boolean;
};

function percent(value: number | undefined): string {
  const fraction = num(value);
  return fraction === null ? "—" : `${formatNumber(fraction * 100, 0)}%`;
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const profile = saveProfileFromUnitDisplay(useUnitDisplay());
  const rows = asList<MechanicalRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "vehicles", label: tOr("companionPage.realisticMechanicalSystems.vehicles", "Machines with readings"), value: formatNumber(farmData.vehicleCount, 0) },
    { key: "breakdowns", label: tOr("companionPage.realisticMechanicalSystems.breakdowns", "Machines with breakdowns"), value: formatNumber(farmData.breakdownVehicleCount, 0) },
    { key: "logs", label: tOr("companionPage.realisticMechanicalSystems.logs", "Machines with log entries"), value: formatNumber(farmData.loggedVehicleCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.realisticMechanicalSystems.lead", "Read the current maintenance state of your machines. Log prices are records, not proof of payment.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.realisticMechanicalSystems.tableTitle", "Mechanical condition by machine")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.realisticMechanicalSystems.vehicle", "Machine") },
            { key: "condition", label: tOr("companionPage.realisticMechanicalSystems.condition", "Condition"), align: "end" },
            { key: "service", label: tOr("companionPage.realisticMechanicalSystems.service", "Service"), align: "end" },
            { key: "breakdowns", label: tOr("companionPage.realisticMechanicalSystems.breakdownsShort", "Breakdowns"), align: "end" },
            { key: "log", label: tOr("companionPage.realisticMechanicalSystems.lastLog", "Last log entry") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            tone: (num(row.breakdownCount) ?? 0) > 0 ? "warn" as const : undefined,
            cells: {
              vehicle: row.vehicle || row.vehicleId || "—",
              condition: percent(row.conditionLevel),
              service: percent(row.serviceLevel),
              breakdowns: formatNumber(row.breakdownCount, 0),
              log: row.lastLogType
                ? `${row.lastLogType.replace(/[_-]+/g, " ")} · ${row.lastLogCompleted === true ? tOr("companionPage.realisticMechanicalSystems.completed", "Completed") : row.lastLogCompleted === false ? tOr("companionPage.realisticMechanicalSystems.open", "Open") : "—"} · ${row.lastLogPrice != null ? formatRfMoney(row.lastLogPrice, profile) : "—"}`
                : "—",
            },
          }))}
          empty={tOr("companionPage.realisticMechanicalSystems.empty", "No owned machine has a captured mechanical reading yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.realisticMechanicalSystems.truncated", "Only the first machines are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
