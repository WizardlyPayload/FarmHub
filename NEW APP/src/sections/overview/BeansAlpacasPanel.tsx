import { tOr } from "@/i18n/i18n";
import type { DashboardPayload } from "@/types/dashboard";
import "./beans-alpacas.css";

type DlcState = NonNullable<DashboardPayload["beansAndAlpacas"]>;

function numberOrDash(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "—";
}

function settingLabel(value: boolean | undefined): string {
  if (value === true) return tOr("common.on", "On");
  if (value === false) return tOr("common.off", "Off");
  return tOr("common.notAvailable", "Unavailable");
}

function fruitLabel(code: string): string {
  const known: Record<string, [string, string]> = {
    BANANA: ["orchards.bananas", "Bananas"],
    COFFEECHERRIES: ["orchards.coffee", "Coffee cherries"],
    GRAPE: ["orchards.grapes", "Grapes"],
    OLIVE: ["orchards.olives", "Olives"],
  };
  const entry = known[code];
  return entry ? tOr(entry[0], entry[1]) : code.replace(/_/g, " ").toLowerCase();
}

export function BeansAlpacasPanel({ state, farmId }: { state: DlcState | null | undefined; farmId: number }) {
  if (!state?.enabled) return null;
  const workers = state.workersByFarm?.[String(farmId)];
  const collectibles = state.catuaiMap ? state.collectibles : undefined;
  const pendingFrost = state.frostPendingKnown && Array.isArray(state.frostPendingFruitTypes)
    ? state.frostPendingFruitTypes : [];
  return (
    <section class="fd-overview__dlc" aria-label={tOr("beansAlpacas.title", "Beans & Alpacas Expansion")}>
      <div class="fd-overview__dlc-head">
        <h2>{tOr("beansAlpacas.title", "Beans & Alpacas Expansion")}</h2>
        <p>{tOr("beansAlpacas.standardSections", "Crops, vehicles, products and production chains appear in their normal dashboard sections.")}</p>
      </div>
      <div class="fd-overview__dlc-grid">
        <div>
          <h3>{tOr("beansAlpacas.workers", "Banana workers")}</h3>
          <dl>
            <dt>{tOr("beansAlpacas.hired", "Hired")}</dt>
            <dd>{workers ? `${numberOrDash(workers.count)} / ${numberOrDash(workers.maxCount)}` : "—"}</dd>
            <dt>{tOr("beansAlpacas.actionsLeft", "Actions left today")}</dt>
            <dd>{numberOrDash(workers?.actionsRemainingToday)}</dd>
            <dt>{tOr("beansAlpacas.washingStations", "Washing stations")}</dt>
            <dd>{numberOrDash(workers?.washingStations)}</dd>
          </dl>
        </div>
        <div>
          <h3>{tOr("beansAlpacas.gameSettings", "Orchard settings")}</h3>
          <dl>
            <dt>{tOr("beansAlpacas.disease", "Orchard disease")}</dt>
            <dd>{settingLabel(state.orchardDiseaseEnabled)}</dd>
            <dt>{tOr("beansAlpacas.frost", "Frost damage")}</dt>
            <dd>{settingLabel(state.frostDamageEnabled)}</dd>
          </dl>
        </div>
        {collectibles ? (
          <div>
            <h3>{tOr("beansAlpacas.collectibles", "Catuaí discoveries")}</h3>
            <dl>
              <dt>{tOr("beansAlpacas.found", "Found")}</dt>
              <dd>{numberOrDash(collectibles.found)} / {numberOrDash(collectibles.total)}</dd>
              <dt>{tOr("beansAlpacas.uncovered", "Uncovered")}</dt>
              <dd>{numberOrDash(collectibles.uncovered)}</dd>
            </dl>
          </div>
        ) : null}
      </div>
      {pendingFrost.length > 0 ? (
        <p class="fd-overview__dlc-frost" role="status">
          {tOr("beansAlpacas.frostPending", "Frost warning: these crop types may wither at the next growth period")}: {pendingFrost.map(fruitLabel).join(", ")}
          {state.frostPendingTruncated ? ` ${tOr("beansAlpacas.frostPendingMore", "More affected crop types are not listed.")}` : ""}
        </p>
      ) : null}
    </section>
  );
}
