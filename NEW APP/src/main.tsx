import { render } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";
import { Shell } from "@/app/Shell";
import { SplashScreen } from "@/components/SplashScreen";
import { LanAuthOverlay } from "@/platform/LanAuthOverlay";
import { initI18n, getLocale, configureLocalePreferences } from "@/i18n/i18n";
import { bootstrapRealtime } from "@/services/ws-client";
import { useDashboardStore } from "@/store/dashboard-store";
import {
  detectAndMarkRemoteViewer,
  farmdashWaitForLanHttpBasicIfNeeded,
  installLanHttpBasicFetchPatch,
} from "@/services/lan-auth";
import { loadThemes, applyThemeForSection } from "@/settings/theming";
import { demoWritesAreLocked, setDemoWritesLocked } from "@/platform/demo-source";
import type { DemoLibrary } from "@/platform/demo-source";
import {
  applyRecordedToState,
  recordedFeatureSection,
  recordedRoute,
  recordedSectionFromHash,
} from "@/platform/recorded-publication";
import {
  createFetchRecordedBytes,
  installRecordedNetworkGuard,
  loadRecordedForVisitor,
  openRecordedSession,
  recordedVisitorLocale,
  setRecordedVisitorLocale,
  type RecordedBytes,
  type RecordedLoadStatus,
} from "@/platform/recorded-loader";
import {
  RecordedDeepLinkNotice,
  RecordedGallery,
  RecordedOfflineNotice,
  RecordedSourceNotice,
} from "@/platform/RecordedGallery";
import type { SectionId } from "@/types/dashboard";
import "@/styles/global.css";

const RECORDED_SECTIONS: Record<string, SectionId> = {
  vehicles: "vehicles",
  fields: "fields",
  economy: "economy",
  pastures: "pastures",
  storage: "storage",
  productions: "productions",
};

let localeBound = false;
function lockRecorded(): void {
  setDemoWritesLocked(true);
  if (typeof window !== "undefined") {
    installRecordedNetworkGuard(window);
    if (!localeBound) {
      let store: Storage | null = null;
      try { store = window.sessionStorage; } catch { /* visitor memory remains usable */ }
      const visitorId = openRecordedSession(store).visitorId;
      configureLocalePreferences({
        catalogStore: store,
        read: () => recordedVisitorLocale(visitorId, store),
        write: (code) => { setRecordedVisitorLocale(visitorId, code, store); },
      });
      localeBound = true;
    }
  }
}

const openingRoute = recordedRoute(typeof window === "undefined" ? "" : window.location.search);
if (openingRoute.kind !== "live") {
  lockRecorded();
} else {
  detectAndMarkRemoteViewer();
  installLanHttpBasicFetchPatch();
}

export type RecordedDeepLink = { ok: true; section: string } | { ok: false; error: string; section: string; requested: string | null };

export type DashboardBoot =
  | { mode: "live" }
  | { mode: "stale" }
  | {
      mode: "recorded";
      status: RecordedLoadStatus;
      demoId: string | null;
      library: DemoLibrary | null;
      section?: SectionId;
      deepLink?: RecordedDeepLink;
      source?: "latest" | "pinned" | "offline";
    };

let bootSequence = 0;

/**
 * Each call takes a new token. After every await, and immediately before any
 * store, pin or navigation change, an older or cancelled boot stops without
 * applying anything.
 */
export async function startDashboardBoot(input?: {
  cancelled?: () => boolean;
  onLiveReady?: () => void;
  bytes?: RecordedBytes;
}): Promise<DashboardBoot> {
  const token = ++bootSequence;
  const stale = () => token !== bootSequence || input?.cancelled?.() === true;
  const search = window.location.search || "";
  const hash = window.location.hash || "";
  const route = recordedRoute(search);
  const recorded = demoWritesAreLocked()
    || useDashboardStore.getState().payload?.dataSource === "recorded-demo"
    || route.kind !== "live";
  if (route.kind === "denied") {
    lockRecorded();
    return { mode: "recorded", status: "invalid", demoId: null, library: null };
  }
  if (route.kind === "recorded") {
    lockRecorded();
    const session = openRecordedSession(window.sessionStorage);
    const loaded = await loadRecordedForVisitor(input?.bytes || createFetchRecordedBytes(), route.demoId, session);
    if (stale()) return { mode: "stale" };
    if (loaded.status !== "ready") {
      return { mode: "recorded", status: loaded.status, demoId: loaded.demoId, library: null };
    }
    const generation = loaded.generation;
    const requested = recordedSectionFromHash(hash);
    const resolved = recordedFeatureSection(generation.payload, generation.section, requested);
    const section = RECORDED_SECTIONS[resolved.section];
    if (!section) return { mode: "recorded", status: "empty", demoId: loaded.demoId, library: null };
    if (!resolved.ok && !requested) return { mode: "recorded", status: "empty", demoId: loaded.demoId, library: null };
    const next = applyRecordedToState(useDashboardStore.getState(), {
      capturedAt: generation.capturedAt,
      payload: generation.payload,
    });
    if (stale()) return { mode: "stale" };
    useDashboardStore.setState({
      payload: next.payload,
      lastUpdated: next.lastUpdated,
      connection: next.connection,
      activeFarmId: typeof generation.payload.activeFarmId === "number" ? generation.payload.activeFarmId : null,
    });
    useDashboardStore.getState().setSection(section);
    session.remember(route.demoId, loaded);
    return {
      mode: "recorded",
      status: "ready",
      demoId: loaded.demoId,
      section,
      source: loaded.source,
      deepLink: resolved.ok ? resolved : { ...resolved, requested },
      library: {
        pointer: null,
        pointers: { [loaded.demoId]: generation.id },
        generations: { [generation.id]: generation },
      },
    };
  }
  if (recorded) {
    lockRecorded();
    return { mode: "recorded", status: "ready", demoId: null, library: null };
  }
  for (let attempt = 0; attempt < 8 && !stale(); attempt += 1) {
    try {
      await bootstrapRealtime(() => input?.onLiveReady?.());
      return { mode: "live" };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, Math.min(8000, 750 * (attempt + 1))));
    }
  }
  return { mode: "live" };
}

function App() {
  const [boot, setBoot] = useState<DashboardBoot | null>(null);
  const [splashGone, setSplashGone] = useState(false);
  const onSplashDismissed = useCallback(() => setSplashGone(true), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (recordedRoute(window.location.search).kind === "live" && !demoWritesAreLocked()) {
        await farmdashWaitForLanHttpBasicIfNeeded();
      }
      await initI18n();
      if (cancelled) return;
      useDashboardStore.getState().setLocale(getLocale());
      applyThemeForSection(loadThemes(), "global");
      const result = await startDashboardBoot({ cancelled: () => cancelled });
      if (!cancelled && result.mode !== "stale") setBoot(result);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const recorded = boot?.mode === "recorded" ? boot : null;
  const failed = recorded != null && recorded.status !== "ready";
  const link = recorded?.deepLink && !recorded.deepLink.ok ? recorded.deepLink : null;
  return (
    <>
      <LanAuthOverlay />
      {recorded ? <RecordedGallery activeDemoId={recorded.demoId} status={recorded.status} /> : null}
      {recorded && recorded.status !== "ready" ? (
        <RecordedSourceNotice status={recorded.status} demoId={recorded.demoId} />
      ) : null}
      {link ? <RecordedDeepLinkNotice requested={link.requested} shown={link.section} /> : null}
      {recorded?.source === "offline" ? <RecordedOfflineNotice /> : null}
      {!failed && !splashGone ? (
        <SplashScreen dataReady={boot != null} onDismissed={onSplashDismissed} />
      ) : null}
      {!failed && splashGone ? <Shell /> : null}
    </>
  );
}

const appNode = typeof document === "undefined" ? null : document.getElementById("app");
if (appNode) render(<App />, appNode);
