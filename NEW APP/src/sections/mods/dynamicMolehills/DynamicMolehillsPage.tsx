import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.dynamicMolehills";
type LandRow = {
  farmlandId?: number;
  name?: string;
  active?: number;
  compressed?: number;
  smoothed?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData } = useCompanionPage(entry.key);
  const rows = asList<LandRow>(page?.farmlands);
  const tiles: ModStatTile[] = farmData ? [
    { key: "current", label: tOr(`${K}.current`, "Current owned mounds"), value: formatNumber(farmData.current, 0) },
    { key: "active", label: tOr(`${K}.active`, "Active"), value: formatNumber(farmData.active, 0) },
    { key: "compressed", label: tOr(`${K}.compressed`, "Compressed"), value: formatNumber(farmData.compressed, 0) },
    { key: "smoothed", label: tOr(`${K}.smoothed`, "Smoothed"), value: formatNumber(farmData.smoothed, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "Current molehill states on land owned by this farm. Ownership is checked at export time. Removed mounds and mower damage are not recorded.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.tableTitle`, "Mounds by owned farmland")}>
        <ModTable
          columns={[
            { key: "land", label: tOr(`${K}.land`, "Farmland") },
            { key: "active", label: tOr(`${K}.active`, "Active"), align: "end" },
            { key: "compressed", label: tOr(`${K}.compressed`, "Compressed"), align: "end" },
            { key: "smoothed", label: tOr(`${K}.smoothed`, "Smoothed"), align: "end" },
          ]}
          rows={rows.map((row) => ({
            key: String(row.farmlandId ?? row.name ?? ""),
            cells: {
              land: row.name || (row.farmlandId == null ? "—" : String(row.farmlandId)),
              active: formatNumber(row.active, 0),
              compressed: formatNumber(row.compressed, 0),
              smoothed: formatNumber(row.smoothed, 0),
            },
          }))}
          empty={tOr(`${K}.empty`, "No current mounds were found on this farm's land.")}
        />
        {page?.coverage === "sampled" ? <ModEmpty>{tOr(`${K}.sampled`,
          "The scan reached its safety limit; these counts cover only the sampled mounds.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`,
          "Some mounds could not be matched to current farmland ownership.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
