import { useEffect, useState } from "preact/hooks";
import { t, tOr } from "@/i18n/i18n";
import { Badge, Button } from "@/components/ui";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { UiStatePanel } from "@/components/ux/UiStatePanel";
import { buildModuleUiState } from "@/lib/ux-state";
import {
  clearNotificationHistory,
  getNotificationHistory,
  getTimeAgo,
  notificationTone,
  subscribeNotifications,
  type NotificationItem,
} from "@/platform/notifications";
import { TOPBAR_ICONS } from "@/app/section-meta";
import "@/platform/platform.css";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>(() => getNotificationHistory());
  const trapRef = useFocusTrap(open, () => setOpen(false));

  useEffect(() => subscribeNotifications(() => setItems(getNotificationHistory())), []);

  const count = items.length;

  return (
    <>
      <button
        type="button"
        class="fd-bell"
        aria-label={t("notif.title")}
        onClick={() => setOpen(true)}
      >
        <img
          class="fd-bell__icon"
          src={TOPBAR_ICONS.notifications}
          alt=""
          aria-hidden="true"
          width={18}
          height={18}
          draggable={false}
        />
        {count > 0 ? (
          <span class="fd-bell__count">{count > 99 ? "99+" : String(count)}</span>
        ) : null}
      </button>
      {open ? (
        <div class="fd-modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <div
            class="fd-modal fd-modal--narrow"
            ref={trapRef}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="fd-modal__header">
              <h2>{t("notif.title")}</h2>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t("common.close")}
              </Button>
            </div>
            <div class="fd-modal__body">
              {items.length === 0 ? (
                <UiStatePanel
                  ui={buildModuleUiState({ state: "empty", source: "unknown" })}
                  title={t("notifications.empty")}
                  body={t("ux.helper.whatToCheck")}
                />
              ) : (
                <div class="fd-notif-list">
                  {items.map((n, i) => (
                    <div class="fd-notif-item" key={`${n.timestamp}-${i}`}>
                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <Badge tone={notificationTone(n.type)}>{n.type || "info"}</Badge>
                        <div class="fd-notif-item__title">{n.title}</div>
                      </div>
                      {n.message ? <div class="fd-notif-item__msg">{n.message}</div> : null}
                      {n.timestamp ? (
                        <div class="fd-notif-item__time">{getTimeAgo(n.timestamp)}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div class="fd-modal__footer">
              <Button
                variant="ghost"
                onClick={() => {
                  clearNotificationHistory();
                }}
              >
                {t("notif.clear")}
              </Button>
              <Button onClick={() => setOpen(false)}>{tOr("common.close", "Close")}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
