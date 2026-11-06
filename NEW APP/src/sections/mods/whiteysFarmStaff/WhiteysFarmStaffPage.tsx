import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.whiteysFarmStaff";

type StaffRow = {
  farmId?: number;
  name?: string;
  skill?: number;
  experience?: number;
  morale?: number;
  assignedJob?: string;
  pendingCourse?: string;
  absence?: string;
  absenceDaysRemaining?: number;
  busy?: boolean;
  available?: boolean;
  licenceCount?: number;
};

function status(row: StaffRow): string {
  if (row.absence && row.absence !== "none" && (num(row.absenceDaysRemaining) ?? 0) > 0) return row.absence;
  if (row.busy === true) return row.assignedJob && row.assignedJob !== "none"
    ? row.assignedJob : tOr(`${K}.busy`, "Busy");
  if (row.pendingCourse && row.pendingCourse !== "none") return tOr(`${K}.course`, "Course pending");
  return row.available === true
    ? tOr(`${K}.available`, "Available")
    : tOr(`${K}.unavailable`, "Not available");
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<StaffRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "employees", label: tOr(`${K}.employees`, "Hired staff"), value: formatNumber(farmData.employeeCount, 0) },
    { key: "available", label: tOr(`${K}.availableCount`, "Available now"), value: formatNumber(farmData.availableCount, 0) },
    { key: "reputation", label: tOr(`${K}.reputation`, "Staff reputation points"), value: formatNumber(farmData.reputationPoints, 0) },
    { key: "unpaid", label: tOr(`${K}.unpaid`, "Unpaid wages"), value: num(farmData.unpaidWages) == null ? "—" : money(num(farmData.unpaidWages)!) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Hired staff and their current status from this single-player save. The roster is save-local; this page does not record work completed or wages already paid.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.tableTitle`, "Staff roster")}>
        <ModTable
          columns={[
            { key: "name", label: tOr(`${K}.name`, "Staff member") },
            { key: "skill", label: tOr(`${K}.skill`, "Skill") },
            { key: "morale", label: tOr(`${K}.morale`, "Morale") },
            { key: "licences", label: tOr(`${K}.licences`, "Licences") },
            { key: "status", label: tOr(`${K}.status`, "Status") },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.name || "staff"}-${index}`,
            cells: {
              name: row.name || tOr(`${K}.unnamed`, "Unnamed staff member"),
              skill: num(row.skill) == null ? "—" : formatNumber(row.skill, 0),
              morale: num(row.morale) == null ? "—" : `${formatNumber(row.morale, 0)}%`,
              licences: num(row.licenceCount) == null ? "—" : formatNumber(row.licenceCount, 0),
              status: status(row),
            },
          }))}
          empty={tOr(`${K}.empty`, "No staff have been hired in this save.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only the first hired staff are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
