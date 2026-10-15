import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import { finite, listOf, useFoldedCompanion } from "@/lib/companionFold";
import { useUnitDisplay } from "@/lib/fill-unit-mode";
import { formatProfileArea, saveProfileFromUnitDisplay } from "@/lib/profile-display";

type Tool = "discHarrow" | "cultivatorShallow" | "cultivatorDeep" | "powerHarrow" | "subsoiler" | "plow";
type Tier = { bonus?: number; areaHa?: number; tools?: Tool[] };

const MAX_TIERS = 4;

function toolLabel(tool: Tool): string {
  switch (tool) {
    case "discHarrow":
      return tOr("companionPage.soilWorkYieldBonus.toolDiscHarrow", "Disc harrow");
    case "cultivatorShallow":
      return tOr("companionPage.soilWorkYieldBonus.toolCultivatorShallow", "Cultivator (shallow)");
    case "cultivatorDeep":
      return tOr("companionPage.soilWorkYieldBonus.toolCultivatorDeep", "Cultivator (deep)");
    case "powerHarrow":
      return tOr("companionPage.soilWorkYieldBonus.toolPowerHarrow", "Power harrow");
    case "subsoiler":
      return tOr("companionPage.soilWorkYieldBonus.toolSubsoiler", "Subsoiler / chisel plough");
    case "plow":
      return tOr("companionPage.soilWorkYieldBonus.toolPlow", "Plough");
    default: {
      const never: never = tool;
      return never;
    }
  }
}

const TOOLS = new Set<string>(["discHarrow", "cultivatorShallow", "cultivatorDeep", "powerHarrow", "subsoiler", "plow"]);

/** Bonus fraction (0.08) as "+8%". */
function bonusText(value: unknown): string {
  const n = finite(value);
  if (n == null) return "—";
  const pct = Math.round(n * 1000) / 10;
  return `+${pct.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

/**
 * Soil Work Yield Bonus on the Fields page: the mod keeps one grid for the whole map, so only map-wide totals
 * are shown (never per field). Hidden unless the mod is detected.
 */
export function SoilWorkBonusCard() {
  const reading = useFoldedCompanion("soilWorkYieldBonus");
  const profile = saveProfileFromUnitDisplay(useUnitDisplay());
  if (!reading.detected) return null;
  const page = reading.page;
  const title = tOr("companionPage.soilWorkYieldBonus.title", "Soil Work Yield Bonus");
  const settings = page?.settings && typeof page.settings === "object" ? (page.settings as { enabled?: unknown }) : null;
  const cells = finite(page?.workedCells);
  const worked = finite(page?.workedAreaHa);

  if (settings?.enabled === false || cells == null || worked == null || cells <= 0) {
    const text =
      settings?.enabled === false
        ? tOr("fields.fold.soilBonusOff", "Soil Work Yield Bonus is switched off in this save.")
        : tOr("companionPage.soilWorkYieldBonus.noWorked", "No worked ground is waiting for harvest right now.");
    return (
      <Card class="fd-fields__soil-bonus fd-fields__soil-bonus--empty" title={title}>
        <p class="fd-muted" data-fold="soilWorkYieldBonus" data-soil-bonus="empty">
          {text}
        </p>
      </Card>
    );
  }

  const sampled = page?.coverage === "sampled";
  const area = formatProfileArea(worked, profile);
  const tiers = listOf<Tier>(page?.tiers).filter((tier) => finite(tier.areaHa) != null && finite(tier.bonus) != null);
  const shown = tiers.slice(0, MAX_TIERS);

  return (
    <Card class="fd-fields__soil-bonus" title={title}>
      <div class="fd-fields__soil-bonus-stats" data-fold="soilWorkYieldBonus">
        <div data-stat="area">
          <small class="fd-muted">{tOr("companionPage.soilWorkYieldBonus.statArea", "Worked ground waiting for harvest")}</small>
          <strong>{sampled ? tOr("companionPage.soilWorkYieldBonus.atLeast", "at least {{value}}", { value: area }) : area}</strong>
        </div>
        <div data-stat="average">
          <small class="fd-muted">{tOr("companionPage.soilWorkYieldBonus.statAverage", "Average bonus")}</small>
          <strong>{bonusText(page?.averageBonus)}</strong>
        </div>
        <div data-stat="best">
          <small class="fd-muted">{tOr("companionPage.soilWorkYieldBonus.statBest", "Highest bonus")}</small>
          <strong>{bonusText(page?.bestBonus)}</strong>
        </div>
      </div>
      {shown.length > 0 ? (
        <ul class="fd-fields__soil-bonus-tiers">
          {shown.map((tier, i) => {
            const tools = (Array.isArray(tier.tools) ? (tier.tools as unknown[]) : []).filter(
              (tool): tool is Tool => typeof tool === "string" && TOOLS.has(tool),
            );
            const from = tools.length > 0 ? tools.map(toolLabel).join(", ") : tOr("companionPage.soilWorkYieldBonus.olderSetting", "Earlier settings");
            return (
              <li key={`${tier.bonus}-${i}`} data-tier={i}>
                <strong>{bonusText(tier.bonus)}</strong> {from} · {formatProfileArea(finite(tier.areaHa) ?? 0, profile)}
              </li>
            );
          })}
          {tiers.length > shown.length ? (
            <li class="fd-muted">{tOr("fields.fold.soilBonusMoreTiers", "+{{count}} more", { count: tiers.length - shown.length })}</li>
          ) : null}
        </ul>
      ) : null}
      <p class="fd-muted fd-fields__soil-bonus-note">
        {sampled
          ? tOr("fields.fold.soilBonusSampled", "Whole map, all farms. The grid is large, so these are lower bounds.")
          : tOr("companionPage.soilWorkYieldBonus.statAreaHint", "All farms on the map")}
      </p>
    </Card>
  );
}
