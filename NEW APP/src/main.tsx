import { render } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";
import { Shell } from "@/app/Shell";
import { SplashScreen } from "@/components/SplashScreen";
import { LanAuthOverlay } from "@/platform/LanAuthOverlay";
import { initI18n, getLocale } from "@/i18n/i18n";
import { bootstrapRealtime } from "@/services/ws-client";
import { useDashboardStore } from "@/store/dashboard-store";
import {
  detectAndMarkRemoteViewer,
  farmdashWaitForLanHttpBasicIfNeeded,
  installLanHttpBasicFetchPatch,
} from "@/services/lan-auth";
import { loadThemes, applyThemeForSection } from "@/settings/theming";
import "@/styles/global.css";

detectAndMarkRemoteViewer();
installLanHttpBasicFetchPatch();

function App() {
  const [bootstrapped, setBootstrapped] = useState(false);
  const [splashGone, setSplashGone] = useState(false);

  const onSplashDismissed = useCallback(() => setSplashGone(true), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await farmdashWaitForLanHttpBasicIfNeeded();
      await initI18n();
      useDashboardStore.getState().setLocale(getLocale());
      applyThemeForSection(loadThemes(), "global");
      for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
        try {
          await bootstrapRealtime(() => setBootstrapped(true));
          break;
        } catch {
          await new Promise((r) => setTimeout(r, Math.min(8000, 750 * (attempt + 1))));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <LanAuthOverlay />
      {!splashGone ? (
        <SplashScreen dataReady={bootstrapped} onDismissed={onSplashDismissed} />
      ) : (
        <Shell />
      )}
    </>
  );
}

render(<App />, document.getElementById("app")!);
