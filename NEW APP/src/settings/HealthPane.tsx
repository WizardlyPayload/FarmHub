import { useEffect, useState } from "preact/hooks";
import { t, tOr } from "@/i18n/i18n";
import { Badge, Button } from "@/components/ui";
import { useDashboardStore } from "@/store/dashboard-store";
import { fetchSetupStatus } from "@/lib/setup-status";
import type { SetupStatus } from "@/lib/ux-state";
import { formatFetchedAt } from "@/lib/ux-freshness";
import { readHealthClock } from "@/lib/health-clock";
import "@/components/ux/ux.css";

interface Props {
  appVersion: string;
  onRestoreLan?: () => void;
}

export function HealthPane({ appVersion, onRestoreLan }: Props) {
  const payload = useDashboardStore((s) => s.payload);
  const activeServerId = useDashboardStore((s) => s.activeServerId);
  const locale = useDashboardStore((s) => s.locale);
  const [status, setStatus] = useState<SetupStatus | null>(null);

  useEffect(() => {
    let active = true;
    setStatus(null);
    void fetchSetupStatus(activeServerId).then((next) => {
      if (active) setStatus(next);
    });
    return () => { active = false; };
  }, [activeServerId]);

  const diag = (payload as { diagnostics?: Record<string, unknown> } | null)?.diagnostics;
  const ts = payload?.dataTimestamps || {};
  const health = ts.collectionHealth as
    | { collectionDurationMs?: number; sourceLagSeconds?: number; parseErrors?: { file?: string; error?: string }[] }
    | undefined;
  const clock = readHealthClock(payload);
  const parseErrors = Array.isArray(health?.parseErrors) ? health.parseErrors : [];
  const missingRaw = diag?.missingDependencies;
  const missing = Array.isArray(missingRaw) ? missingRaw.map(String)
    : missingRaw && typeof missingRaw === "object"
      ? Object.entries(missingRaw).map(([key, value]) => typeof value === "string" ? value : key)
      : [];

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
          {formatFetchedAt(clock.lastExportAt, locale) || "—"}
        </strong>
      </p>
      <p>
        {tOr("ux.health.publishedAt", "Dashboard published")}: <strong>{formatFetchedAt(clock.publishedAt, locale) || "—"}</strong>
      </p>
      <p>
        {tOr("ux.health.xmlCollected", "XML collected")}:{" "}
        <strong>{formatFetchedAt(clock.xmlCollectedAt, locale) || "—"}</strong>
      </p>
      <p>
        {t("ux.health.compatible")}:{" "}
        <Badge tone={clock.compatibility === "attention" ? "danger" : clock.compatibility === "compatible" ? "accent" : "default"}>
          {clock.compatibility === "attention" ? t("ux.health.incompatible")
            : clock.compatibility === "compatible" ? t("ux.health.compatible") : tOr("ux.health.notChecked", "Not checked")}
        </Badge>
      </p>
      <p>
        {t("ux.health.missingDeps")}: <strong>{missing.length ? missing.join(", ") : diag ? t("ux.health.none") : "—"}</strong>
      </p>
      <p>
        {t("ux.health.collectionMs")}: <strong>{health?.collectionDurationMs ?? "—"}</strong>
      </p>
      <p>
        {tOr("ux.health.xmlAgeAtCollection", "Newest XML file age at collection (seconds)")}: <strong>{health?.sourceLagSeconds ?? "—"}</strong>
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
