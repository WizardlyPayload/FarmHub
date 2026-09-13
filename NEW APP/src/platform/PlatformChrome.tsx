import { useEffect, useState } from "preact/hooks";
import { NotificationBell } from "@/platform/NotificationBell";
import { DemoBanner } from "@/platform/DemoBanner";
import { ToastStack, ChangesModal } from "@/platform/ChangesModal";
import { ModExportProgressModal } from "@/platform/ModExportProgressModal";
import { UrgentAlertsWatcher } from "@/platform/UrgentAlertsWatcher";
import type { DataChanges } from "@/platform/changes";
import "@/platform/platform.css";

/** Shell-level platform chrome (notifications, demo, toasts, urgent watcher). */
export function PlatformChrome() {
  const [changes, setChanges] = useState<DataChanges | null>(null);

  useEffect(() => {
    const onChanges = (ev: Event) => {
      const detail = (ev as CustomEvent<DataChanges>).detail;
      if (detail) setChanges(detail);
    };
    window.addEventListener("farmdash-changes-modal", onChanges);
    return () => window.removeEventListener("farmdash-changes-modal", onChanges);
  }, []);

  return (
    <>
      <DemoBanner />
      <UrgentAlertsWatcher />
      <ToastStack />
      <ModExportProgressModal />
      {changes ? <ChangesModal changes={changes} onClose={() => setChanges(null)} /> : null}
    </>
  );
}

export { NotificationBell };

/** Open the changes modal from a manual refresh flow. */
export function openChangesModal(changes: DataChanges): void {
  window.dispatchEvent(new CustomEvent("farmdash-changes-modal", { detail: changes }));
}
