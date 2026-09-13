import { t, tOr } from "@/i18n/i18n";
import { Button } from "@/components/ui";
import { actionCopyKey, errorCopyKey, type SetupStatus } from "@/lib/ux-state";
import { runSetupHandshake } from "@/lib/setup-status";
import { refreshDashboard } from "@/services/ws-client";
import { getFarmDashApi } from "@/services/electron-bridge";
import "@/components/ux/ux.css";

interface Props {
  status: SetupStatus | null;
  onUpdated?: (next: SetupStatus | null) => void;
  onOpenSettings?: () => void;
}

function actionHint(status: SetupStatus): string[] {
  const items: string[] = [];
  if (status.lastErrorCode) items.push(tOr(errorCopyKey(status.lastErrorCode), status.lastErrorCode));
  if (status.nextAction && status.nextAction !== "none") {
    items.push(tOr(actionCopyKey(status.nextAction), status.nextAction));
  }
  for (const step of status.steps || []) {
    if (step.state === "error" && step.errorCode) {
      items.push(tOr(errorCopyKey(step.errorCode), step.errorCode));
    }
  }
  return [...new Set(items)].slice(0, 4);
}

export function HelperPanel({ status, onUpdated, onOpenSettings }: Props) {
  if (!status || status.status === "ready") return null;
  if (status.status === "degraded" && status.lastErrorCode === "E_LUA_STALE") return null;
  const current = status;
  const hints = actionHint(current);
  const events = current.recentEvents || [];

  async function onHandshake() {
    const next = await runSetupHandshake();
    onUpdated?.(next);
    await refreshDashboard();
  }

  function onPrimary() {
    const action = current.nextAction;
    if (action === "open_setup") {
      getFarmDashApi()?.openSetup?.();
      return;
    }
    if (action === "add_server" || action === "check_mod" || action === "enable_firewall") {
      onOpenSettings?.();
      return;
    }
    void onHandshake();
  }

  return (
    <aside class="fd-helper" aria-label={t("ux.helper.title")}>
      <div class="fd-helper__row">
        <div>
          <h3 class="fd-helper__title">{t("ux.helper.title")}</h3>
          <p class="fd-helper__body">{t("ux.helper.whatToCheck")}</p>
          {hints.length ? (
            <ul class="fd-helper__list">
              {hints.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          ) : null}
          {events.length ? (
            <ul class="fd-helper__events" aria-label={t("ux.events.title")}>
              {events.map((ev) => (
                <li key={`${ev.at}-${ev.code}`}>
                  {ev.code}: {ev.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div class="fd-uistate__actions">
          <Button onClick={onPrimary}>{t("ux.setup.nextAction")}</Button>
          <Button variant="ghost" onClick={() => void onHandshake()}>
            {t("ux.setup.handshake")}
          </Button>
        </div>
      </div>
    </aside>
  );
}
