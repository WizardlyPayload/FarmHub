import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.transportCompany";

type Contract = {
  farmId?: number; id?: string; source?: string; destination?: string;
  fillTypeIndex?: number; contractType?: number; amount?: number; delivered?: number; reward?: number;
  deadline?: number; hiredDriver?: boolean;
};
type TruckBook = {
  farmId?: number; vehicleId?: string; name?: string; distanceKm?: number;
  revenue?: number; fuelCost?: number; otherCost?: number; jobsDone?: number;
};
type Driver = {
  farmId?: number; id?: string; name?: string; weeklyWage?: number;
  jobsDone?: number; assignedVehicleId?: string;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const contracts = asList<Contract>(page?.contracts).filter((row) => num(row.farmId) === farmId);
  const trucks = asList<TruckBook>(page?.truckBooks).filter((row) => num(row.farmId) === farmId);
  const drivers = asList<Driver>(page?.drivers).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "jobs", label: tOr(`${K}.jobs`, "Completed freight jobs"), value: formatNumber(farmData.jobs, 0) },
    { key: "revenue", label: tOr(`${K}.revenue`, "Recorded revenue"), value: money(farmData.revenue) },
    { key: "wages", label: tOr(`${K}.wages`, "Recorded driver wages"), value: money(farmData.driverWages) },
    { key: "accepted", label: tOr(`${K}.accepted`, "Accepted jobs"), value: formatNumber(farmData.acceptedCount, 0) },
    { key: "hq", label: tOr(`${K}.hq`, "HQ level"), value: formatNumber(farmData.hqLevel, 0) },
    { key: "reputation", label: tOr(`${K}.reputation`, "Reputation"), value: formatNumber(farmData.reputation, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Transport Company's recorded business for this farm. Accepted freight terms are obligations, not earned revenue; truck books are historical and can include sold vehicles.")}>
      <ModStatTiles tiles={tiles} />
      {farmData?.archived === true ? <ModEmpty>{tOr(`${K}.archived`, "Company archived: the last HQ was sold, so business activity is paused. The books remain as history.")}</ModEmpty> : null}
      {farmData && farmData.archived !== true && farmData.active === false ? <ModEmpty>{tOr(`${K}.inactive`, "Company activity is paused by its settings; the books remain readable.")}</ModEmpty> : null}
      <Card title={tOr(`${K}.contractsTitle`, "Accepted freight jobs")}>
        <ModTable
          columns={[
            { key: "route", label: tOr(`${K}.route`, "Route") },
            { key: "product", label: tOr(`${K}.product`, "Fill type") },
            { key: "progress", label: tOr(`${K}.progress`, "Delivered / target"), align: "end" },
            { key: "reward", label: tOr(`${K}.reward`, "Reward on completion"), align: "end" },
            { key: "deadline", label: tOr(`${K}.deadline`, "Deadline day"), align: "end" },
          ]}
          rows={contracts.map((row, index) => ({
            key: row.id || String(index),
            cells: {
              route: `${row.source || "—"} → ${row.destination || "—"}`,
              product: num(row.fillTypeIndex) === null ? "—" : `#${formatNumber(row.fillTypeIndex, 0)}`,
              progress: `${formatNumber(row.delivered, 0)} / ${formatNumber(row.amount, 0)} ${row.contractType === 2 ? tOr(`${K}.pallets`, "pallets") : "L"}`,
              reward: money(row.reward),
              deadline: formatNumber(row.deadline, 1),
            },
          }))}
          empty={tOr(`${K}.contractsEmpty`, "No accepted freight job is recorded for this farm.")}
        />
      </Card>
      <Card title={tOr(`${K}.trucksTitle`, "Truck books, including sold vehicles")}>
        <ModTable
          columns={[
            { key: "truck", label: tOr(`${K}.truck`, "Recorded truck") },
            { key: "distance", label: tOr(`${K}.distance`, "Distance"), align: "end" },
            { key: "jobs", label: tOr(`${K}.jobs`, "Completed freight jobs"), align: "end" },
            { key: "revenue", label: tOr(`${K}.revenue`, "Recorded revenue"), align: "end" },
            { key: "fuel", label: tOr(`${K}.fuel`, "Fuel cost"), align: "end" },
            { key: "other", label: tOr(`${K}.other`, "Other cost"), align: "end" },
          ]}
          rows={trucks.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              truck: row.name || row.vehicleId || "—",
              distance: num(row.distanceKm) === null ? "—" : `${formatNumber(row.distanceKm, 1)} km`,
              jobs: formatNumber(row.jobsDone, 0),
              revenue: money(row.revenue),
              fuel: money(row.fuelCost),
              other: money(row.otherCost),
            },
          }))}
          empty={tOr(`${K}.trucksEmpty`, "No truck book is recorded for this farm.")}
        />
      </Card>
      <Card title={tOr(`${K}.driversTitle`, "Hired drivers")}>
        <ModTable
          columns={[
            { key: "driver", label: tOr(`${K}.driver`, "Driver") },
            { key: "wage", label: tOr(`${K}.wage`, "Base weekly wage"), align: "end" },
            { key: "jobs", label: tOr(`${K}.jobs`, "Completed freight jobs"), align: "end" },
            { key: "assignment", label: tOr(`${K}.assignment`, "Assigned truck ID") },
          ]}
          rows={drivers.map((row, index) => ({
            key: row.id || String(index),
            cells: { driver: row.name || "—", wage: money(row.weeklyWage), jobs: formatNumber(row.jobsDone, 0), assignment: row.assignedVehicleId || "—" },
          }))}
          empty={tOr(`${K}.driversEmpty`, "No hired driver is recorded for this farm.")}
        />
      </Card>
      {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the recorded company books are shown.")}</ModEmpty> : null}
      {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Some company records could not be read.")}</ModEmpty> : null}
    </ModPage>
  );
}
