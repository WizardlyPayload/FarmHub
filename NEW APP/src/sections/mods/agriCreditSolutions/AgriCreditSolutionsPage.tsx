import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.agriCreditSolutions";

type Agreement = {
  farmId?: number; id?: string; building?: string;
  termMonths?: number; paymentsMade?: number; deposit?: number;
  finalPayment?: number; scheduledDue?: number; payoffAmount?: number;
  latePaymentCount?: number; collectionsActive?: boolean;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<Agreement>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "linked", label: tOr(`${K}.linked`, "Owned buildings financed"), value: formatNumber(farmData.linkedCount, 0) },
    { key: "unlinked", label: tOr(`${K}.unlinked`, "Unlinked farm agreements"), value: formatNumber(farmData.unlinkedCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "AgriCredit's recorded building finance for this farm. Each row is linked to a building still owned by the farm. The payoff amount includes applicable fees; it is not a payment already made.")}>
      <ModStatTiles tiles={tiles} />
      {num(farmData?.unlinkedCount) !== null && Number(farmData?.unlinkedCount) > 0 ? (
        <ModEmpty>{tOr(`${K}.unlinkedNote`, "Some farm agreements could not be linked to a currently owned building and are withheld from this table.")}</ModEmpty>
      ) : null}
      <Card title={tOr(`${K}.title`, "Building finance agreements")}>
        <ModTable
          columns={[
            { key: "building", label: tOr(`${K}.building`, "Owned building") },
            { key: "term", label: tOr(`${K}.term`, "Payments made / term"), align: "end" },
            { key: "deposit", label: tOr(`${K}.deposit`, "Deposit paid"), align: "end" },
            { key: "due", label: tOr(`${K}.due`, "Next scheduled due"), align: "end" },
            { key: "payoff", label: tOr(`${K}.payoff`, "Payoff now"), align: "end" },
            { key: "status", label: tOr(`${K}.status`, "Status") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.id || String(index),
            cells: {
              building: row.building || "—",
              term: `${formatNumber(row.paymentsMade, 0)} / ${formatNumber(row.termMonths, 0)}`,
              deposit: money(row.deposit),
              due: row.collectionsActive ? "—" : money(row.scheduledDue),
              payoff: money(row.payoffAmount),
              status: row.collectionsActive
                ? tOr(`${K}.collections`, "In collections")
                : num(row.latePaymentCount) !== null && Number(row.latePaymentCount) > 0
                  ? tOr(`${K}.late`, "Late payments")
                  : tOr(`${K}.current`, "Current"),
            },
          }))}
          empty={tOr(`${K}.empty`, "No linked AgriCredit building agreement is recorded for this farm.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only some agreements or buildings were scanned.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Some farm agreement records could not be read or linked.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
