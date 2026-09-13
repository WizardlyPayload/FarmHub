import { useEffect, useState } from "preact/hooks";
import { t } from "@/i18n/i18n";
import { Button } from "@/components/ui";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { needsModActivationNotice } from "@/lib/connection-badge";
import { isFarmDashLocalConfigHost } from "@/platform/viewer-mode";
import { useDashboardStore } from "@/store/dashboard-store";

const DISMISS_PREFIX = "farmdash_mod_required_ok_";

function dismissKey(serverId: string): string {
  return DISMISS_PREFIX + serverId;
}

function isDismissed(serverId: string): boolean {
  try {
    return sessionStorage.getItem(dismissKey(serverId)) === "1";
  } catch {
    return false;
  }
}

function markDismissed(serverId: string) {
  try {
    sessionStorage.setItem(dismissKey(serverId), "1");
  } catch {
    /* private mode */
  }
}

function clearDismissed(serverId: string) {
  try {
    sessionStorage.removeItem(dismissKey(serverId));
  } catch {
    /* ignore */
  }
}

/** One-time notice when this save has XML but the in-game mod is not exporting. */
export function ModRequiredBanner() {
  const payload = useDashboardStore((s) => s.payload);
  const activeServerId = useDashboardStore((s) => s.activeServerId);
  const [open, setOpen] = useState(false);

  const sid = String(activeServerId || "");
  const luaAvailable = payload?.luaAvailable === true;
  const needed = needsModActivationNotice({
    activeServerId: sid || null,
    luaAvailable,
    dataSource: payload?.dataSource,
    xmlAvailable: payload?.xmlAvailable,
  });
  const remote = !isFarmDashLocalConfigHost();

  useEffect(() => {
    if (!sid) {
      setOpen(false);
      return;
    }
    if (luaAvailable) {
      clearDismissed(sid);
      setOpen(false);
      return;
    }
    if (!needed) {
      setOpen(false);
      return;
    }
    setOpen(!isDismissed(sid));
  }, [sid, luaAvailable, needed]);

  const trapRef = useFocusTrap(open, () => {
    if (sid) markDismissed(sid);
    setOpen(false);
  });

  if (!open) return null;

  return (
    <div class="fd-mod-required" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="fd-mod-required-title">
      <div class="fd-mod-required__panel">
        <h2 id="fd-mod-required-title">{t("modRequired.title")}</h2>
        {remote ? (
          <p>{t("modRequired.remoteLead")}</p>
        ) : (
          <>
            <p>{t("modRequired.lead")}</p>
            <ol class="fd-mod-required__steps">
              <li>{t("modRequired.step1")}</li>
              <li>{t("modRequired.step2")}</li>
              <li>{t("modRequired.step3")}</li>
              <li>{t("modRequired.step4")}</li>
            </ol>
          </>
        )}
        <Button
          onClick={() => {
            if (sid) markDismissed(sid);
            setOpen(false);
          }}
        >
          {t("modRequired.ok")}
        </Button>
      </div>
    </div>
  );
}
