import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.swathRouter";

type SwathRow = {
  farmId?: number; vehicleId?: string; vehicle?: string;
  workingWidthMetres?: number; swathFillTypeCount?: number; stopsWhenFull?: boolean;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<SwathRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "ready", label: tOr(`${K}.ready`, "AI swath-ready implements"), value: formatNumber(farmData.readyCount, 0) },
    { key: "stop", label: tOr(`${K}.stopWhenFullCount`, "Stop when full"), value: formatNumber(farmData.stopWhenFullCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "Current Swath Router AI pickup capability on owned implements. Readiness does not prove an AI route was run or any swath was collected.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.tableTitle`, "Owned AI swath-ready implements")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr(`${K}.vehicle`, "Implement") },
            { key: "width", label: tOr(`${K}.width`, "Working width (m)") },
            { key: "types", label: tOr(`${K}.types`, "Swath fill types") },
            { key: "full", label: tOr(`${K}.full`, "Stops when full") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || "—",
              width: formatNumber(row.workingWidthMetres, 1),
              types: formatNumber(row.swathFillTypeCount, 0),
              full: row.stopsWhenFull === true ? tOr(`${K}.yes`, "Yes") : tOr(`${K}.no`, "No"),
            },
          }))}
          empty={tOr(`${K}.empty`, "No owned swath implement has a readable AI pickup setup.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only the first owned swath implements are listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Some owned swath setups could not be read.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
