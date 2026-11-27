import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Pending = {
  farmId?: number; id?: number; crop?: string; liters?: number;
  destination?: string; service?: string; carrier?: string;
  gross?: number; fee?: number; net?: number; etaMinutes?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const pending = asList<Pending>(page?.pending).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "count", label: tOr("companionPage.grainHaulingService.count", "Pending hauls"), value: formatNumber(farmData.pendingCount, 0) },
    { key: "net", label: tOr("companionPage.grainHaulingService.net", "Net awaiting delivery"), value: money(farmData.pendingNet) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.grainHaulingService.lead", "Dispatched loads from this farm's storage that are still awaiting the hauling service's payment. The amounts are pending, not cash already received. ETA is a live real-time estimate.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.grainHaulingService.tableTitle", "Pending grain hauls")}>
        <ModTable
          columns={[
            { key: "crop", label: tOr("companionPage.grainHaulingService.crop", "Crop / load") },
            { key: "destination", label: tOr("companionPage.grainHaulingService.destination", "Destination") },
            { key: "carrier", label: tOr("companionPage.grainHaulingService.carrier", "Carrier / service") },
            { key: "eta", label: tOr("companionPage.grainHaulingService.eta", "ETA (min)") },
            { key: "net", label: tOr("companionPage.grainHaulingService.pendingNet", "Net pending"), align: "end" },
          ]}
          rows={pending.map((row, index) => ({
            key: String(row.id ?? index),
            cells: {
              crop: `${row.crop || "Product"} · ${formatNumber(row.liters, 0)} L`,
              destination: row.destination || "—",
              carrier: [row.carrier, row.service].filter(Boolean).join(" / ") || "—",
              eta: formatNumber(row.etaMinutes, 1),
              net: money(row.net),
            },
          }))}
          empty={tOr("companionPage.grainHaulingService.empty", "No dispatched load is awaiting payment for this farm.")}
        />
        <ModEmpty>{tOr("companionPage.grainHaulingService.note", "The service deducts freight from its sale quote, then credits native farm money on delivery. This page does not record completed deliveries or spawn physical trucks.")}</ModEmpty>
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.grainHaulingService.truncated", "Only part of the pending-haul register was scanned; the total is withheld.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.grainHaulingService.partial", "Some pending-haul records were invalid; the total is withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
