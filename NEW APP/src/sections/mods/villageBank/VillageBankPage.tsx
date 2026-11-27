import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.villageBank";
type Account = { farmId?: number; id?: number; name?: string; balance?: number };
type Deposit = { farmId?: number; id?: number; balance?: number; principal?: number; annualRate?: number; maturityDay?: number };
type Contract = { farmId?: number; kind?: string; id?: number; vehicle?: string; status?: string; monthlyRate?: number; monthsLeft?: number; outstanding?: number; residual?: number; arrears?: number };
type Transaction = { farmId?: number; type?: string; source?: string; target?: string; amount?: number; day?: number };

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const accounts = asList<Account>(page?.accounts).filter((r) => num(r.farmId) === farmId);
  const deposits = asList<Deposit>(page?.deposits).filter((r) => num(r.farmId) === farmId);
  const contracts = asList<Contract>(page?.contracts).filter((r) => num(r.farmId) === farmId);
  const transactions = asList<Transaction>(page?.transactions).filter((r) => num(r.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "accounts", label: tOr(`${K}.accounts`, "Extra accounts"), value: formatNumber(farmData.subaccountCount, 0) },
    { key: "deposits", label: tOr(`${K}.deposits`, "Fixed deposits"), value: formatNumber(farmData.depositCount, 0) },
    { key: "finance", label: tOr(`${K}.finance`, "Outstanding finance"), value: formatNumber(farmData.financeCount, 0) },
    { key: "leases", label: tOr(`${K}.leases`, "Open leases"), value: formatNumber(farmData.leaseCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Village Bank's existing records for this farm. Extra-account balances exclude the main account, which uses native farm money. Contracts are bank records; the page does not claim their vehicles are still owned or that future payments were made.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.accountTitle`, "Extra account balances")}>
        <ModTable columns={[
          { key: "name", label: tOr(`${K}.accountName`, "Account") },
          { key: "balance", label: tOr(`${K}.balance`, "Balance"), align: "end" },
        ]} rows={accounts.map((r, i) => ({ key: `${r.id ?? i}`, cells: { name: r.name || "—", balance: money(r.balance) } }))}
          empty={tOr(`${K}.noAccounts`, "No extra Village Bank accounts are recorded.")} />
      </Card>
      <Card title={tOr(`${K}.depositTitle`, "Fixed deposits")}>
        <ModTable columns={[
          { key: "balance", label: tOr(`${K}.balance`, "Balance"), align: "end" },
          { key: "principal", label: tOr(`${K}.principal`, "Principal"), align: "end" },
          { key: "rate", label: tOr(`${K}.rate`, "Annual rate"), align: "end" },
          { key: "maturity", label: tOr(`${K}.maturity`, "Maturity game day"), align: "end" },
        ]} rows={deposits.map((r, i) => ({ key: `${r.id ?? i}`, cells: {
          balance: money(r.balance), principal: money(r.principal),
          rate: num(r.annualRate) == null ? "—" : `${formatNumber(num(r.annualRate)! * 100, 1)}%`,
          maturity: formatNumber(r.maturityDay, 0),
        } }))} empty={tOr(`${K}.noDeposits`, "No fixed deposits are recorded.")} />
      </Card>
      <Card title={tOr(`${K}.contractTitle`, "Bank finance and leasing records")}>
        <ModTable columns={[
          { key: "vehicle", label: tOr(`${K}.vehicle`, "Recorded vehicle") },
          { key: "kind", label: tOr(`${K}.kind`, "Contract / status") },
          { key: "monthly", label: tOr(`${K}.monthly`, "Monthly rate"), align: "end" },
          { key: "remaining", label: tOr(`${K}.remaining`, "Months left"), align: "end" },
          { key: "balance", label: tOr(`${K}.contractBalance`, "Outstanding / residual"), align: "end" },
          { key: "arrears", label: tOr(`${K}.arrears`, "Arrears"), align: "end" },
        ]} rows={contracts.map((r, i) => ({ key: `${r.kind}-${r.id ?? i}`, cells: {
          vehicle: r.vehicle || "—", kind: `${r.kind || "—"} / ${r.status || "—"}`,
          monthly: money(r.monthlyRate), remaining: formatNumber(r.monthsLeft, 0),
          balance: money(r.kind === "lease" ? r.residual : r.outstanding),
          arrears: formatNumber(r.arrears, 0),
        } }))} empty={tOr(`${K}.noContracts`, "No active bank finance or leasing record is present.")} />
      </Card>
      <Card title={tOr(`${K}.journalTitle`, "Recorded transaction journal")}>
        <ModTable columns={[
          { key: "day", label: tOr(`${K}.day`, "Game day") },
          { key: "type", label: tOr(`${K}.type`, "Type") },
          { key: "route", label: tOr(`${K}.route`, "From / to") },
          { key: "amount", label: tOr(`${K}.amount`, "Amount"), align: "end" },
        ]} rows={transactions.map((r, i) => ({ key: `${r.day ?? "day"}-${i}`, cells: {
          day: formatNumber(r.day, 0), type: r.type || "—",
          route: `${r.source || "—"} / ${r.target || "—"}`, amount: money(r.amount),
        } }))} empty={tOr(`${K}.noTransactions`, "No Village Bank journal entry is recorded.")} />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of this farm's bank register was scanned or displayed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Some invalid bank records were withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
