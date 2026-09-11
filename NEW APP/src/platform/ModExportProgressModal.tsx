import { useEffect, useState } from "preact/hooks";
import { t, tOr } from "@/i18n/i18n";
import { Button } from "@/components/ui";
import { useFocusTrap } from "@/lib/use-focus-trap";
import {
  closeModExportDialog,
  subscribeModExportState,
  type ModExportUiState,
} from "@/lib/mod-export-progress";
import "@/platform/platform.css";

export function ModExportProgressModal() {
  const [state, setState] = useState<ModExportUiState>(() => ({
    open: false,
    running: false,
    percent: null,
    status: "",
    log: "",
    resultMessage: "",
    resultDetail: "",
    resultOk: true,
    resultBoxType: "info",
  }));

  useEffect(() => subscribeModExportState(setState), []);
  const trapRef = useFocusTrap(state.open, () => {
    if (!state.running) closeModExportDialog();
  });

  if (!state.open) return null;

  const done = !state.running;
  const pct = state.percent;
  const barWidth = pct == null ? "40%" : `${pct}%`;
  const title = done
    ? state.resultOk
      ? tOr("modExport.completeTitle", "Mod pictures ready")
      : tOr("modExport.failedTitle", "Mod picture scan failed")
    : t("modExport.title");

  return (
    <div class="fd-modal-backdrop fd-mod-export-backdrop" role="presentation">
      <div
        class="fd-modal fd-modal--narrow fd-mod-export"
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fd-mod-export-title"
        aria-busy={state.running ? "true" : "false"}
      >
        <div class="fd-modal__header">
          <h2 id="fd-mod-export-title">{title}</h2>
        </div>
        <div class="fd-modal__body">
          <p class="fd-mod-export__status">{state.status}</p>
          <div
            class={`fd-mod-export__track${pct == null && state.running ? " fd-mod-export__track--pulse" : ""}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct == null ? undefined : pct}
          >
            <div class="fd-mod-export__bar" style={{ width: barWidth }} />
          </div>
          {pct != null ? (
            <p class="fd-mod-export__pct">{t("modExport.percent", { pct })}</p>
          ) : state.running ? (
            <p class="fd-mod-export__pct">{tOr("modExport.working", "Working…")}</p>
          ) : null}

          {done && state.resultDetail ? (
            <pre class="fd-mod-export__detail">{state.resultDetail}</pre>
          ) : null}

          {state.log ? (
            <details class="fd-mod-export__log" open={done && !state.resultDetail}>
              <summary>{t("modExport.log")}</summary>
              <pre>{state.log}</pre>
            </details>
          ) : null}
        </div>
        {done ? (
          <div class="fd-modal__footer">
            <Button onClick={closeModExportDialog}>{t("common.close")}</Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
