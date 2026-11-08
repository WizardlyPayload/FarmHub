import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type AutoloadRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  material?: string;
  materialTitle?: string;
  container?: string;
  loadside?: string;
  tipside?: string;
  loadingFilter?: boolean;
  autoCollectionMode?: boolean;
  horizontalLoading?: boolean;
};

function containerLabel(value?: string) {
  const labels: Record<string, [string, string]> = {
    ALL: ["all", "All"],
    EURO_PALLET: ["euroPallet", "Euro pallet"],
    BIGBAG_PALLET: ["bigbagPallet", "Big bag pallet"],
    LIQUID_TANK: ["liquidTank", "Liquid tank"],
    BIGBAG: ["bigbag", "Big bag"],
    BALE: ["bale", "Bale"],
    LOGS: ["logs", "Logs"],
  };
  const label = value ? labels[value] : undefined;
  return label ? tOr(`companionPage.universalAutoload.container.${label[0]}`, label[1]) : value || "—";
}

function sideLabel(value?: string) {
  const labels: Record<string, string> = {
    left: "Left", right: "Right", both: "Both", rear: "Rear", front: "Front", none: "None",
  };
  return value && labels[value]
    ? tOr(`companionPage.universalAutoload.side.${value}`, labels[value])
    : value || "—";
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<AutoloadRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const complete = page?.coverage === "complete";
  const on = tOr("companionPage.universalAutoload.on", "On");
  const off = tOr("companionPage.universalAutoload.off", "Off");
  const tiles: ModStatTile[] = farmData && complete ? [
    { key: "vehicles", label: tOr("companionPage.universalAutoload.vehicles", "Owned autoload vehicles"), value: formatNumber(farmData.vehicleCount, 0) },
    { key: "filtered", label: tOr("companionPage.universalAutoload.filtered", "Load filters on"), value: formatNumber(farmData.filteredCount, 0) },
    { key: "collection", label: tOr("companionPage.universalAutoload.collection", "Collection mode on"), value: formatNumber(farmData.collectionModeCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.universalAutoload.lead", "Current loading choices on this farm's autoload vehicles. These settings do not prove a load was completed or add to stored inventory.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.universalAutoload.table", "Owned autoload vehicles")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.universalAutoload.vehicle", "Vehicle") },
            { key: "material", label: tOr("companionPage.universalAutoload.material", "Material") },
            { key: "container", label: tOr("companionPage.universalAutoload.container", "Container") },
            { key: "loadside", label: tOr("companionPage.universalAutoload.loadside", "Load side") },
            { key: "tipside", label: tOr("companionPage.universalAutoload.tipside", "Unload side") },
            { key: "filter", label: tOr("companionPage.universalAutoload.filter", "Filter") },
            { key: "collectionMode", label: tOr("companionPage.universalAutoload.collectionMode", "Collection") },
            { key: "horizontal", label: tOr("companionPage.universalAutoload.horizontal", "Horizontal") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || "—",
              material: row.materialTitle || row.material || "—",
              container: containerLabel(row.container),
              loadside: sideLabel(row.loadside),
              tipside: sideLabel(row.tipside),
              filter: row.loadingFilter ? on : off,
              collectionMode: row.autoCollectionMode ? on : off,
              horizontal: row.horizontalLoading ? on : off,
            },
          }))}
          empty={tOr("companionPage.universalAutoload.empty", "No readable autoload vehicle is currently owned by this farm.")}
        />
        {page?.coverage === "partial" || page?.coverage === "truncated" ? (
          <ModEmpty>{tOr("companionPage.universalAutoload.partial", "Some owned autoload settings were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
