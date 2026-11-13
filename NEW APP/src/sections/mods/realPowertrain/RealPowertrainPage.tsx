import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.realPowertrain";
type Vehicle = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  profile?: string;
  range?: number;
  rangeCount?: number;
  strategy?: number;
  ramp?: number;
  loadLimitPercent?: number;
  handThrottleRpm?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Vehicle>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "cvt", label: tOr(`${K}.count`, "Owned CVT powertrains"), value: formatNumber(farmData.cvtVehicleCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current Real Powertrain CVT settings on this farm's owned vehicles. These are controls, not measured output, fuel use, wear or work history. Other vehicles and profile-wide module settings are outside this reading.")}>
      <ModStatTiles tiles={tiles} />
      {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Some CVT control states could not be verified; the count is withheld.")}</ModEmpty> : null}
      <Card title={tOr(`${K}.tableTitle`, "Owned vehicle CVT settings")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr(`${K}.vehicle`, "Vehicle") },
            { key: "profile", label: tOr(`${K}.profile`, "Profile") },
            { key: "range", label: tOr(`${K}.range`, "Range") },
            { key: "strategy", label: tOr(`${K}.strategy`, "Strategy") },
            { key: "ramp", label: tOr(`${K}.ramp`, "Ramp") },
            { key: "limit", label: tOr(`${K}.limit`, "Load limit") },
            { key: "throttle", label: tOr(`${K}.throttle`, "Hand throttle") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || row.vehicleId || "—",
              profile: row.profile || "—",
              range: `${formatNumber(row.range, 0)} / ${formatNumber(row.rangeCount, 0)}`,
              strategy: row.strategy === 2 ? tOr(`${K}.power`, "Power") : tOr(`${K}.auto`, "Auto"),
              ramp: formatNumber(row.ramp, 0),
              limit: `${formatNumber(row.loadLimitPercent, 0)}%`,
              throttle: `${formatNumber(row.handThrottleRpm, 0)} rpm`,
            },
          }))}
          empty={tOr(`${K}.empty`, "No owned vehicle has a readable Real Powertrain CVT setting.")}
        />
      </Card>
    </ModPage>
  );
}
