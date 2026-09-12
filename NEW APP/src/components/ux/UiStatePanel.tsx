import type { ComponentChildren } from "preact";
import { t, tOr } from "@/i18n/i18n";
import { Button } from "@/components/ui";
import {
  actionCopyKey,
  errorCopyKey,
  titleKeyForState,
  type ModuleUiState,
  type UiStateKind,
} from "@/lib/ux-state";
import "@/components/ux/ux.css";

interface Props {
  ui: ModuleUiState;
  title?: string;
  body?: string;
  nextAction?: string | null;
  onRetry?: () => void;
  onRefresh?: () => void;
  children?: ComponentChildren;
}

function Skeleton() {
  return (
    <div class="fd-skeleton" aria-hidden="true">
      <div class="fd-skeleton__line fd-skeleton__line--short" />
      <div class="fd-skeleton__line" />
      <div class="fd-skeleton__card" />
    </div>
  );
}

export function UiStatePanel({ ui, title, body, nextAction, onRetry, onRefresh, children }: Props) {
  const kind: UiStateKind = ui.state;
  if (kind === "success") return <>{children}</>;

  const heading = title || tOr(titleKeyForState(kind), kind);
  const copy =
    body ||
    (ui.errorCode ? tOr(errorCopyKey(ui.errorCode), "") : "") ||
    tOr(titleKeyForState(kind), "");
  const actionKey = actionCopyKey(nextAction);
  const actionLabel = actionKey ? tOr(actionKey, nextAction || "") : null;
  const showRetry = kind === "error" || kind === "stale";
  const polite = kind === "loading" || kind === "pending";

  return (
    <div
      class={`fd-uistate fd-uistate--${kind}`}
      role={kind === "error" ? "alert" : "status"}
      aria-live={polite ? "polite" : "assertive"}
      aria-busy={kind === "pending" ? "true" : undefined}
    >
      {kind === "loading" ? <Skeleton /> : null}
      <h3 class="fd-uistate__title">{heading}</h3>
      {copy ? <p class="fd-uistate__body">{copy}</p> : null}
      {actionLabel ? <p class="fd-uistate__body">{actionLabel}</p> : null}
      {showRetry ? (
        <div class="fd-uistate__actions">
          {onRetry ? (
            <Button onClick={onRetry} aria-label={t("ux.a11y.retry")}>
              {t("ux.state.retry")}
            </Button>
          ) : null}
          {onRefresh ? (
            <Button variant="ghost" onClick={onRefresh} aria-label={t("ux.a11y.refresh")}>
              {t("ux.state.refresh")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
