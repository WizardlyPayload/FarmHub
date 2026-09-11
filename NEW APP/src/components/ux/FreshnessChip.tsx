import { t, tOr } from "@/i18n/i18n";
import { Badge, Button } from "@/components/ui";
import { formatFetchedAt, readFreshness } from "@/lib/ux-freshness";
import type { DashboardPayload } from "@/types/dashboard";
import "@/components/ux/ux.css";

interface Props {
  payload: DashboardPayload | null | undefined;
  locale?: string;
  onRefresh?: () => void;
}

export function FreshnessChip({ payload, locale = "en", onRefresh }: Props) {
  const view = readFreshness(payload);
  if (!view.fetchedAt && !view.isStale) return null;
  const tone = view.confidence === "live" ? "accent" : view.confidence === "cache" ? "danger" : "warn";
  const label =
    view.confidence === "live"
      ? t("ux.freshness.live")
      : view.confidence === "cache"
        ? t("ux.freshness.cache")
        : t("ux.freshness.stale");
  const when = formatFetchedAt(view.fetchedAt, locale);
  const title = view.isStale
    ? tOr("ux.freshness.staleHint", "Showing last known data. Refresh when the game export is live.")
    : t("ux.freshness.updated", { when });

  return (
    <span class="fd-freshness">
      <Badge tone={tone} title={title}>
        {label}
        {when ? ` · ${when}` : ""}
      </Badge>
      {view.isStale && onRefresh ? (
        <Button variant="ghost" onClick={onRefresh} aria-label={t("ux.a11y.refresh")}>
          {t("ux.state.refresh")}
        </Button>
      ) : null}
    </span>
  );
}
