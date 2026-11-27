import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.cropRotationPlanner";

type PlanStep = {
  farmId?: number;
  planIndex?: number;
  planName?: string;
  step?: number;
  crop?: string;
  catchCrop?: string;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<PlanStep>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "plans", label: tOr(`${K}.plans`, "Named plans"), value: formatNumber(farmData.planCount, 0) },
    { key: "steps", label: tOr(`${K}.steps`, "Planned steps"), value: formatNumber(farmData.stepCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current named crop rotation plans for this farm. They are plans, not assignments to fields, completed rotations or measured yields.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Crop rotation plans")}>
        <ModTable columns={[
          { key: "plan", label: tOr(`${K}.plan`, "Plan") },
          { key: "step", label: tOr(`${K}.step`, "Step"), align: "end" },
          { key: "crop", label: tOr(`${K}.crop`, "Crop") },
          { key: "catch", label: tOr(`${K}.catch`, "Catch crop") },
        ]} rows={rows.map((row, index) => ({
          key: `${row.planIndex ?? index}-${row.step ?? index}`,
          cells: {
            plan: row.planName || "—",
            step: formatNumber(row.step, 0),
            crop: row.crop || "—",
            catch: row.catchCrop || "—",
          },
        }))} empty={tOr(`${K}.empty`, "No named rotation plan is available for this farm.")} />
      </Card>
      {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "The rotation plan could not be read completely; no steps are shown.")}</ModEmpty> : null}
    </ModPage>
  );
}
