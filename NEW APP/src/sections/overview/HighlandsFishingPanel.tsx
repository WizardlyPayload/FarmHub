import { tOr } from "@/i18n/i18n";
import type { DashboardPayload } from "@/types/dashboard";
import "./beans-alpacas.css";

type FishingState = NonNullable<DashboardPayload["highlandsFishing"]>;

function count(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value).toLocaleString() : "—";
}

export function HighlandsFishingPanel({ state, farmId }: {
  state: FishingState | null | undefined;
  farmId: number;
}) {
  if (!state?.enabled) return null;
  const farm = state.authoritative ? state.byFarm?.[String(farmId)] : undefined;
  return (
    <section class="fd-overview__dlc" aria-label={tOr("highlandsFishing.title", "Highlands Fishing")}>
      <div class="fd-overview__dlc-head">
        <h2>{tOr("highlandsFishing.title", "Highlands Fishing")}</h2>
        <p>{tOr("highlandsFishing.description", "Fishing activity for the selected farm. Fish farming and production stock appear in their normal sections when available.")}</p>
      </div>
      {farm ? (
        <div class="fd-overview__dlc-grid">
          <div>
            <h3>{tOr("highlandsFishing.allTime", "All time")}</h3>
            <dl>
              <dt>{tOr("highlandsFishing.sold", "Fish sold")}</dt><dd>{count(farm.total?.soldFish)}</dd>
              <dt>{tOr("highlandsFishing.released", "Fish released")}</dt><dd>{count(farm.total?.releasedFish)}</dd>
              <dt>{tOr("highlandsFishing.trash", "Trash collected")}</dt><dd>{count(farm.total?.caughtTrashItems)}</dd>
            </dl>
          </div>
          <div>
            <h3>{tOr("highlandsFishing.session", "This session")}</h3>
            <dl>
              <dt>{tOr("highlandsFishing.sold", "Fish sold")}</dt><dd>{count(farm.session?.soldFish)}</dd>
              <dt>{tOr("highlandsFishing.released", "Fish released")}</dt><dd>{count(farm.session?.releasedFish)}</dd>
              <dt>{tOr("highlandsFishing.trash", "Trash collected")}</dt><dd>{count(farm.session?.caughtTrashItems)}</dd>
            </dl>
          </div>
        </div>
      ) : (
        <p class="fd-overview__dlc-frost">{tOr("highlandsFishing.unavailable", "Fishing totals are unavailable for this farm in the current snapshot.")}</p>
      )}
      {state.farmsTruncated ? <p class="fd-overview__dlc-frost">{tOr("highlandsFishing.truncated", "Some farms were omitted from this snapshot.")}</p> : null}
    </section>
  );
}
