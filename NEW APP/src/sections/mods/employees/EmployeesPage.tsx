import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.employees";

type EmployeeRow = {
  farmId?: number;
  id?: number;
  name?: string;
  role?: string;
  contract?: string;
  temporary?: boolean;
  salary?: number;
  periodHours?: number;
  workedHours?: number;
  totalWorkedHours?: number;
  training?: string;
  trainingHoursRemaining?: number;
  illness?: string;
  illnessHoursRemaining?: number;
};

function status(row: EmployeeRow): string {
  if ((num(row.illnessHoursRemaining) ?? 0) > 0) {
    return `${tOr(`${K}.ill`, "Ill")}: ${formatNumber(row.illnessHoursRemaining, 1)} h`;
  }
  if ((num(row.trainingHoursRemaining) ?? 0) > 0) {
    return `${tOr(`${K}.training`, "Training")}: ${formatNumber(row.trainingHoursRemaining, 1)} h`;
  }
  return tOr(`${K}.noneReported`, "None reported");
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<EmployeeRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "employees", label: tOr(`${K}.staffCount`, "Hired staff"), value: formatNumber(farmData.employeeCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current farm-owned Employees roster and contract terms. Hours are the mod's current-period counters; salary is a term, not proof of payment or completed work.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.tableTitle`, "Staff roster")}>
        <ModTable
          columns={[
            { key: "name", label: tOr(`${K}.name`, "Staff member") },
            { key: "role", label: tOr(`${K}.role`, "Role") },
            { key: "contract", label: tOr(`${K}.contract`, "Contract") },
            { key: "hours", label: tOr(`${K}.hours`, "Hours this period / limit") },
            { key: "salary", label: tOr(`${K}.salary`, "Salary term") },
            { key: "status", label: tOr(`${K}.status`, "Training or illness") },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.id ?? row.name ?? "staff"}-${index}`,
            cells: {
              name: row.name || tOr(`${K}.unnamed`, "Unnamed staff member"),
              role: row.role || "—",
              contract: row.contract || "—",
              hours: num(row.workedHours) == null || num(row.periodHours) == null
                ? "—" : `${formatNumber(row.workedHours, 1)} / ${formatNumber(row.periodHours, 1)} h`,
              salary: num(row.salary) == null ? "—"
                : `${money(num(row.salary)!)} ${row.temporary === true
                  ? tOr(`${K}.prepaid`, "prepaid") : tOr(`${K}.perPeriod`, "per period")}`,
              status: status(row),
            },
          }))}
          empty={tOr(`${K}.empty`, "No staff have been hired for this farm.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only the first staff records are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
