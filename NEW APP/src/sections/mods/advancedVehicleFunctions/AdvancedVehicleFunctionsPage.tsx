import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type VehicleRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  absOn?: boolean;
  asrOn?: boolean;
  espOn?: boolean;
  handbrakeOn?: boolean;
  fourWheelDriveOn?: boolean;
  frontDifferentialLockOn?: boolean;
  rearDifferentialLockOn?: boolean;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<VehicleRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const on = tOr("companionPage.advancedVehicleFunctions.on", "On");
  const off = tOr("companionPage.advancedVehicleFunctions.off", "Off");
  const state = (value: boolean | undefined) =>
    typeof value === "boolean" ? (value ? on : off) : "—";
  const tiles: ModStatTile[] = farmData ? [
    { key: "vehicles", label: tOr("companionPage.advancedVehicleFunctions.vehicles", "Owned AVF vehicles"), value: formatNumber(farmData.vehicleCount, 0) },
    { key: "abs", label: tOr("companionPage.advancedVehicleFunctions.absCount", "ABS on"), value: formatNumber(farmData.absOnCount, 0) },
    { key: "asr", label: tOr("companionPage.advancedVehicleFunctions.asrCount", "Traction control on"), value: formatNumber(farmData.asrOnCount, 0) },
    { key: "esp", label: tOr("companionPage.advancedVehicleFunctions.espCount", "Stability control on"), value: formatNumber(farmData.espOnCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.advancedVehicleFunctions.lead",
      "Current Advanced Vehicle Functions switches on vehicles owned by this farm. These settings do not prove a system activated while driving or record accidents.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.advancedVehicleFunctions.tableTitle", "Owned vehicle controls")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.advancedVehicleFunctions.vehicle", "Vehicle") },
            { key: "abs", label: "ABS" },
            { key: "asr", label: "ASR" },
            { key: "esp", label: "ESP" },
            { key: "handbrake", label: tOr("companionPage.advancedVehicleFunctions.handbrake", "Handbrake") },
            { key: "awd", label: tOr("companionPage.advancedVehicleFunctions.awd", "4WD") },
            { key: "front", label: tOr("companionPage.advancedVehicleFunctions.frontLock", "Front lock") },
            { key: "rear", label: tOr("companionPage.advancedVehicleFunctions.rearLock", "Rear lock") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || "—",
              abs: state(row.absOn),
              asr: state(row.asrOn),
              esp: state(row.espOn),
              handbrake: state(row.handbrakeOn),
              awd: state(row.fourWheelDriveOn),
              front: state(row.frontDifferentialLockOn),
              rear: state(row.rearDifferentialLockOn),
            },
          }))}
          empty={tOr("companionPage.advancedVehicleFunctions.empty", "No owned vehicle has a readable Advanced Vehicle Functions state yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.advancedVehicleFunctions.truncated", "Only the first owned vehicles are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
