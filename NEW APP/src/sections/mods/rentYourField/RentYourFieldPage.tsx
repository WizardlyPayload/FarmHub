import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.rentYourField";

type Rental = {
  farmId?: number; farmlandId?: number; elapsedMonths?: number;
  minimumMonths?: number; remainingMinimumMonths?: number;
  projectedMonthlyRent?: number; estimatedTerminationPenalty?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<Rental>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "count", label: tOr(`${K}.count`, "Active rented-out farmlands"), value: formatNumber(farmData.activeCount, 0) },
    { key: "projection", label: tOr(`${K}.projection`, "Projected monthly rent"), value: money(farmData.projectedMonthlyRent) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Active Rent Your Field agreements recorded for this farm. The mod transfers rented land to the game's no-owner state while preserving the farm's rental claim. Monthly rent and early-termination figures are current estimates, not payments received or charged.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Rented-out farmland agreements")}>
        <ModTable
          columns={[
            { key: "land", label: tOr(`${K}.land`, "Farmland") },
            { key: "elapsed", label: tOr(`${K}.elapsed`, "Months elapsed"), align: "end" },
            { key: "minimum", label: tOr(`${K}.minimum`, "Minimum remaining"), align: "end" },
            { key: "rent", label: tOr(`${K}.rent`, "Projected monthly rent"), align: "end" },
            { key: "penalty", label: tOr(`${K}.penalty`, "Estimated termination penalty"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: String(row.farmlandId ?? index),
            cells: {
              land: `#${formatNumber(row.farmlandId, 0)}`,
              elapsed: formatNumber(row.elapsedMonths, 0),
              minimum: formatNumber(row.remainingMinimumMonths, 0),
              rent: money(row.projectedMonthlyRent),
              penalty: money(row.estimatedTerminationPenalty),
            },
          }))}
          empty={tOr(`${K}.empty`, "No active Rent Your Field agreement is confirmed for this farm. The mod does not expose a load-complete flag for an empty register.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only some rental agreements were scanned.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Some agreements did not match a current unowned farmland record and were withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
