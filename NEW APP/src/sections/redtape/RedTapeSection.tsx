import { t } from "@/i18n/i18n";
import { Badge, Card } from "@/components/ui";
import { useDashboardStore } from "@/store/dashboard-store";
import type { DashboardPayload } from "@/types/dashboard";
import {
  asArray,
  formatMoney as rtFormatMoney,
  getCropRotationRows,
  getRedTapeForActiveFarm,
  isRedTapeModActive,
  rtLabel,
  tierTone,
  type RedTapeEvent,
  type RedTapeGrant,
  type RedTapePayload,
  type RedTapePolicy,
  type RedTapeScheme,
  type RedTapeTaxStatement,
} from "@/lib/redTape";
import "@/sections/economy/economy.css";

function RedTapeTab({ payload, farmId }: { payload: DashboardPayload; farmId: number }) {
  const redTape = payload.redTape as RedTapePayload | null | undefined;
  if (!isRedTapeModActive(redTape)) {
    return (
      <div class="fd-economy__empty">
        <h3>{t("redtape.subtitleDisabled")}</h3>
        <p>{t("redtape.hintDisabled")}</p>
      </div>
    );
  }

  const farm = getRedTapeForActiveFarm(redTape, farmId);
  if (!farm) {
    return <div class="fd-economy__empty">{t("redtape.subtitleEmpty")}</div>;
  }

  const policies = asArray<RedTapePolicy>(farm.policies);
  const activeSchemes = asArray<RedTapeScheme>(farm.activeSchemes);
  const availableSchemes = asArray<RedTapeScheme>(farm.availableSchemes);
  const rotation = getCropRotationRows(farm.cropRotation);
  const grants = asArray<RedTapeGrant>(farm.grants);
  const events = asArray<RedTapeEvent>(farm.events);
  const tax = farm.tax;
  const statements = asArray<RedTapeTaxStatement>(tax?.statements);

  return (
    <div>
      <p class="fd-economy__muted">{t("redtape.subtitleFarm", { farmId, tier: farm.tier || "D" })}</p>
      <div class="fd-economy__stats">
        <div>
          <span class="fd-economy__muted">{t("redtape.tierLabel")}</span>
          <Badge tone={tierTone(farm.tier)}>{String(farm.tier || "D").toUpperCase()}</Badge>
        </div>
        <div>
          <span class="fd-economy__muted">{t("redtape.pointsLabel")}</span>
          <strong>{Number(farm.points) || 0}</strong>
        </div>
        <div>
          <span class="fd-economy__muted">{t("redtape.policiesLabel")}</span>
          <strong>{policies.length}</strong>
        </div>
      </div>

      <Card title={t("redtape.policiesTitle")}>
        {policies.length === 0 ? (
          <p class="fd-economy__muted">{t("redtape.noPolicies")}</p>
        ) : (
          <div class="fd-economy__table-wrap">
            <table class="fd-economy__table">
              <thead>
                <tr>
                  <th>{t("redtape.colPolicy")}</th>
                  <th>{t("redtape.colWarnings")}</th>
                  <th>{t("redtape.colWatched")}</th>
                  <th>{t("redtape.colNextEval")}</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p, i) => (
                  <tr key={i}>
                    <td>{rtLabel(p.nameKey, `Policy ${p.policyIndex ?? ""}`)}</td>
                    <td>{Number(p.warnings) || 0}</td>
                    <td>{p.watched ? <Badge tone="warn">{t("redtape.watched")}</Badge> : "—"}</td>
                    <td>{p.nextEvaluationMonth != null ? String(p.nextEvaluationMonth) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={t("redtape.cropRotationTitle")}>
        {rotation.length === 0 ? (
          <p class="fd-economy__muted">{t("redtape.noCropRotation")}</p>
        ) : (
          <div class="fd-economy__table-wrap">
            <table class="fd-economy__table">
              <thead>
                <tr>
                  <th>{t("redtape.colFarmland")}</th>
                  <th>{t("redtape.colCropPrev4")}</th>
                  <th>{t("redtape.colCropPrev3")}</th>
                  <th>{t("redtape.colCropPrev2")}</th>
                  <th>{t("redtape.colCropPrev1")}</th>
                  <th>{t("redtape.colCropRecent")}</th>
                </tr>
              </thead>
              <tbody>
                {rotation.map((row) => (
                  <tr key={String(row.farmlandId)}>
                    <td>{t("redtape.farmlandLabel", { id: row.farmlandId })}</td>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <td key={i}>{row.crops[i] && String(row.crops[i]).trim() ? row.crops[i] : "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div class="fd-economy__schemes">
        <Card title={t("redtape.activeSchemesTitle")}>
          {activeSchemes.length === 0 ? (
            <p class="fd-economy__muted">{t("redtape.noActiveSchemes")}</p>
          ) : (
            <ul class="fd-economy__list">
              {activeSchemes.map((s, i) => (
                <li key={i}>
                  <span>
                    {rtLabel(s.nameKey, `Scheme ${s.schemeIndex ?? ""}`)}
                    {s.tier ? <> <Badge>{s.tier}</Badge></> : null}
                  </span>
                  {s.watched ? <Badge tone="default">{t("redtape.watched")}</Badge> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={t("redtape.availableSchemesTitle")}>
          {availableSchemes.length === 0 ? (
            <p class="fd-economy__muted">{t("redtape.noAvailableSchemes")}</p>
          ) : (
            <ul class="fd-economy__list">
              {availableSchemes.map((s, i) => (
                <li key={i}>
                  <span>
                    {rtLabel(s.nameKey, `Scheme ${s.schemeIndex ?? ""}`)}
                    {s.tier ? <> <Badge>{s.tier}</Badge></> : null}
                  </span>
                  {s.watched ? <Badge tone="default">{t("redtape.watched")}</Badge> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {tax ? (
        <Card title={t("redtape.taxTitle")}>
          <p class="fd-economy__muted">
            {t("redtape.taxCurrentMonth", {
              income: rtFormatMoney(tax.currentMonthIncome),
              expenses: rtFormatMoney(tax.currentMonthExpenses),
            })}
          </p>
          <div class="fd-economy__table-wrap">
            <table class="fd-economy__table">
              <thead>
                <tr>
                  <th>{t("redtape.colMonth")}</th>
                  <th class="text-end">{t("redtape.colTaxable")}</th>
                  <th class="text-end">{t("redtape.colTax")}</th>
                  <th>{t("redtape.colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {statements.length === 0 ? (
                  <tr>
                    <td colSpan={4} class="fd-economy__muted">
                      {t("redtape.noTaxStatements")}
                    </td>
                  </tr>
                ) : (
                  statements.map((s, i) => (
                    <tr key={i}>
                      <td>{s.month ?? "—"}</td>
                      <td class="text-end">{rtFormatMoney(s.totalTaxableIncome)}</td>
                      <td class="text-end">{rtFormatMoney(s.totalTax)}</td>
                      <td>
                        {s.paid ? (
                          <Badge tone="accent">{t("redtape.paid")}</Badge>
                        ) : (
                          <Badge tone="warn">{t("redtape.unpaid")}</Badge>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {grants.length > 0 ? (
        <Card title={t("redtape.grantsTitle")}>
          <ul class="fd-economy__list">
            {grants.map((g, i) => (
              <li key={i}>
                <span>{g.grantId || g.xmlFilename || "—"}</span>
                <span>
                  {g.status || "—"} · {rtFormatMoney(g.approvedAmount ?? g.requestedAmount)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {events.length > 0 ? (
        <Card title={t("redtape.eventsTitle")}>
          <ul class="fd-economy__list">
            {events.map((ev, i) => {
              const when = [ev.month, ev.year].filter((x) => x != null).join("/") || "—";
              return (
                <li key={i}>
                  <span class="fd-economy__muted">{when}</span>
                  <span>{rtLabel(ev.typeKey, ev.detail || t("redtape.eventFallback"))}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}


export function RedTapeSection() {
  const payload = useDashboardStore((s) => s.payload);
  const farmId = useDashboardStore((s) => s.activeFarmId) ?? 1;
  if (!payload || payload.error) {
    return (
      <div class="fd-economy">
        <header class="fd-section-header">
          <h2>{t("nav.mod.redtape")}</h2>
          <p class="fd-muted-sm">{t("redtape.hintDisabled")}</p>
        </header>
      </div>
    );
  }
  return (
    <div class="fd-economy">
      <header class="fd-section-header">
        <h2>{t("nav.mod.redtape")}</h2>
      </header>
      <RedTapeTab payload={payload} farmId={farmId} />
    </div>
  );
}

export { RedTapeTab };
