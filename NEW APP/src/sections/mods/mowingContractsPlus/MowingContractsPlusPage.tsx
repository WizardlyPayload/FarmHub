import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Decision = {
  farmId?: number;
  id?: string;
  fieldName?: string;
  choice?: number;
  rewardReductionPct?: number;
};

function choiceLabel(choice: number | undefined): string {
  switch (num(choice)) {
    case 1: return tOr("companionPage.mowingContractsPlus.pending", "Offer pending");
    case 2: return tOr("companionPage.mowingContractsPlus.accepted", "Grass access accepted");
    case 3: return tOr("companionPage.mowingContractsPlus.declined", "Offer declined");
    default: return "—";
  }
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const decisions = asList<Decision>(page?.decisions).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "count", label: tOr("companionPage.mowingContractsPlus.count", "Assigned decisions"), value: formatNumber(farmData.decisionCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.mowingContractsPlus.lead", "Single-player mowing contracts assigned to this farm. An accepted grass-access offer reduces the contract reward; these rows do not record payment or collected grass.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.mowingContractsPlus.tableTitle", "Grass-access decisions")}>
        <ModTable
          columns={[
            { key: "field", label: tOr("companionPage.mowingContractsPlus.field", "Field") },
            { key: "decision", label: tOr("companionPage.mowingContractsPlus.decision", "Decision") },
            { key: "reduction", label: tOr("companionPage.mowingContractsPlus.reduction", "Reward reduction if accepted"), align: "end" },
          ]}
          rows={decisions.map((row, index) => ({
            key: row.id || String(index),
            cells: {
              field: row.fieldName || row.id || "—",
              decision: choiceLabel(row.choice),
              reduction: `${formatNumber(row.rewardReductionPct, 0)}%`,
            },
          }))}
          empty={tOr("companionPage.mowingContractsPlus.empty", "No saved grass-access offer for a mowing contract assigned to this farm.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.mowingContractsPlus.truncated", "Only some assigned decisions are listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.mowingContractsPlus.partial", "Some assigned decisions could not be read.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
