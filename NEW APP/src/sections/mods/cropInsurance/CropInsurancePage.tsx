import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Policy = {
  farmId?: number; fieldId?: number; crop?: string; hectares?: number;
  premiumPaid?: number; coveragePercent?: number; pendingEvent?: string;
};
type Outcome = {
  farmId?: number; fieldId?: number; crop?: string; outcome?: string;
  event?: string; indemnity?: number; endDay?: number;
};

function outcomeLabel(value: string | undefined): string {
  switch (value) {
    case "claim": return tOr("companionPage.cropInsurance.paid", "Claim paid");
    case "denied": return tOr("companionPage.cropInsurance.denied", "Claim denied");
    case "expired": return tOr("companionPage.cropInsurance.expired", "Expired");
    default: return "—";
  }
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const policies = asList<Policy>(page?.policies).filter((row) => num(row.farmId) === farmId);
  const history = asList<Outcome>(page?.history).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "policies", label: tOr("companionPage.cropInsurance.policyCount", "Recorded policies"), value: formatNumber(farmData.policyCount, 0) },
    { key: "pending", label: tOr("companionPage.cropInsurance.pendingCount", "Recorded pending losses"), value: formatNumber(farmData.pendingCount, 0) },
    { key: "history", label: tOr("companionPage.cropInsurance.historyCount", "Retained outcomes"), value: formatNumber(farmData.historyCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.cropInsurance.lead", "Policies and recent outcomes recorded by Crop Insurance for this farm. A recorded policy is not proof a new claim is eligible; any future payout remains unverified until paid in game.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.cropInsurance.policiesTitle", "Recorded field policies")}>
        <ModTable
          columns={[
            { key: "field", label: tOr("companionPage.cropInsurance.field", "Field") },
            { key: "crop", label: tOr("companionPage.cropInsurance.crop", "Crop") },
            { key: "area", label: tOr("companionPage.cropInsurance.area", "Area (ha)"), align: "end" },
            { key: "coverage", label: tOr("companionPage.cropInsurance.coverage", "Coverage"), align: "end" },
            { key: "premium", label: tOr("companionPage.cropInsurance.premium", "Premium paid"), align: "end" },
            { key: "pending", label: tOr("companionPage.cropInsurance.pending", "Recorded loss") },
          ]}
          rows={policies.map((row, index) => ({
            key: `${row.fieldId ?? index}`,
            cells: {
              field: num(row.fieldId) == null ? "—" : formatNumber(row.fieldId, 0),
              crop: row.crop || "—",
              area: num(row.hectares) == null ? "—" : formatNumber(row.hectares, 2),
              coverage: num(row.coveragePercent) == null ? "—" : `${formatNumber(row.coveragePercent, 0)}%`,
              premium: num(row.premiumPaid) == null ? "—" : money(row.premiumPaid!),
              pending: row.pendingEvent || "—",
            },
          }))}
          empty={tOr("companionPage.cropInsurance.empty", "No field policy recorded for this farm.")}
        />
      </Card>
      <Card title={tOr("companionPage.cropInsurance.historyTitle", "Recent recorded outcomes")}>
        <ModTable
          columns={[
            { key: "field", label: tOr("companionPage.cropInsurance.field", "Field") },
            { key: "crop", label: tOr("companionPage.cropInsurance.crop", "Crop") },
            { key: "outcome", label: tOr("companionPage.cropInsurance.outcome", "Outcome") },
            { key: "event", label: tOr("companionPage.cropInsurance.event", "Event") },
            { key: "indemnity", label: tOr("companionPage.cropInsurance.indemnity", "Recorded payment"), align: "end" },
          ]}
          rows={history.map((row, index) => ({
            key: `${row.fieldId ?? index}-${index}`,
            cells: {
              field: num(row.fieldId) == null ? "—" : formatNumber(row.fieldId, 0),
              crop: row.crop || "—", outcome: outcomeLabel(row.outcome), event: row.event || "—",
              indemnity: row.outcome === "claim" && num(row.indemnity) != null ? money(row.indemnity!) : "—",
            },
          }))}
          empty={tOr("companionPage.cropInsurance.historyEmpty", "No recent outcome recorded for this farm.")}
        />
      </Card>
      {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.cropInsurance.truncated", "Only part of the insurance register is shown.")}</ModEmpty> : null}
      {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.cropInsurance.partial", "Some insurance records could not be read.")}</ModEmpty> : null}
    </ModPage>
  );
}
