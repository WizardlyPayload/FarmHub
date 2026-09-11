import { useMemo } from "preact/hooks";
import { Badge, Button, Card } from "@/components/ui";
import { t } from "@/i18n/i18n";
import {
  formatMoisturePercent,
  getBaleMoistureForFarm,
  getMoistureEnvironmentInfo,
  moistureGradeLabel,
  moistureRotLabel,
  moistureRotTone,
  type BaleMoistureFarmRow,
} from "@/lib/moisture";
import { useDashboardStore } from "@/store/dashboard-store";
import "@/sections/economy/economy.css";

export function MoistureSection() {
  const payload = useDashboardStore((s) => s.payload);
  const farmId = useDashboardStore((s) => s.activeFarmId) ?? 1;
  const setSection = useDashboardStore((s) => s.setSection);

  const env = useMemo(
    () =>
      getMoistureEnvironmentInfo(
        payload?.weather as {
          moisture?: {
            enabled?: boolean;
            currentPercent?: number;
            environment?: string;
            dryingActiveCount?: number;
            baleRotEnabled?: boolean;
          };
        },
      ),
    [payload?.weather],
  );

  const baleMoist = useMemo(
    () =>
      getBaleMoistureForFarm(
        payload?.baleInventory as { moisture?: { byFarm?: Record<string, BaleMoistureFarmRow> } },
        farmId,
      ),
    [payload?.baleInventory, farmId],
  );

  if (!env && !baleMoist) {
    return (
      <div class="fd-economy">
        <header class="fd-section-header">
          <h2>{t("nav.mod.moisture")}</h2>
          <p class="fd-muted-sm">{t("moisture.hintDisabled")}</p>
        </header>
      </div>
    );
  }

  return (
    <div class="fd-economy">
      <header class="fd-section-header">
        <h2>{t("nav.mod.moisture")}</h2>
        <p class="fd-muted-sm">{t("moisture.subtitle")}</p>
        <div class="fd-economy__mod-links">
          <Button variant="ghost" onClick={() => setSection("storage")}>
            {t("moisture.openStorage")}
          </Button>
          <Button variant="ghost" onClick={() => setSection("fields")}>
            {t("moisture.openFields")}
          </Button>
        </div>
      </header>

      {env ? (
        <div class="fd-economy__env">
          <Badge tone="default">{t("moisture.envMoisture", { pct: env.pct })}</Badge>
          {env.environment ? <Badge>{env.environment}</Badge> : null}
          {env.drying ? <Badge tone="accent">{env.drying}</Badge> : null}
          {env.rotOff ? <Badge tone="warn">{env.rotOff}</Badge> : null}
        </div>
      ) : null}

      {baleMoist ? (
        <Card title={t("moisture.baleSummaryTitle")} class="fd-economy__bale-moist">
          <div class="fd-economy__env">
            {Object.keys(baleMoist.gradeCounts || {})
              .sort()
              .map((g) => (
                <Badge key={g}>
                  {moistureGradeLabel(g)}: {(baleMoist.gradeCounts || {})[g]}
                </Badge>
              ))}
          </div>
          {(Number(baleMoist.rottingCount) || 0) > 0 || (Number(baleMoist.gettingWetCount) || 0) > 0 ? (
            <p class="fd-economy__warn">
              {t("moisture.baleRotSummary", {
                rotting: Number(baleMoist.rottingCount) || 0,
                wet: Number(baleMoist.gettingWetCount) || 0,
              })}
            </p>
          ) : null}
          {(baleMoist.worst || []).length > 0 ? (
            <div class="fd-economy__table-wrap">
              <table class="fd-economy__table">
                <thead>
                  <tr>
                    <th>{t("moisture.colFill")}</th>
                    <th>{t("moisture.colMoisture")}</th>
                    <th>{t("moisture.colGrade")}</th>
                    <th>{t("moisture.colRot")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(baleMoist.worst || []).map((row, i) => (
                    <tr key={i}>
                      <td>{row.fillType || "—"}</td>
                      <td>{formatMoisturePercent(row.moisturePct)}</td>
                      <td>{moistureGradeLabel(row.grade)}</td>
                      <td>
                        {row.rotStatus ? (
                          <Badge tone={moistureRotTone(row.rotStatus)}>{moistureRotLabel(row.rotStatus)}</Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      ) : (
        <p class="fd-economy__muted">{t("moisture.noBaleData")}</p>
      )}
    </div>
  );
}
