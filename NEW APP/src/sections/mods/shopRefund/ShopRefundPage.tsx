import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.shopRefund";

type Candidate = {
  farmId?: number; vehicleId?: string; vehicle?: string;
  recordedPriceBasis?: number; operatingMinutesUsed?: number;
  operatingMinutesLeft?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<Candidate>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "candidates", label: tOr(`${K}.candidates`, "Tracked current vehicles"), value: formatNumber(farmData.candidateCount, 0) },
    { key: "withheld", label: tOr(`${K}.withheld`, "Records withheld"), value: formatNumber(farmData.withheldCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Shop Refund's tracked purchase records for this farm's currently owned vehicles within the operating-time and purchase-month window. The recorded price is a basis for the mod's refund calculation, not a guaranteed payout. Dealer location, condition and sale context must still qualify.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Recorded refund candidates")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr(`${K}.vehicle`, "Current vehicle") },
            { key: "used", label: tOr(`${K}.used`, "Operating minutes used"), align: "end" },
            { key: "left", label: tOr(`${K}.left`, "Operating minutes left"), align: "end" },
            { key: "basis", label: tOr(`${K}.basis`, "Recorded price basis"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || "—",
              used: formatNumber(row.operatingMinutesUsed, 1),
              left: formatNumber(row.operatingMinutesLeft, 0),
              basis: money(row.recordedPriceBasis),
            },
          }))}
          empty={tOr(`${K}.empty`, "No current Shop Refund candidate is recorded for this farm.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only some recorded purchases or owned vehicles were scanned.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Some records could not be linked to a current, in-window farm vehicle and were withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
