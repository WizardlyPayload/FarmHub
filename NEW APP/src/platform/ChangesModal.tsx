import { useEffect, useState } from "preact/hooks";
import { t, tOr } from "@/i18n/i18n";
import { Button } from "@/components/ui";
import { useFocusTrap } from "@/lib/use-focus-trap";
import type { DataChanges } from "@/platform/changes";
import "@/platform/platform.css";

interface Props {
  changes: DataChanges | null;
  onClose: () => void;
}

export function ChangesModal({ changes, onClose }: Props) {
  const trapRef = useFocusTrap(!!changes, onClose);
  if (!changes) return null;

  const L = changes.livestock;

  return (
    <div class="fd-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        class="fd-modal"
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fd-changes-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="fd-modal__header">
          <h2 id="fd-changes-title">{t("changes.title")}</h2>
          <Button variant="ghost" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
        <div class="fd-modal__body">
          {!changes.hasAny ? (
            <p class="fd-settings__hint">{tOr("changes.none", "No significant changes since last refresh.")}</p>
          ) : (
            <>
              <p class="fd-settings__hint">{t("changes.intro")}</p>
              {L.added.length || L.removed.length || L.births.length || L.healthCritical.length ? (
                <section style={{ marginBottom: "1rem" }}>
                  <h3>{t("card.livestock")}</h3>
                  {L.added.length ? (
                    <p>
                      {t(
                        L.added.length === 1
                          ? "changes.toastAnimalAddedOne"
                          : "changes.toastAnimalAddedMany",
                        { count: L.added.length, ids: L.added.slice(0, 8).join(", ") },
                      )}
                    </p>
                  ) : null}
                  {L.removed.length ? (
                    <p>
                      {t(
                        L.removed.length === 1
                          ? "changes.toastAnimalRemovedOne"
                          : "changes.toastAnimalRemovedMany",
                        { count: L.removed.length, ids: L.removed.slice(0, 8).join(", ") },
                      )}
                    </p>
                  ) : null}
                  {L.births.map((id) => (
                    <p key={`b-${id}`}>{t("changes.historyBirthBody", { id })}</p>
                  ))}
                  {L.healthCritical.map((h) => (
                    <p key={`h-${h.id}`}>
                      {t("changes.toastHealthCritical", { name: h.name, health: h.health })}
                    </p>
                  ))}
                </section>
              ) : (
                <p class="fd-settings__hint">{t("changes.emptyLivestock")}</p>
              )}
              {changes.warnings.length ? (
                <section style={{ marginBottom: "1rem" }}>
                  <h3>{t("card.pasturesWarnings")}</h3>
                  {changes.warnings.map((w, i) => (
                    <p key={`w-${i}`}>
                      {w.pasture}: {w.message}
                    </p>
                  ))}
                </section>
              ) : (
                <p class="fd-settings__hint">{t("changes.emptyWarnings")}</p>
              )}
              {changes.food.length ? (
                <section style={{ marginBottom: "1rem" }}>
                  {changes.food.map((f, i) => (
                    <p key={`f-${i}`}>
                      {f.kind === "low"
                        ? t("changes.toastFoodLowAlert", {
                            pasture: f.pasture,
                            level: f.level ?? 0,
                          })
                        : t("changes.toastFoodDrop", { pasture: f.pasture, drop: f.drop ?? 0 })}
                    </p>
                  ))}
                </section>
              ) : null}
              {changes.statistics.length ? (
                <section>
                  {changes.statistics.map((s) => (
                    <p key={s.label}>
                      {s.label}: {s.from} → {s.to}
                    </p>
                  ))}
                </section>
              ) : (
                <p class="fd-settings__hint">{t("changes.emptyStats")}</p>
              )}
            </>
          )}
        </div>
        <div class="fd-modal__footer">
          <Button onClick={onClose}>{t("common.close")}</Button>
        </div>
      </div>
    </div>
  );
}

/** Toast stack for urgent alerts. */
export function ToastStack() {
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: string }>>([]);

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ message: string; type: string }>).detail;
      if (!detail?.message) return;
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message: detail.message, type: detail.type || "info" }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 6000);
    };
    window.addEventListener("farmdash-toast", handler);
    return () => window.removeEventListener("farmdash-toast", handler);
  }, []);

  if (!toasts.length) return null;

  return (
    <div class="fd-toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div class={`fd-toast fd-toast--${toast.type}`} key={toast.id}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

export function showToast(message: string, type = "info"): void {
  window.dispatchEvent(new CustomEvent("farmdash-toast", { detail: { message, type } }));
}
