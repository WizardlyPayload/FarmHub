import { useEffect, useState } from "preact/hooks";
import { t, tOr } from "@/i18n/i18n";
import { isPublicDemoHost } from "@/platform/viewer-mode";

const SPLASH_BG = "/assests/img/Dashboard%20PIctures/Background.png";
const SPLASH_LOGO = "/assests/img/Dashboard%20PIctures/logo.png";

interface Props {
  /** True once first /api/data (or error) bootstrap finished. */
  dataReady: boolean;
  onDismissed: () => void;
}

/**
 * Brand splash with progress bar. Holds at least ~5s locally (shorter for remote/demo),
 * matching legacy splash-screen.js.
 */
export function SplashScreen({ dataReady, onDismissed }: Props) {
  const [logoFailed, setLogoFailed] = useState(false);
  const [progressDone, setProgressDone] = useState(false);
  const [fading, setFading] = useState(false);
  const startedAt = useState(() => Date.now())[0];
  const isDemo = isPublicDemoHost();
  const isRemote =
    typeof window !== "undefined" && !!window.__farmDashRemoteViewer;

  useEffect(() => {
    if (!dataReady) return;
    let cancelled = false;
    const elapsed = Date.now() - startedAt;
    const minMs = isRemote ? 400 : dataReady ? 400 : 800;
    const maxFromStart = 14000;
    let delay = 0;
    if (elapsed < minMs) delay = minMs - elapsed;
    if (elapsed + delay > maxFromStart) delay = Math.max(0, maxFromStart - elapsed);

    const t1 = window.setTimeout(() => {
      if (cancelled) return;
      setProgressDone(true);
      window.setTimeout(() => {
        if (cancelled) return;
        setFading(true);
        window.setTimeout(() => {
          if (!cancelled) onDismissed();
        }, 500);
      }, 320);
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(t1);
    };
  }, [dataReady, startedAt, isRemote, onDismissed]);

  // Safety: never stuck forever if bootstrap hangs
  useEffect(() => {
    const t = window.setTimeout(() => {
      setProgressDone(true);
      setFading(true);
      window.setTimeout(() => onDismissed(), 500);
    }, 18000);
    return () => window.clearTimeout(t);
  }, [onDismissed]);

  return (
    <div
      class={`fd-splash ${fading ? "is-fading" : ""}`}
      role="status"
      aria-live="polite"
      aria-busy={!fading}
    >
      <div class="fd-splash__bg" style={{ backgroundImage: `url('${SPLASH_BG}')` }} aria-hidden="true" />
      <div class="fd-splash__scrim" aria-hidden="true" />
      <div class="fd-splash__inner">
        <div class="fd-splash__panel">
          <div class="fd-splash__icon-wrap">
            {!logoFailed ? (
              <img
                class="fd-splash__logo"
                src={SPLASH_LOGO}
                width={128}
                height={128}
                alt=""
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <div class="fd-splash__logo-fallback" aria-hidden="true">
                FD
              </div>
            )}
          </div>
          <h1 class="fd-splash__title">{tOr("nav.brand", "Farm Dashboard")}</h1>
          <p class="fd-splash__loading">{t("splash.loading")}</p>
          <div class="fd-splash__progress">
            <div
              class={`fd-splash__progress-bar ${progressDone ? "is-done" : ""}`}
            />
          </div>
          {isDemo ? (
            <p class="fd-splash__demo-hint">{t("demo.splashHint")}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
