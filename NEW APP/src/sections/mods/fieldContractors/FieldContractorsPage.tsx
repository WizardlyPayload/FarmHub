import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.fieldContractors";

type Claim = {
  farmId?: number; claimId?: number; fieldId?: number; fieldLabel?: string;
  workType?: string; workLabel?: string; agreedPrice?: number;
  areaHa?: number; processedAreaHa?: number; phase?: string;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<Claim>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "claims", label: tOr(`${K}.claims`, "Current claims"),
      value: formatNumber(farmData.currentClaimCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "Current field-work claims for this farm from the mod's live server register. Agreed prices are quoted costs, not completed or paid work. Profile records from other saves are excluded.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Current field claims")}>
        <ModTable columns={[
          { key: "field", label: tOr(`${K}.field`, "Field") },
          { key: "work", label: tOr(`${K}.work`, "Work") },
          { key: "price", label: tOr(`${K}.price`, "Agreed price"), align: "end" },
          { key: "area", label: tOr(`${K}.area`, "Area (ha)"), align: "end" },
          { key: "processed", label: tOr(`${K}.processed`, "Processed (ha)"), align: "end" },
          { key: "phase", label: tOr(`${K}.phase`, "Mod phase") },
        ]} rows={rows.map((row, index) => ({
          key: `${row.claimId ?? index}`,
          cells: {
            field: row.fieldLabel || `${tOr(`${K}.field`, "Field")} ${formatNumber(row.fieldId, 0)}`,
            work: row.workLabel || row.workType || "—",
            price: money(row.agreedPrice),
            area: formatNumber(row.areaHa, 2),
            processed: formatNumber(row.processedAreaHa, 2),
            phase: row.phase || "—",
          },
        }))} empty={tOr(`${K}.empty`, "No current field-work claim was recorded for this farm.")} />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`,
          "Only part of the live claim register was read; the total is withheld.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`,
          "Some claim values were invalid or ambiguous; the total is withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
