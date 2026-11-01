import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Contract = {
  farmId?: number;
  id?: string;
  typeName?: string;
  fieldId?: number;
  offeredReward?: number;
  payout?: number;
  acceptedDay?: number;
  finishedDay?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const active = asList<Contract>(page?.active).filter((row) => num(row.farmId) === farmId);
  const history = asList<Contract>(page?.history).filter((row) => num(row.farmId) === farmId);
  const stats = farmData?.stats && typeof farmData.stats === "object"
    ? farmData.stats as Record<string, unknown>
    : null;
  const tiles: ModStatTile[] = farmData ? [
    { key: "active", label: tOr("companionPage.contractManager.activeCount", "Active contracts"), value: formatNumber(farmData.activeCount, 0) },
    { key: "completed", label: tOr("companionPage.contractManager.completed", "Completed"), value: formatNumber(stats?.completed, 0) },
    { key: "failed", label: tOr("companionPage.contractManager.failed", "Failed"), value: formatNumber(stats?.failed, 0) },
    { key: "earned", label: tOr("companionPage.contractManager.earned", "Paid to farm"), value: num(stats?.earned) == null ? "—" : money(num(stats?.earned)!) },
    { key: "penalties", label: tOr("companionPage.contractManager.penalties", "Penalties paid"), value: num(stats?.penalties) == null ? "—" : money(num(stats?.penalties)!) },
    { key: "reputation", label: tOr("companionPage.contractManager.reputation", "Mod reputation"), value: formatNumber(stats?.reputation, 0) },
  ] : [];
  const columns = [
    { key: "id", label: tOr("companionPage.contractManager.contract", "Contract") },
    { key: "type", label: tOr("companionPage.contractManager.type", "Type") },
    { key: "field", label: tOr("companionPage.contractManager.field", "Field") },
    { key: "offer", label: tOr("companionPage.contractManager.offer", "Offered reward"), align: "end" as const },
    { key: "payout", label: tOr("companionPage.contractManager.payout", "Recorded payout"), align: "end" as const },
  ];
  const tableRows = (rows: Contract[], showPayout: boolean) => rows.map((row, index) => ({
    key: `${row.id ?? index}-${index}`,
    cells: {
      id: row.id || "—",
      type: row.typeName || "—",
      field: num(row.fieldId) != null && row.fieldId! > 0 ? formatNumber(row.fieldId, 0) : "—",
      offer: num(row.offeredReward) == null ? "—" : money(row.offeredReward!),
      payout: showPayout && num(row.payout) != null ? money(row.payout!) : "—",
    },
  }));
  return (
    <ModPage entry={entry} lead={tOr("companionPage.contractManager.lead", "Server-side Contract Manager records for this farm. Offered rewards are not paid income; a payout appears only after the mod records it. Client-only history is withheld because it may be incomplete.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.contractManager.activeTitle", "Active contract ledger")}>
        <ModTable columns={columns} rows={tableRows(active, false)} empty={tOr("companionPage.contractManager.noActive", "No active Contract Manager record for this farm.")} />
      </Card>
      <Card title={tOr("companionPage.contractManager.historyTitle", "Saved contract outcomes")}>
        <ModTable columns={columns} rows={tableRows(history, true)} empty={tOr("companionPage.contractManager.noHistory", "No saved contract outcome for this farm.")} />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.contractManager.truncated", "Only part of the contract ledger is listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.contractManager.partial", "Some contract records could not be read.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
