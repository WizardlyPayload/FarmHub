import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type ConnectionRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  attachedTo?: string;
  pto?: boolean;
  hoses?: boolean;
};

function connectionLabel(value: boolean | undefined): string {
  if (value === true) return tOr("companionPage.manualAttach.connected", "Connected");
  if (value === false) return tOr("companionPage.manualAttach.disconnected", "Disconnected");
  return "—";
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<ConnectionRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "implements", label: tOr("companionPage.manualAttach.implements", "Attached implements with hoses or PTO"), value: formatNumber(farmData.implementCount, 0) },
    { key: "connected", label: tOr("companionPage.manualAttach.ready", "Connections complete"), value: formatNumber(farmData.connectedCount, 0) },
    { key: "needs", label: tOr("companionPage.manualAttach.needs", "Needs a connection"), value: formatNumber(farmData.needsConnectionCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.manualAttach.lead", "Live Manual Attach hose and PTO connections on this farm's attached implements. This does not prove that a machine has worked or travelled.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.manualAttach.tableTitle", "Implement connections")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.manualAttach.implement", "Implement") },
            { key: "parent", label: tOr("companionPage.manualAttach.parent", "Attached to") },
            { key: "pto", label: tOr("companionPage.manualAttach.pto", "PTO") },
            { key: "hoses", label: tOr("companionPage.manualAttach.hoses", "Hoses") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || row.vehicleId || "—",
              parent: row.attachedTo || "—",
              pto: connectionLabel(row.pto),
              hoses: connectionLabel(row.hoses),
            },
          }))}
          empty={tOr("companionPage.manualAttach.empty", "No owned attached implement has a Manual Attach connection reading.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.manualAttach.truncated", "Only the first attached implements are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
