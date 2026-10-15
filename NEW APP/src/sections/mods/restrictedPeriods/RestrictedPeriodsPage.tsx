import { Badge, Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModAbout,
  ModEmpty,
  ModPage,
  ModStatTiles,
  ModTable,
  asList,
  formatNumber,
  num,
  periodLabel,
  useCompanionPage,
  type CompanionPageProps,
  type ModStatTile,
} from "@/sections/mods/shared";
import "./restrictedPeriods.css";

type Category = "liquid" | "solid";
type RuleCell = "closed" | "frost" | "open";

type VehicleRow = {
  farmId?: number;
  name?: string;
  category?: Category;
  blocked?: boolean;
  reason?: string;
};

const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
/** The rules written into SlurryBan.isBanActive in Restricted Periods 1.0.0.0. */
export const RULES_VERSION = "1.0.0.0";

export function ruleFor(category: Category, period: number): RuleCell {
  if (category === "liquid") {
    if (period >= 9 && period <= 11) return "closed";
    if (period === 12) return "frost";
    return "open";
  }
  return period >= 10 && period <= 11 ? "closed" : "open";
}

/** Next period (1-12, wrapping) where the category is open without conditions, or null when open now. */
export function nextOpenPeriod(category: Category, current: number): number | null {
  if (ruleFor(category, current) === "open") return null;
  for (let step = 1; step <= 12; step++) {
    const p = ((current - 1 + step) % 12) + 1;
    if (ruleFor(category, p) === "open") return p;
  }
  return null;
}

function categoryLabel(category: Category): string {
  switch (category) {
    case "liquid":
      return tOr("companionPage.restrictedPeriods.liquid", "Liquid (slurry, digestate)");
    case "solid":
      return tOr("companionPage.restrictedPeriods.solid", "Solid (manure)");
    default: {
      const never: never = category;
      return never;
    }
  }
}

function reasonLabel(reason: unknown): string {
  if (reason === "sperrfrist") return tOr("companionPage.restrictedPeriods.reasonClosed", "Closed period");
  if (reason === "frost") return tOr("companionPage.restrictedPeriods.reasonFrost", "Ground frost");
  if (typeof reason === "string" && reason !== "") return tOr("companionPage.restrictedPeriods.reasonOther", "Blocked");
  return "";
}

function ruleLabel(cell: RuleCell): string {
  switch (cell) {
    case "closed":
      return tOr("companionPage.restrictedPeriods.ruleClosed", "Closed");
    case "frost":
      return tOr("companionPage.restrictedPeriods.ruleFrost", "Closed below 0 °C");
    case "open":
      return tOr("companionPage.restrictedPeriods.ruleOpen", "Open");
    default: {
      const never: never = cell;
      return never;
    }
  }
}

function banTile(key: string, category: Category, reason: unknown, read: unknown, current: number | null): ModStatTile {
  if (read === false) {
    return { key, label: categoryLabel(category), value: "—", hint: tOr("companionPage.restrictedPeriods.notRead", "Not read") };
  }
  const next = current != null ? nextOpenPeriod(category, current) : null;
  const blocked = typeof reason === "string" && reason !== "";
  return {
    key,
    label: categoryLabel(category),
    value: blocked
      ? tOr("companionPage.restrictedPeriods.bannedFor", "Banned: {{reason}}", { reason: reasonLabel(reason) })
      : tOr("companionPage.restrictedPeriods.allowed", "Allowed"),
    tone: blocked ? "danger" : "ok",
    hint: blocked && next != null ? tOr("companionPage.restrictedPeriods.opensIn", "Opens again in {{period}}", { period: periodLabel(next) }) : null,
  };
}

function RuleGrid({ current }: { current: number | null }) {
  const categories: Category[] = ["liquid", "solid"];
  return (
    <div class="fd-cp-rp__scroll">
      <table class="fd-economy__table fd-cp-rp__table">
        <thead>
          <tr>
            <th scope="col">{tOr("companionPage.restrictedPeriods.colCategory", "Fertiliser")}</th>
            {PERIODS.map((p) => (
              <th key={p} scope="col" class={`text-center${p === current ? " is-current" : ""}`} title={periodLabel(p)}>
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <tr key={category} data-rule={category}>
              <th scope="row">{categoryLabel(category)}</th>
              {PERIODS.map((p) => {
                const cell = ruleFor(category, p);
                return (
                  <td
                    key={p}
                    class={`fd-cp-rp__cell is-${cell}${p === current ? " is-current" : ""}`}
                    title={`${periodLabel(p)}: ${ruleLabel(cell)}`}
                    data-cell={cell}
                  >
                    {cell === "open" ? null : <span class="fd-cp-rp__mark" role="img" aria-label={ruleLabel(cell)} />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const current = num(page?.currentPeriod);
  const currentPeriod = current != null && current >= 1 && current <= 12 ? Math.round(current) : null;
  const vehicles = asList<VehicleRow>(page?.vehicles).filter((v) => num(v.farmId) === farmId);
  const version = typeof page?.version === "string" ? page.version : null;
  const hasLive = page != null && currentPeriod != null;

  const tiles: ModStatTile[] = hasLive
    ? [
        { key: "period", label: tOr("companionPage.restrictedPeriods.statPeriod", "Current period"), value: periodLabel(currentPeriod) },
        {
          key: "spreading",
          label: tOr("companionPage.restrictedPeriods.statSpreading", "Organic spreading"),
          value: page?.anyActive
            ? tOr("companionPage.restrictedPeriods.restricted", "Restricted")
            : tOr("companionPage.restrictedPeriods.allowed", "Allowed"),
          tone: page?.anyActive ? "danger" : "ok",
        },
        banTile("liquid", "liquid", page?.liquidBan, page?.liquidRead, currentPeriod),
        banTile("solid", "solid", page?.solidBan, page?.solidRead, currentPeriod),
        {
          key: "temperature",
          label: tOr("companionPage.restrictedPeriods.statTemperature", "Temperature"),
          value:
            num(page?.temperature) != null
              ? tOr("companionPage.restrictedPeriods.celsius", "{{value}} °C", { value: formatNumber(page?.temperature, 1) })
              : "—",
          hint: tOr("companionPage.restrictedPeriods.frostHint", "Liquids stop below 0 °C in period 12"),
        },
      ]
    : [];
  if (hasLive && farmData) {
    tiles.push({
      key: "blocked",
      label: tOr("companionPage.restrictedPeriods.statBlocked", "Your vehicles blocked now"),
      value: formatNumber(farmData.blockedVehicles, 0),
      tone: (num(farmData.blockedVehicles) ?? 0) > 0 ? "warn" : undefined,
      hint: tOr("companionPage.restrictedPeriods.statBlockedHint", "{{liquid}} liquid, {{solid}} solid loaded", {
        liquid: formatNumber(farmData.liquidVehicles, 0),
        solid: formatNumber(farmData.solidVehicles, 0),
      }),
    });
  }

  return (
    <ModPage
      entry={entry}
      lead={tOr(
        "companionPage.restrictedPeriods.lead",
        "Restricted Periods stops you switching on slurry, digestate and manure spreaders during closed periods, and liquids in ground frost. This page shows whether spreading is allowed right now.",
      )}
    >
      <ModStatTiles tiles={tiles} />
      <div class="fd-mod-page__grid">
        <Card title={tOr("companionPage.restrictedPeriods.rulesTitle", "Closed periods by fertiliser")}>
          <RuleGrid current={currentPeriod} />
          <div class="fd-cp-rp__legend">
            <span><i class="fd-cp-rp__swatch is-closed" />{ruleLabel("closed")}</span>
            <span><i class="fd-cp-rp__swatch is-frost" />{ruleLabel("frost")}</span>
            {currentPeriod != null ? (
              <span><i class="fd-cp-rp__swatch is-current" />{tOr("companionPage.restrictedPeriods.legendCurrent", "Current period")}</span>
            ) : null}
          </div>
          <p class="fd-economy__muted">
            {tOr(
              "companionPage.restrictedPeriods.rulesNote",
              "These are the rules written into version {{version}} of the mod. The ban and frost check above are read live from the game.",
              { version: RULES_VERSION },
            )}
          </p>
          {version && version !== RULES_VERSION ? (
            <p class="fd-economy__muted" data-rules-version="mismatch">
              {tOr(
                "companionPage.restrictedPeriods.rulesMismatch",
                "Your installed version is {{version}}; its rules may differ from this table.",
                { version },
              )}
            </p>
          ) : null}
        </Card>
        <Card title={tOr("companionPage.restrictedPeriods.vehiclesTitle", "Your loaded spreaders")}>
          <ModTable
            columns={[
              { key: "name", label: tOr("companionPage.restrictedPeriods.colVehicle", "Vehicle") },
              { key: "category", label: tOr("companionPage.restrictedPeriods.colLoad", "Load") },
              { key: "status", label: tOr("companionPage.restrictedPeriods.colStatus", "Can switch on"), align: "center" },
            ]}
            rows={vehicles.map((v, i) => ({
              key: `${v.name ?? "vehicle"}-${i}`,
              tone: v.blocked ? "danger" : undefined,
              cells: {
                name: v.name || tOr("companionPage.restrictedPeriods.unnamed", "Vehicle"),
                category: v.category ? categoryLabel(v.category) : "—",
                status: v.blocked ? (
                  <Badge tone="danger">{reasonLabel(v.reason) || tOr("companionPage.restrictedPeriods.reasonOther", "Blocked")}</Badge>
                ) : (
                  <Badge tone="accent">{tOr("companionPage.restrictedPeriods.allowed", "Allowed")}</Badge>
                ),
              },
            }))}
            empty={
              hasLive
                ? tOr("companionPage.restrictedPeriods.noVehicles", "None of your vehicles is carrying slurry, digestate or manure right now.")
                : tOr("companionPage.restrictedPeriods.waitingVehicles", "Your spreaders appear after the next export.")
            }
          />
          {page?.vehicleCoverage === "truncated" ? (
            <ModEmpty>{tOr("companionPage.restrictedPeriods.vehiclesTruncated", "Only the first vehicles are listed.")}</ModEmpty>
          ) : null}
        </Card>
      </div>
      <ModAbout
        entry={entry}
        lookFor={[
          tOr("companionPage.restrictedPeriods.look1", "A blinking warning appears when you try to switch on a spreader during a closed period."),
          tOr("companionPage.restrictedPeriods.look2", "Only the fill type loaded right now counts: liquid manure and digestate are liquid, manure is solid."),
          tOr("companionPage.restrictedPeriods.look3", "The mod has no settings menu. Driving and filling are never blocked, only switching the spreader on."),
        ]}
      />
    </ModPage>
  );
}
