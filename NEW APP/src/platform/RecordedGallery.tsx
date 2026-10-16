import { tOr, LOCALE_NAMES } from "@/i18n/i18n";
import { useDashboardStore } from "@/store/dashboard-store";
import { DEMO_IDS } from "@/platform/demo-source";
import type { RecordedLoadStatus } from "@/platform/recorded-loader";

const STATUS_TEXT: Record<Exclude<RecordedLoadStatus, "ready">, { key: string; fallback: string }> = {
  missing: { key: "viewer.recordedMissing", fallback: "This recorded demo is not available." },
  invalid: { key: "viewer.recordedInvalid", fallback: "This recorded demo could not be read." },
  empty: { key: "viewer.recordedEmpty", fallback: "This recorded demo has no data in that section." },
  error: { key: "viewer.recordedError", fallback: "This recorded demo could not be loaded." },
};

/** Each link opens the demo's own published default section. */
export function RecordedGallery(props: { activeDemoId: string | null; status: RecordedLoadStatus }) {
  const locale = useDashboardStore((state) => state.locale);
  const setLocale = useDashboardStore((state) => state.setLocale);
  return (
    <nav class="fd-recorded-gallery" aria-label={tOr("viewer.recordedGallery", "Recorded demos")}>
      {DEMO_IDS.map((id) => (
        <a
          key={id}
          href={`?demo=${id}`}
          aria-current={id === props.activeDemoId ? "page" : undefined}
        >
          {id}
        </a>
      ))}
      <label>
        {tOr("theme.language", "Language")}
        <select data-recorded-locale value={locale} onChange={(event) => setLocale(event.currentTarget.value)}>
          {Object.entries(LOCALE_NAMES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
      </label>
    </nav>
  );
}

export function RecordedSourceNotice(props: {
  status: Exclude<RecordedLoadStatus, "ready">;
  demoId: string | null;
}) {
  const copy = STATUS_TEXT[props.status];
  return (
    <section class="fd-recorded-notice" role="alert">
      <h1>{tOr("viewer.recordedStrong", "Recorded demo")}</h1>
      <p>{props.demoId ? `${props.demoId}. ` : ""}{tOr(copy.key, copy.fallback)}</p>
    </section>
  );
}

export function RecordedDeepLinkNotice(props: { requested: string | null; shown: string }) {
  return (
    <p class="fd-recorded-notice fd-recorded-notice--link" role="status">
      {tOr(
        "viewer.recordedLinkFallback",
        "That section is not part of this recorded demo. Showing {{section}} instead.",
        { section: props.shown },
      ).split("{{section}}").join(props.shown)}
      {props.requested ? ` (${props.requested})` : ""}
    </p>
  );
}

export function RecordedOfflineNotice() {
  return (
    <p class="fd-recorded-notice fd-recorded-notice--offline" role="status">
      {tOr("viewer.recordedOffline", "Offline. Showing the copy of this recorded demo you already opened.")}
    </p>
  );
}
