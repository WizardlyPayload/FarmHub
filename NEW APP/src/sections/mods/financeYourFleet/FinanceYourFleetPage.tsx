import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Agreement = {
  farmId?: number;
  id?: string;
  vehicleId?: string;
  vehicle?: string;
  termMonths?: number;
  paymentsMade?: number;
  deposit?: number;
  finalPayment?: number;
  scheduledDue?: number;
  payoffEstimate?: number;
  latePaymentCount?: number;
  recoveryActive?: boolean;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<Agreement>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "agreements", label: tOr("companionPage.financeYourFleet.agreements", "Linked agreements"), value: formatNumber(farmData.agreementCount, 0) },
    { key: "late", label: tOr("companionPage.financeYourFleet.late", "Late agreements"), value: formatNumber(farmData.lateCount, 0) },
    { key: "recovery", label: tOr("companionPage.financeYourFleet.recovery", "In recovery"), value: formatNumber(farmData.recoveryCount, 0) },
    { key: "unlinked", label: tOr("companionPage.financeYourFleet.unlinked", "Unlinked records"), value: formatNumber(farmData.unlinkedCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.financeYourFleet.lead", "Active equipment finance agreements linked to vehicles this farm currently owns. Next due and payoff are the mod's current amounts, not payments already made. Agreements without a current owned vehicle are withheld.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.financeYourFleet.tableTitle", "Equipment finance agreements")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.financeYourFleet.vehicle", "Vehicle") },
            { key: "progress", label: tOr("companionPage.financeYourFleet.progress", "Payments made") },
            { key: "due", label: tOr("companionPage.financeYourFleet.due", "Next scheduled due"), align: "end" },
            { key: "payoff", label: tOr("companionPage.financeYourFleet.payoff", "Payoff estimate"), align: "end" },
            { key: "late", label: tOr("companionPage.financeYourFleet.lateCycles", "Late cycles"), align: "end" },
            { key: "status", label: tOr("companionPage.financeYourFleet.status", "Status") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.id || row.vehicleId || String(index),
            tone: row.recoveryActive || (num(row.latePaymentCount) !== null && num(row.latePaymentCount)! > 0)
              ? "warn" as const : undefined,
            cells: {
              vehicle: row.vehicle || "—",
              progress: tOr("companionPage.financeYourFleet.progressValue", "{{paid}} of {{term}}", {
                paid: formatNumber(row.paymentsMade, 0), term: formatNumber(row.termMonths, 0),
              }),
              due: row.recoveryActive
                ? tOr("companionPage.financeYourFleet.paused", "Payments paused")
                : num(row.scheduledDue) === null ? "—" : money(row.scheduledDue),
              payoff: num(row.payoffEstimate) === null ? "—" : money(row.payoffEstimate),
              late: formatNumber(row.latePaymentCount, 0),
              status: row.recoveryActive
                ? tOr("companionPage.financeYourFleet.inRecovery", "Recovery active")
                : tOr("companionPage.financeYourFleet.active", "Active"),
            },
          }))}
          empty={tOr("companionPage.financeYourFleet.empty", "No active linked equipment finance agreements for this farm.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.financeYourFleet.truncated", "Only some agreements are listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.financeYourFleet.partial", "Some agreements could not be linked to a current vehicle this farm owns.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
