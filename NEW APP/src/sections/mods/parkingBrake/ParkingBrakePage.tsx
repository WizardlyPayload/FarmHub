import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.parkingBrake";
type Row = {
  farmId?: number; vehicleId?: string; vehicle?: string;
  brakeInstalled?: boolean; brakeEngaged?: boolean;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Row>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "vehicles", label: tOr(`${K}.vehicles`, "Supported owned vehicles"), value: formatNumber(farmData.supportedVehicleCount, 0) },
    { key: "installed", label: tOr(`${K}.installed`, "Parking brakes installed"), value: formatNumber(farmData.installedBrakeCount, 0) },
    { key: "engaged", label: tOr(`${K}.engaged`, "Brakes engaged"), value: formatNumber(farmData.engagedBrakeCount, 0) },
  ] : [];
  const yesNo = (value: boolean | undefined) => value === undefined ? "—"
    : value ? tOr(`${K}.yes`, "Yes") : tOr(`${K}.no`, "No");
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current Parking Brake state on your vehicles. Engaged is a mod state, not proof that the vehicle was held by brake physics or parked safely.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Vehicle parking brakes")}>
        <ModTable columns={[
          { key: "vehicle", label: tOr(`${K}.vehicle`, "Vehicle") },
          { key: "installed", label: tOr(`${K}.installedColumn`, "Installed") },
          { key: "engaged", label: tOr(`${K}.engagedColumn`, "Engaged") },
        ]} rows={rows.map((row, index) => ({
          key: row.vehicleId || String(index),
          cells: { vehicle: row.vehicle || row.vehicleId || "—",
            installed: yesNo(row.brakeInstalled), engaged: yesNo(row.brakeEngaged) },
        }))} empty={tOr(`${K}.empty`, "No owned vehicle has readable Parking Brake state.")} />
        {page?.coverage === "partial" || page?.coverage === "truncated" ? (
          <ModEmpty>{tOr(`${K}.partial`, "Some brake readings were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
