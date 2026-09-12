import { useEffect, useState } from "preact/hooks";
import { tOr } from "@/i18n/i18n";
import { Button } from "@/components/ui";
import { useFocusTrap } from "@/lib/use-focus-trap";
import {
  farmdashClearLanHttpBasic,
  farmdashHasLanHttpBasic,
  farmdashSetLanHttpBasic,
  probeRemoteDashboardBootstrap,
  resolveLanAuthGate,
  verifyLanCredentials,
  type LanVerifyKind,
} from "@/services/lan-auth";
import { isFarmDashLocalConfigHost } from "@/platform/viewer-mode";
import "@/platform/platform.css";

interface Props {
  onAuthenticated?: () => void;
}

function setLanAuthPendingUi(pending: boolean) {
  try {
    if (!document.body || !window.__farmDashRemoteViewer) return;
    document.body.classList.toggle("farmdash-lan-auth-pending", pending);
  } catch {
    /* ignore */
  }
}

function messageForKind(kind: LanVerifyKind, stale: boolean): string {
  if (kind === "auth") {
    return stale
      ? tOr(
          "lan.authStale",
          "Saved LAN login was rejected. Enter the current username and password from Farm Dashboard Settings on the PC.",
        )
      : tOr(
          "lan.authRejected",
          "That username/password was rejected by the host. Check LAN login in Farm Dashboard Settings on the PC.",
        );
  }
  return tOr(
    "lan.authUnreachable",
    "Could not reach the dashboard API from this browser. Check Wi‑Fi and that the PC app is running.",
  );
}

export function LanAuthOverlay({ onAuthenticated }: Props) {
  const [visible, setVisible] = useState(false);
  const trapRef = useFocusTrap(visible, () => {});
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (isFarmDashLocalConfigHost() && !window.__farmDashRemoteViewer) {
        resolveLanAuthGate();
        return;
      }
      if (!window.__farmDashRemoteViewer) {
        resolveLanAuthGate();
        return;
      }
      if (farmdashHasLanHttpBasic()) {
        const result = await verifyLanCredentials();
        if (cancelled) return;
        if (result.kind === "ok") {
          setLanAuthPendingUi(false);
          resolveLanAuthGate();
          onAuthenticated?.();
          return;
        }
        farmdashClearLanHttpBasic();
        try {
          sessionStorage.setItem(
            "farmdash_last_error_code",
            result.kind === "auth" ? "E_AUTH_MISSING" : "E_NETWORK",
          );
        } catch {
          /* ignore */
        }
        setError(messageForKind(result.kind, true));
        setVisible(true);
        setLanAuthPendingUi(true);
        return;
      }
      const ok = await probeRemoteDashboardBootstrap(fetch, window.location.origin);
      if (cancelled) return;
      if (ok) {
        setLanAuthPendingUi(false);
        resolveLanAuthGate();
        onAuthenticated?.();
        return;
      }
      setVisible(true);
      setLanAuthPendingUi(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [onAuthenticated]);

  useEffect(() => {
    setLanAuthPendingUi(visible);
    return () => setLanAuthPendingUi(false);
  }, [visible]);

  if (!visible) return null;

  async function submit() {
    const u = user.trim();
    if (!u || !pass) return;
    setBusy(true);
    setError("");
    try {
      farmdashSetLanHttpBasic(u, pass);
      const result = await verifyLanCredentials();
      if (result.kind !== "ok") {
        farmdashClearLanHttpBasic();
        setError(messageForKind(result.kind, false));
        return;
      }
      setVisible(false);
      setLanAuthPendingUi(false);
      resolveLanAuthGate();
      onAuthenticated?.();
    } catch {
      farmdashClearLanHttpBasic();
      setError(messageForKind("network", false));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="fd-lan-overlay" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="fd-lan-auth-title">
      <div class="fd-lan-overlay__card">
        <h2 id="fd-lan-auth-title">{tOr("lan.authTitle", "LAN login")}</h2>
        <p class="fd-settings__hint">
          {tOr(
            "lan.authHint",
            "Enter the username and password from Farm Dashboard Settings on the host PC.",
          )}
        </p>
        <div class="fd-form-row">
          <label for="fd-lan-user">{tOr("settings.lanUserLabel", "LAN username")}</label>
          <input
            id="fd-lan-user"
            type="text"
            autocomplete="username"
            value={user}
            onInput={(e) => setUser((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                document.getElementById("fd-lan-pass")?.focus();
              }
            }}
          />
        </div>
        <div class="fd-form-row">
          <label for="fd-lan-pass">{tOr("settings.lanPassLabel", "LAN password")}</label>
          <input
            id="fd-lan-pass"
            type="password"
            autocomplete="current-password"
            value={pass}
            onInput={(e) => setPass((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </div>
        {error ? <p class="fd-lan-overlay__error">{error}</p> : null}
        <div style={{ marginTop: "0.75rem" }}>
          <Button onClick={() => void submit()}>
            {busy ? tOr("lan.authSigningIn", "Signing in…") : tOr("lan.authSubmit", "Sign in")}
          </Button>
        </div>
      </div>
    </div>
  );
}
