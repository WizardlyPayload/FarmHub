import { useEffect, useState } from "preact/hooks";
import { t } from "@/i18n/i18n";
import { Badge, Button } from "@/components/ui";
import { useDashboardStore } from "@/store/dashboard-store";
import { fetchSetupStatus } from "@/lib/setup-status";
import type { SetupStatus } from "@/lib/ux-state";
import { formatFetchedAt, readFreshness } from "@/lib/ux-freshness";
import "@/components/ux/ux.css";

interface Props {
  appVersion: string;
  onRestoreLan?: () => void;
}

export function HealthPane({ appVersion, onRestoreLan }: Props) {
  const payload = useDashboardStore((s) => s.payload);
  const locale = useDashboardStore((s) => s.locale);
  const [status, setStatus] = useState<SetupStatus | null>(null);

  useEffect(() => {
    void fetchSetupStatus().then(setStatus);
  }, []);

  const diag = (payload as { diagnostics?: Record<string, unknown> } | null)?.diagnostics;
  const ts = payload?.dataTimestamps || {};
  const health = ts.collectionHealth as
    | { collectionDurationMs?: number; sourceLagSeconds?: number; parseErrors?: { file?: string; error?: string }[] }
    | undefined;
  const freshness = readFreshness(payload);
  const parseErrors = Array.isArray(health?.parseErrors) ? health.parseErrors : [];
  const missing = Array.isArray(diag?.missingDependencies) ? (diag?.missingDependencies as string[]) : [];

  return (
    <>
      <h3>{t("ux.health.title")}</h3>
      <p>
        {t("settings.aboutAppVersionLabel")}: <strong>{appVersion}</strong>
      </p>
      <p>
        {t("ux.health.modVersion")}: <strong>{String(diag?.modVersion || payload?.modVersionCheck?.actual || "—")}</strong>
      </p>
      <p>
        {t("ux.health.gameVersion")}: <strong>{String(diag?.gameVersion || "—")}</strong>
      </p>
      <p>
        {t("ux.health.lastExport")}:{" "}
        <strong>
          {formatFetchedAt(ts.lastLuaReceivedAt ? String(ts.lastLuaReceivedAt) : freshness.fetchedAt, locale) || "—"}
        </strong>
      </p>
      <p>
        {t("ux.health.lastXml")}:{" "}
        <strong>{formatFetchedAt(ts.lastXmlReceivedAt ? String(ts.lastXmlReceivedAt) : null, locale) || "—"}</strong>
      </p>
      <p>
        {t("ux.health.compatible")}:{" "}
        <Badge tone={diag?.compatible === false ? "danger" : "accent"}>
          {diag?.compatible === false ? t("ux.health.incompatible") : t("ux.health.compatible")}
        </Badge>
      </p>
      <p>
        {t("ux.health.missingDeps")}: <strong>{missing.length ? missing.join(", ") : t("ux.health.none")}</strong>
      </p>
      <p>
        {t("ux.health.collectionMs")}: <strong>{health?.collectionDurationMs ?? "—"}</strong>
      </p>
      <p>
        {t("ux.health.sourceLag")}: <strong>{health?.sourceLagSeconds ?? "—"}</strong>
      </p>
      {parseErrors.length ? (
        <ul>
          {parseErrors.map((err, i) => (
            <li key={`${err.file}-${i}`}>
              {err.file}: {err.error}
            </li>
          ))}
        </ul>
      ) : (
        <p class="fd-settings__hint">{t("ux.health.parseErrors")}: {t("ux.health.none")}</p>
      )}

      <h3>{t("ux.events.title")}</h3>
      <ul class="fd-helper__events">
        {(status?.recentEvents || []).map((ev) => (
          <li key={`${ev.at}-${ev.code}`}>
            {ev.at} · {ev.code} · {ev.message}
          </li>
        ))}
      </ul>
      {onRestoreLan ? (
        <p>
          <Button variant="ghost" onClick={onRestoreLan}>
            {t("ux.lan.restoreDefault")}
          </Button>
        </p>
      ) : null}
    </>
  );
}
