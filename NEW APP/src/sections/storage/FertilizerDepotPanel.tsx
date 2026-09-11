import { t, tOr } from "@/i18n/i18n";
import { Badge, Button, Card } from "@/components/ui";
import { useDashboardStore } from "@/store/dashboard-store";
import {
  depotFillPercent,
  depotLevelsForDisplay,
  fertilizerDepotOrders,
  fertilizerDepots,
  fertilizerDepotSeasonHint,
  fertilizerDepotSettings,
  formatDepotLiters,
  humanizeFillType,
  isFertilizerDepotActive,
  type RfDepotRow,
} from "@/lib/realisticFarming/depot";
import type { RealisticFarmingPayload } from "@/types/dashboard";

function DepotCard({ depot, maxRows }: { depot: RfDepotRow; maxRows: number }) {
  const levels = depotLevelsForDisplay(depot, maxRows);
  const liters = (depot.levels || []).reduce((sum, row) => sum + (Number(row.liters) || 0), 0);
  return (
    <div class="fd-rf-depot__card">
      <div class="fd-rf-depot__card-head">
        <strong>{depot.name || depot.id}</strong>
        {depot.seasonalPriceHint ? (
          <Badge tone="accent">{depot.seasonalPriceHint}</Badge>
        ) : null}
      </div>
      <p class="fd-muted-sm">
        {t("rf.depot.stockTotal", { liters: formatDepotLiters(liters) })}
        {depot.farmId != null ? ` · ${t("rf.depot.farmId", { id: depot.farmId })}` : ""}
      </p>
      {levels.length === 0 ? (
        <p class="fd-muted-sm">{t("storage.rfDepot.noStock")}</p>
      ) : (
        <table class="fd-rf-depot__table">
          <thead>
            <tr>
              <th>{t("storage.rfDepot.colFill")}</th>
              <th class="text-end">{t("storage.rfDepot.colLiters")}</th>
              <th class="text-end">{t("storage.rfDepot.colFillPct")}</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((row) => {
              const pct = depotFillPercent(row.liters, row.capacity);
              return (
                <tr key={`${depot.id}-${row.fillType}`}>
                  <td>{humanizeFillType(row.fillType)}</td>
                  <td class="text-end">{formatDepotLiters(row.liters)} L</td>
                  <td class="text-end">
                    {pct != null ? `${Math.round(pct)}%` : t("common.notAvailable")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Fertilizer Depot — compact on Storage, full on the Mods tab. */
export function FertilizerDepotPanel({
  fertilizerDepot,
  variant = "storage",
}: {
  fertilizerDepot: RealisticFarmingPayload["fertilizerDepot"] | null | undefined;
  variant?: "storage" | "page";
}) {
  const setSection = useDashboardStore((s) => s.setSection);
  if (!isFertilizerDepotActive(fertilizerDepot)) return null;
  const depots = fertilizerDepots(fertilizerDepot);
  const orders = fertilizerDepotOrders(fertilizerDepot);
  const seasonHint = fertilizerDepotSeasonHint(fertilizerDepot);
  const settings = fertilizerDepotSettings(fertilizerDepot);
  const maxRows = variant === "page" ? 24 : 12;
  const title = variant === "page" ? undefined : t("storage.rfDepot.title");

  return (
    <Card class="fd-rf-depot" title={title}>
      {variant === "storage" ? (
        <p class="fd-muted-sm">{t("storage.rfDepot.subtitle")}</p>
      ) : null}
      {seasonHint ? (
        <p class="fd-rf-depot__season">
          <Badge tone="accent">
            {t("storage.rfDepot.seasonLabel")}: {seasonHint}
          </Badge>
        </p>
      ) : null}

      {variant === "page" && settings ? (
        <div class="fd-economy__stats">
          {settings.stockSource === "hall" ? null : (
            <div>
              <span class="fd-economy__muted">{t("rf.depot.storageCapacity")}</span>
              <strong>{formatDepotLiters(Number(settings.storageCapacity) || 0)} L</strong>
            </div>
          )}
          <div>
            <span class="fd-economy__muted">{t("rf.depot.seasonalPricing")}</span>
            <strong>
              {settings.seasonalPricing === false ? t("economy.rf.off") : t("economy.rf.on")}
            </strong>
          </div>
          <div>
            <span class="fd-economy__muted">{t("storage.rfDepot.depotCount", { count: depots.length })}</span>
            <strong>{depots.length}</strong>
          </div>
          <div>
            <span class="fd-economy__muted">{t("storage.rfDepot.openOrders")}</span>
            <strong>{orders.length}</strong>
          </div>
        </div>
      ) : null}

      {depots.length === 0 ? (
        <p class="fd-muted-sm">{t("storage.rfDepot.empty")}</p>
      ) : (
        <div class="fd-rf-depot__grid">
          {depots.map((d) => (
            <DepotCard key={d.id} depot={d} maxRows={maxRows} />
          ))}
        </div>
      )}

      {orders.length > 0 ? (
        <div class="fd-rf-depot__orders">
          <h4>{t("storage.rfDepot.openOrders")}</h4>
          <ul>
            {orders.map((o) => (
              <li key={o.id}>
                <span>{o.summary}</span>
                {o.status ? <Badge>{o.status}</Badge> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : variant === "page" ? (
        <p class="fd-muted-sm">{tOr("rf.depot.noOrders", "No open orders.")}</p>
      ) : null}

      {variant === "storage" ? (
        <div class="fd-rf-depot__actions">
          <Button variant="ghost" onClick={() => setSection("fertilizerdepot")}>
            {t("storage.rfDepot.openPage")}
          </Button>
        </div>
      ) : (
        <p class="fd-muted-sm">
          {t("storage.rfDepot.depotCount", { count: depots.length })}
        </p>
      )}
    </Card>
  );
}
