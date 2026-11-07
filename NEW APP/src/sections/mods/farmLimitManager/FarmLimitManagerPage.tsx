import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModPage, ModTable, formatNumber, useCompanionPage,
  type CompanionPageProps,
} from "@/sections/mods/shared";

const K = "companionPage.farmLimitManager";

const limits = [
  ["maxAIWorkers", "Active AI workers"],
  ["maxHusbandries", "Husbandries"],
  ["maxGreenhouses", "Greenhouses"],
  ["maxFactories", "Factories"],
  ["maxContracts", "Active contracts"],
] as const;

export function Page({ entry }: CompanionPageProps) {
  const { page } = useCompanionPage(entry.key);
  const values = page?.limits as Record<string, number> | undefined;
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "These configured limits apply to every farm in this save. They are policy settings, not a count of current workers, buildings or contracts, and do not prove a limit was enforced.")}>
      <Card title={tOr(`${K}.tableTitle`, "Save-wide limits per farm")}>
        <ModTable
          columns={[
            { key: "category", label: tOr(`${K}.category`, "Category") },
            { key: "limit", label: tOr(`${K}.limit`, "Configured limit"), align: "end" },
          ]}
          rows={values ? limits.map(([key, fallback]) => ({
            key,
            cells: { category: tOr(`${K}.${key}`, fallback), limit: formatNumber(values[key], 0) },
          })) : []}
          empty={tOr(`${K}.empty`, "No loaded limit policy was captured.")}
        />
      </Card>
    </ModPage>
  );
}
