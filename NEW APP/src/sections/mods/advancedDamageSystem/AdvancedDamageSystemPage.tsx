import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import { formatRfMoney } from "@/lib/realisticFarming/economy";
import { useUnitDisplay } from "@/lib/fill-unit-mode";
import { saveProfileFromUnitDisplay } from "@/lib/profile-display";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type DamageRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  conditionLevel?: number;
  serviceLevel?: number;
  state?: string;
  breakdownCount?: number;
  lastLogType?: string;
  lastLogPrice?: number;
};

function percent(value: number | undefined): string {
  const fraction = num(value);
  return fraction === null ? "—" : `${formatNumber(fraction * 100, 0)}%`;
}

function stateLabel(value: string | undefined): string {
  if (!value) return "—";
  const names: Record<string, [string, string]> = {
    ads_spec_state_ready: ["vehicles.adsStateReady", "Ready"],
    ads_spec_state_inspection: ["ads_spec_state_inspection", "Inspection"],
    ads_spec_state_maintenance: ["ads_spec_state_maintenance", "Maintenance"],
    ads_spec_state_repair: ["ads_spec_state_repair", "Repair"],
    ads_spec_state_overhaul: ["ads_spec_state_overhaul", "Overhaul"],
    ads_spec_state_broken: ["vehicles.adsStateBroken", "Broken"],
  };
  const known = names[value];
  return known ? tOr(known[0], known[1]) : value.replace(/^ads_spec_state_/, "").replace(/[_-]+/g, " ");
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const profile = saveProfileFromUnitDisplay(useUnitDisplay());
  const rows = asList<DamageRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "vehicles", label: tOr("companionPage.advancedMaintenance.statMachines", "Machines"), value: formatNumber(farmData.vehicleCount, 0) },
    { key: "breakdowns", label: tOr("companionPage.advancedDamageSystem.breakdowns", "Machines with breakdowns"), value: formatNumber(farmData.breakdownVehicleCount, 0) },
    { key: "logs", label: tOr("companionPage.advancedDamageSystem.logs", "Machines with completed maintenance"), value: formatNumber(farmData.loggedVehicleCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.advancedDamageSystem.lead", "Check service condition and breakdowns before using a machine. Maintenance prices are records, not proof of payment.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.advancedDamageSystem.tableTitle", "Advanced damage by machine")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.advancedMaintenance.colMachine", "Machine") },
            { key: "condition", label: tOr("vehicles.colCondition", "Condition"), align: "end" },
            { key: "service", label: tOr("vehicles.adsWsService", "Service"), align: "end" },
            { key: "state", label: tOr("companionPage.advancedDamageSystem.state", "Status") },
            { key: "breakdowns", label: tOr("vehicles.adsBreakdowns", "Active breakdowns"), align: "end" },
            { key: "log", label: tOr("companionPage.advancedDamageSystem.lastLog", "Latest completed maintenance") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            tone: (num(row.breakdownCount) ?? 0) > 0 ? "warn" as const : undefined,
            cells: {
              vehicle: row.vehicle || row.vehicleId || "—",
              condition: percent(row.conditionLevel),
              service: percent(row.serviceLevel),
              state: stateLabel(row.state),
              breakdowns: row.breakdownCount == null ? "—" : formatNumber(row.breakdownCount, 0),
              log: row.lastLogType
                ? `${stateLabel(row.lastLogType)}${row.lastLogPrice != null ? ` · ${formatRfMoney(row.lastLogPrice, profile)}` : ""}`
                : "—",
            },
          }))}
          empty={tOr("companionPage.advancedDamageSystem.empty", "No owned machine has a captured Advanced Damage System reading yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.collisionDamage.truncated", "Only the first machines are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
