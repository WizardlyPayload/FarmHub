import type { ComponentChildren } from "preact";
import { Badge, Card } from "@/components/ui";
import { t, tOr } from "@/i18n/i18n";
import {
  anyRfEconomyActive,
  formatRfDieselPrice,
  formatRfMoney,
  formatRfPct,
  fuelTrendTone,
  getRfIncomeForFarm,
  getRfTaxForFarm,
  getRfWorkerCostsForFarm,
  getRfWorkplacesForFarm,
  isRfFuelCostsActive,
  isRfIncomeActive,
  isRfMarketDynamicsActive,
  isRfTaxActive,
  isRfWorkerCostsActive,
  isRfWorkplaceTriggersActive,
  marketActiveEvents,
  marketFutures,
  marketMovers,
} from "@/lib/realisticFarming/economy";
import type { RealisticFarmingPayload } from "@/types/dashboard";

function MetaRow({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="fd-economy__meta-row">
      <span class="fd-economy__meta-label">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function TaxPanel({
  rf,
  farmId,
}: {
  rf: RealisticFarmingPayload;
  farmId: number;
}) {
  if (!isRfTaxActive(rf)) return null;
  const row = getRfTaxForFarm(rf, farmId);
  return (
    <Card title={t("economy.rf.tax.title")} class="fd-economy__rf-card">
      <MetaRow label={t("economy.rf.tax.accumulated")}>
        <strong>{formatRfMoney(row?.accumulatedAnnual)}</strong>
      </MetaRow>
      <MetaRow label={t("economy.rf.tax.projected")}>
        <strong>{formatRfMoney(row?.projectedBill)}</strong>
      </MetaRow>
      <MetaRow label={t("economy.rf.tax.rate")}>
        {row?.taxRate != null && Number.isFinite(row.taxRate)
          ? t("economy.rf.tax.rateValue", { rate: Number(row.taxRate).toFixed(0) })
          : "—"}
      </MetaRow>
      <MetaRow label={t("economy.rf.tax.nextEvent")}>
        {row?.nextEventLabel
          ? t("economy.rf.tax.nextEventValue", {
              label: row.nextEventLabel,
              months: row.nextEventDay ?? "—",
            })
          : "—"}
      </MetaRow>
    </Card>
  );
}

function FuelPanel({ rf }: { rf: RealisticFarmingPayload }) {
  if (!isRfFuelCostsActive(rf)) return null;
  const fuel = rf.fuelCosts;
  const trend = fuel?.trend ?? null;
  const trendLabel =
    trend === "up"
      ? t("economy.rf.fuel.trendUp")
      : trend === "down"
        ? t("economy.rf.fuel.trendDown")
        : trend === "flat"
          ? t("economy.rf.fuel.trendFlat")
          : tOr("common.unknown", "Unknown");
  return (
    <Card title={t("economy.rf.fuel.title")} class="fd-economy__rf-card">
      <MetaRow label={t("economy.rf.fuel.diesel")}>
        <strong>{formatRfDieselPrice(fuel?.dieselPrice)}</strong>
      </MetaRow>
      <MetaRow label={t("economy.rf.fuel.trend")}>
        <Badge tone={fuelTrendTone(trend)}>{trendLabel}</Badge>
      </MetaRow>
      <MetaRow label={t("economy.rf.fuel.lastChange")}>
        {formatRfPct(fuel?.lastChangePct)}
      </MetaRow>
    </Card>
  );
}

function IncomePanel({
  rf,
  farmId,
}: {
  rf: RealisticFarmingPayload;
  farmId: number;
}) {
  if (!isRfIncomeActive(rf)) return null;
  const row = getRfIncomeForFarm(rf, farmId);
  const enabled = row?.settingsEnabled === true;
  return (
    <Card title={t("economy.rf.income.title")} class="fd-economy__rf-card">
      <MetaRow label={t("economy.rf.income.status")}>
        <Badge tone={enabled ? "accent" : "default"}>
          {enabled ? t("economy.rf.income.enabled") : t("economy.rf.income.disabled")}
        </Badge>
      </MetaRow>
      <MetaRow label={t("economy.rf.income.mode")}>{row?.mode || "—"}</MetaRow>
      <MetaRow label={t("economy.rf.income.amount")}>
        <strong>{formatRfMoney(row?.amount)}</strong>
      </MetaRow>
      <MetaRow label={t("economy.rf.income.next")}>{row?.nextPayoutLabel || "—"}</MetaRow>
    </Card>
  );
}

function WorkersPanel({
  rf,
  farmId,
}: {
  rf: RealisticFarmingPayload;
  farmId: number;
}) {
  if (!isRfWorkerCostsActive(rf)) return null;
  const row = getRfWorkerCostsForFarm(rf, farmId);
  return (
    <Card title={t("economy.rf.workers.title")} class="fd-economy__rf-card">
      <MetaRow label={t("economy.rf.workers.active")}>
        <strong>{row?.activeWorkers ?? 0}</strong>
      </MetaRow>
      <MetaRow label={t("economy.rf.workers.mode")}>{row?.wageMode || "—"}</MetaRow>
      <MetaRow label={t("economy.rf.workers.rate")}>
        <strong>{formatRfMoney(row?.wageRate)}</strong>
      </MetaRow>
      <MetaRow label={t("economy.rf.workers.next")}>{row?.nextPaymentLabel || "—"}</MetaRow>
      <MetaRow label={t("economy.rf.workers.period")}>
        <strong>{formatRfMoney(row?.periodSpend)}</strong>
      </MetaRow>
    </Card>
  );
}

function WorkplacePanel({
  rf,
  farmId,
}: {
  rf: RealisticFarmingPayload;
  farmId: number;
}) {
  if (!isRfWorkplaceTriggersActive(rf)) return null;
  const workplaces = getRfWorkplacesForFarm(rf, farmId);
  return (
    <Card title={t("economy.rf.workplace.title")} class="fd-economy__rf-card">
      {workplaces.length === 0 ? (
        <p class="fd-economy__muted">{t("economy.rf.workplace.empty")}</p>
      ) : (
        <div class="fd-economy__rf-list">
          {workplaces.map((wp) => (
            <div class="fd-economy__rf-list-row" key={wp.id}>
              <span>
                {wp.name || wp.id}
                {wp.onClock ? (
                  <Badge tone="warn">{t("economy.rf.workplace.onClock")}</Badge>
                ) : null}
              </span>
              <strong>{formatRfMoney(wp.wage)}</strong>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function MarketDynamicsPanel({ rf }: { rf: RealisticFarmingPayload }) {
  if (!isRfMarketDynamicsActive(rf)) return null;
  const md = rf.marketDynamics;
  const events = marketActiveEvents(rf);
  const movers = marketMovers(rf);
  const futures = marketFutures(rf);

  return (
    <Card title={t("economy.rf.market.title")} class="fd-economy__rf-card fd-economy__rf-card--wide">
      <div class="fd-economy__rf-md-status">
        <Badge tone={md?.isActive ? "accent" : "default"}>
          {md?.isActive ? t("economy.rf.market.active") : t("economy.rf.market.inactive")}
        </Badge>
        <Badge tone={md?.pricesEnabled ? "accent" : "default"}>
          {t("economy.rf.market.prices")}:{" "}
          {md?.pricesEnabled ? t("economy.rf.on") : t("economy.rf.off")}
        </Badge>
        <Badge tone={md?.eventsEnabled ? "warn" : "default"}>
          {t("economy.rf.market.events")}:{" "}
          {md?.eventsEnabled ? t("economy.rf.on") : t("economy.rf.off")}
        </Badge>
        {md?.volatilityScale != null ? (
          <Badge>
            {t("economy.rf.market.volatility", {
              value: Number(md.volatilityScale).toFixed(1),
            })}
          </Badge>
        ) : null}
      </div>

      <h4 class="fd-economy__rf-subtitle">{t("economy.rf.market.activeEvents")}</h4>
      {events.length === 0 ? (
        <p class="fd-economy__muted">{t("economy.rf.market.noEvents")}</p>
      ) : (
        <div class="fd-economy__rf-list">
          {events.map((evt) => (
            <div class="fd-economy__rf-list-row" key={evt.id}>
              <span>{evt.name}</span>
              <span>
                {t("economy.rf.market.eventMeta", {
                  intensity: Math.round((Number(evt.intensity) || 0) * 100),
                  minutes: evt.remainingMin ?? "—",
                })}
              </span>
            </div>
          ))}
        </div>
      )}

      <h4 class="fd-economy__rf-subtitle">{t("economy.rf.market.movers")}</h4>
      {movers.length === 0 ? (
        <p class="fd-economy__muted">{t("economy.rf.market.noMovers")}</p>
      ) : (
        <div class="fd-economy__rf-list">
          {movers.map((m) => (
            <div class="fd-economy__rf-list-row" key={m.fillType}>
              <span>{m.fillType}</span>
              <span>
                {formatRfMoney(m.pricePer1000l)}{" "}
                <Badge tone={(m.pctFromBase ?? 0) >= 0 ? "accent" : "danger"}>
                  {formatRfPct(m.pctFromBase)}
                </Badge>
              </span>
            </div>
          ))}
        </div>
      )}

      {futures.length > 0 ? (
        <>
          <h4 class="fd-economy__rf-subtitle">{t("economy.rf.market.futures")}</h4>
          <div class="fd-economy__rf-list">
            {futures.map((f) => (
              <div class="fd-economy__rf-list-row" key={f.id}>
                <span>
                  {f.label}
                  {f.status ? <Badge>{f.status}</Badge> : null}
                </span>
                <span class="fd-economy__muted">{f.summary || ""}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </Card>
  );
}

export function RfEconomyPanels({
  rf,
  farmId,
}: {
  rf: RealisticFarmingPayload | null | undefined;
  farmId: number;
}) {
  if (!rf || !anyRfEconomyActive(rf)) return null;

  return (
    <section class="fd-economy__rf" aria-label={t("economy.rf.sectionLabel")}>
      <header class="fd-economy__rf-header">
        <h3>{t("economy.rf.sectionTitle")}</h3>
        <p>{t("economy.rf.sectionSubtitle")}</p>
      </header>
      <div class="fd-economy__rf-grid fd-economy__rf-grid--cards">
        <TaxPanel rf={rf} farmId={farmId} />
        <FuelPanel rf={rf} />
        <IncomePanel rf={rf} farmId={farmId} />
        <WorkersPanel rf={rf} farmId={farmId} />
        <WorkplacePanel rf={rf} farmId={farmId} />
      </div>
      <div class="fd-economy__rf-grid fd-economy__rf-grid--market">
        <MarketDynamicsPanel rf={rf} />
      </div>
    </section>
  );
}
