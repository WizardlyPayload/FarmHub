import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type WearGroup = { key?: string; wearPercent?: number; quality?: string };
type Service = {
  day?: number; period?: number; meterHours?: number;
  group?: string; quality?: string; quantity?: number;
};
type Implement = {
  farmId?: number; vehicleId?: string; vehicle?: string;
  operatingHours?: number; hoursSinceGrease?: number;
  greaseThresholdHours?: number;
  hoursSinceGeneralService?: number;
  groups?: WearGroup[]; services?: Service[];
};

function groupName(key?: string) {
  if (key === "contacto") return tOr("companionPage.implementMaintenance.contact", "Contact");
  if (key === "transmision") return tOr("companionPage.implementMaintenance.transmission", "Transmission");
  if (key === "hidraulica") return tOr("companionPage.implementMaintenance.hydraulics", "Hydraulics");
  if (key === "neumaticos") return tOr("companionPage.implementMaintenance.tyres", "Tyres");
  return key || "—";
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Implement>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const serviceRows = rows.flatMap((row) => asList<Service>(row.services).map((service, index) => ({
    key: `${row.vehicleId || "implement"}:service:${index}`,
    cells: {
      vehicle: row.vehicle || row.vehicleId || "—",
      date: `${tOr("companionPage.implementMaintenance.day", "Day")} ${formatNumber(service.day, 0)} · ${tOr("companionPage.implementMaintenance.period", "Period")} ${formatNumber(service.period, 0)}`,
      meter: `${formatNumber(service.meterHours, 0)} h`,
      component: groupName(service.group),
      part: `${service.quality === "generic" ? tOr("companionPage.implementMaintenance.generic", "Generic") : tOr("companionPage.implementMaintenance.original", "Original")} · ${formatNumber(service.quantity, 0)}`,
    },
  })));
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "implements", label: tOr("companionPage.implementMaintenance.implements", "Owned implements with maintenance state"), value: formatNumber(farmData.vehicleCount, 0) },
    { key: "services", label: tOr("companionPage.implementMaintenance.services", "Saved service entries"), value: formatNumber(farmData.serviceCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.implementMaintenance.lead", "Current component wear and completed service entries on implements this farm owns now. Entries may predate purchase, so they are not farm service totals. Native vehicle damage is not added to these wear readings.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.implementMaintenance.wearTitle", "Current implement condition")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.implementMaintenance.implement", "Implement") },
            { key: "hours", label: tOr("companionPage.implementMaintenance.hours", "Operating hours") },
            { key: "wear", label: tOr("companionPage.implementMaintenance.wear", "Component wear") },
            { key: "attention", label: tOr("companionPage.implementMaintenance.attention", "Hours since attention") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || `${index}`,
            cells: {
              vehicle: row.vehicle || row.vehicleId || "—",
              hours: `${formatNumber(row.operatingHours, 2)} h`,
              wear: asList<WearGroup>(row.groups).map((group) =>
                `${groupName(group.key)} ${formatNumber(group.wearPercent, 1)}% (${group.quality === "generic" ? tOr("companionPage.implementMaintenance.generic", "Generic") : tOr("companionPage.implementMaintenance.original", "Original")})`
              ).join(" · ") || "—",
              attention: `${tOr("companionPage.implementMaintenance.grease", "Grease")} ${num(row.greaseThresholdHours) != null
                ? `${formatNumber(row.hoursSinceGrease, 2)} / ${formatNumber(row.greaseThresholdHours, 2)} h`
                : tOr("companionPage.implementMaintenance.noGreaseInterval", "No grease interval")}
                · ${tOr("companionPage.implementMaintenance.generalService", "General service")} ${formatNumber(row.hoursSinceGeneralService, 2)} h`,
            },
          }))}
          empty={tOr("companionPage.implementMaintenance.empty", "No maintained implements are currently owned by this farm.")}
        />
        <p class="fd-economy__muted">{tOr("companionPage.implementMaintenance.greaseThresholdNote",
          "The grease hour threshold helps plan service; storage can make greasing due sooner.")}</p>
      </Card>
      <Card title={tOr("companionPage.implementMaintenance.serviceTitle", "Saved completed services")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.implementMaintenance.implement", "Implement") },
            { key: "date", label: tOr("companionPage.implementMaintenance.gameDate", "Game date") },
            { key: "meter", label: tOr("companionPage.implementMaintenance.meter", "Meter at service") },
            { key: "component", label: tOr("companionPage.implementMaintenance.component", "Component") },
            { key: "part", label: tOr("companionPage.implementMaintenance.parts", "Part quality · quantity") },
          ]}
          rows={serviceRows}
          empty={tOr("companionPage.implementMaintenance.noServices", "No completed service entries are saved on these implements.")}
        />
        {page?.coverage === "partial" || page?.coverage === "truncated" ? (
          <ModEmpty>{tOr("companionPage.implementMaintenance.partial", "Some implement records were unavailable; counts are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
