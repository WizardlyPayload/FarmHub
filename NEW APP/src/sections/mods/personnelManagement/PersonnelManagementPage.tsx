import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.personnelManagement";

type StaffRow = {
  farmId?: number; id?: number; name?: string; experience?: number;
  reliability?: number; loyalty?: number; specialization?: string;
  wage?: number; jobsCompleted?: number; totalWorkMinutes?: number;
  busy?: boolean; resignationPending?: boolean; dismissalPending?: boolean;
};

type ApplicantRow = {
  farmId?: number; id?: number; name?: string; experience?: number;
  reliability?: number; loyalty?: number; specialization?: string;
  wage?: number; monthsListed?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<StaffRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const applicants = asList<ApplicantRow>(page?.applicantRows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "staff", label: tOr(`${K}.staff`, "Hired staff"), value: formatNumber(farmData.employeeCount, 0) },
    { key: "applicants", label: tOr(`${K}.applicants`, "Applicants"), value: formatNumber(farmData.applicantCount, 0) },
    { key: "reputation", label: tOr(`${K}.reputation`, "Employer reputation"), value: formatNumber(farmData.employerReputation, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Personnel Management's existing staff and available applicants for this farm. Wages are terms; completed jobs and work minutes are the mod's recorded counters, not a live job audit.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.roster`, "Personnel roster")}>
        <ModTable
          columns={[
            { key: "name", label: tOr(`${K}.name`, "Staff member") },
            { key: "specialization", label: tOr(`${K}.specialization`, "Specialization") },
            { key: "attributes", label: tOr(`${K}.attributes`, "Experience / reliability / loyalty") },
            { key: "work", label: tOr(`${K}.work`, "Jobs / recorded work") },
            { key: "wage", label: tOr(`${K}.wage`, "Monthly wage term"), align: "end" },
            { key: "status", label: tOr(`${K}.status`, "Status") },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.id ?? row.name ?? "staff"}-${index}`,
            cells: {
              name: row.name || tOr(`${K}.unnamed`, "Unnamed staff member"),
              specialization: row.specialization || "—",
              attributes: [row.experience, row.reliability, row.loyalty]
                .map((v) => num(v) == null ? "—" : formatNumber(v, 0)).join(" / "),
              work: num(row.jobsCompleted) == null && num(row.totalWorkMinutes) == null
                ? "—" : `${formatNumber(row.jobsCompleted, 0)} / ${formatNumber(row.totalWorkMinutes, 0)} min`,
              wage: num(row.wage) == null ? "—" : money(row.wage),
              status: row.dismissalPending ? tOr(`${K}.dismissal`, "Dismissal pending")
                : row.resignationPending ? tOr(`${K}.resignation`, "Resignation pending")
                : row.busy ? tOr(`${K}.busy`, "Busy") : tOr(`${K}.noJob`, "No active job recorded"),
            },
          }))}
          empty={tOr(`${K}.empty`, "No staff are recorded for this farm.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the personnel register was scanned.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Invalid or foreign personnel records were withheld.")}</ModEmpty> : null}
      </Card>
      <Card title={tOr(`${K}.applicantRoster`, "Available applicants")}>
        <ModTable
          columns={[
            { key: "name", label: tOr(`${K}.name`, "Applicant") },
            { key: "specialization", label: tOr(`${K}.specialization`, "Specialization") },
            { key: "attributes", label: tOr(`${K}.attributes`, "Experience / reliability / loyalty") },
            { key: "wage", label: tOr(`${K}.applicantWage`, "Requested monthly wage"), align: "end" },
            { key: "listed", label: tOr(`${K}.monthsListed`, "Months listed"), align: "end" },
          ]}
          rows={applicants.map((row, index) => ({
            key: `${row.id ?? row.name ?? "applicant"}-${index}`,
            cells: {
              name: row.name || tOr(`${K}.unnamedApplicant`, "Unnamed applicant"),
              specialization: row.specialization || "—",
              attributes: [row.experience, row.reliability, row.loyalty]
                .map((v) => num(v) == null ? "—" : formatNumber(v, 0)).join(" / "),
              wage: num(row.wage) == null ? "—" : money(row.wage),
              listed: num(row.monthsListed) == null ? "—" : formatNumber(row.monthsListed, 0),
            },
          }))}
          empty={tOr(`${K}.noApplicants`, "No applicants are listed for this farm.")}
        />
      </Card>
    </ModPage>
  );
}
