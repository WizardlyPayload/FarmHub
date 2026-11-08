import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.workplaceTriggersSites";
type Site = {
  farmId?: number; siteId?: string; name?: string; purpose?: string;
  centreX?: number; centreZ?: number; radiusMetres?: number;
  state?: string; reason?: string;
};
type Shift = {
  farmId?: number; workplace?: string; payAmount?: number;
  paySchedule?: string; timeMultiplier?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const sites = asList<Site>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const candidate = page?.liveShift as Shift | undefined;
  const live: Shift | null = candidate && num(candidate.farmId) === farmId ? candidate : null;
  const tiles: ModStatTile[] = farmData ? [
    { key: "sites", label: tOr(`${K}.siteCount`, "Farm sites"), value: formatNumber(farmData.siteCount, 0) },
    { key: "unavailable", label: tOr(`${K}.unavailableCount`, "Unavailable sites"), value: formatNumber(farmData.unavailableCount, 0) },
    { key: "shift", label: tOr(`${K}.shiftStatus`, "Live shift"), value: live ? tOr(`${K}.active`, "Active") : tOr(`${K}.inactive`, "None") },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Named Workplace Triggers site definitions owned by this farm, plus any current in-session shift. A site is a location marker, not proof of a job, wage or completed work. No unowned sites or shared shift history are included.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.sitesTitle`, "Named farm sites")}>
        <ModTable columns={[
          { key: "name", label: tOr(`${K}.name`, "Site") },
          { key: "purpose", label: tOr(`${K}.purpose`, "Purpose") },
          { key: "location", label: tOr(`${K}.location`, "Centre X / Z") },
          { key: "radius", label: tOr(`${K}.radius`, "Radius"), align: "end" },
          { key: "state", label: tOr(`${K}.state`, "State") },
        ]} rows={sites.map((site, index) => ({ key: site.siteId ?? String(index), cells: {
          name: site.name || "—",
          purpose: site.purpose || "—",
          location: num(site.centreX) == null || num(site.centreZ) == null ? "—" :
            `${formatNumber(site.centreX, 1)} / ${formatNumber(site.centreZ, 1)}`,
          radius: num(site.radiusMetres) == null ? "—" : `${formatNumber(site.radiusMetres, 1)} m`,
          state: site.state === "ACTIVE" ? tOr(`${K}.active`, "Active") :
            site.reason === "MAP_MISMATCH" ? tOr(`${K}.mapMismatch`, "Unavailable: different map") :
              tOr(`${K}.unavailable`, "Unavailable"),
        } }))} empty={tOr(`${K}.empty`, "No named site is recorded for this farm.")} />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the site register was scanned or displayed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Invalid farm site or live-shift values were withheld.")}</ModEmpty> : null}
      </Card>
      {live ? <Card title={tOr(`${K}.liveTitle`, "Current in-session shift")}>
        <ModStatTiles tiles={[
          { key: "workplace", label: tOr(`${K}.workplace`, "Workplace"), value: live.workplace || "—" },
          { key: "schedule", label: tOr(`${K}.schedule`, "Pay schedule"), value: live.paySchedule || "—" },
          { key: "amount", label: tOr(`${K}.payAmount`, "Configured pay amount"),
            value: num(live.payAmount) == null ? "—" : money(live.payAmount!) },
        ]} />
        <ModEmpty>{tOr(`${K}.shiftNote`, "The configured pay amount is a shift term, not earned or paid money. This live entry is not a persisted farm history.")}</ModEmpty>
      </Card> : null}
    </ModPage>
  );
}
