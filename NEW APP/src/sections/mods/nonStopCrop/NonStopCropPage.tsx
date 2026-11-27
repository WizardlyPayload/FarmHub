import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Route = {
  farmId?: number; vehicleId?: string; vehicle?: string; enabled?: boolean;
  destinationType?: string; destinationStatus?: string; destination?: string;
};

function typeName(type?: string) {
  if (type === "silo") return tOr("companionPage.nonStopCrop.silo", "Silo");
  if (type === "bunkerSilo") return tOr("companionPage.nonStopCrop.bunker", "Bunker silo");
  if (type === "productionPoint") return tOr("companionPage.nonStopCrop.production", "Production");
  if (type === "husbandry") return tOr("companionPage.nonStopCrop.husbandry", "Animal husbandry");
  if (type === "vehicle") return tOr("companionPage.nonStopCrop.vehicleType", "Vehicle");
  return "—";
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Route>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "sources", label: tOr("companionPage.nonStopCrop.sources", "Owned vehicles with routing state"), value: formatNumber(farmData.sourceCount, 0) },
    { key: "enabled", label: tOr("companionPage.nonStopCrop.enabledCount", "Routing enabled"), value: formatNumber(farmData.enabledCount, 0) },
    { key: "targets", label: tOr("companionPage.nonStopCrop.targets", "Selections resolving to owned targets"), value: formatNumber(farmData.ownedTargetCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.nonStopCrop.lead", "Saved Non-Stop Crop routing choices on vehicles this farm owns now. A selected destination does not prove it can accept the current crop or that any transfer occurred. Missing or foreign targets are not identified.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.nonStopCrop.tableTitle", "Saved vehicle routes")}>
        <ModTable
          columns={[
            { key: "source", label: tOr("companionPage.nonStopCrop.source", "Source vehicle") },
            { key: "mode", label: tOr("companionPage.nonStopCrop.mode", "Routing") },
            { key: "target", label: tOr("companionPage.nonStopCrop.target", "Selected target") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || `${index}`,
            cells: {
              source: row.vehicle || row.vehicleId || "—",
              mode: row.enabled ? tOr("companionPage.nonStopCrop.enabled", "Enabled") : tOr("companionPage.nonStopCrop.disabled", "Disabled"),
              target: row.destinationStatus === "owned"
                ? `${typeName(row.destinationType)} · ${row.destination || tOr("companionPage.nonStopCrop.owned", "Owned target")}`
                : row.destinationStatus === "unavailable"
                  ? tOr("companionPage.nonStopCrop.unavailable", "Saved target unavailable to this farm")
                  : tOr("companionPage.nonStopCrop.none", "No target selected"),
            },
          }))}
          empty={tOr("companionPage.nonStopCrop.empty", "No Non-Stop Crop routing state on this farm's current vehicles.")}
        />
        {page?.coverage === "partial" || page?.coverage === "truncated" ? (
          <ModEmpty>{tOr("companionPage.nonStopCrop.partial", "Some saved routes were unavailable; counts are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
