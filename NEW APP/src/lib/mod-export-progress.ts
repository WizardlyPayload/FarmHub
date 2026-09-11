/** Shared mod-shop image export progress (NEW APP modal, not OS dialogs). */

import { t, tOr } from "@/i18n/i18n";
import { getFarmDashApi } from "@/services/electron-bridge";

const MAX_LOG_LINES = 450;

export interface ModExportProgressPayload {
  type?: string;
  totalSteps?: number;
  folderCount?: number;
  zipCount?: number;
  current?: number;
  total?: number;
  phase?: string;
  label?: string;
  line?: string;
  exitCode?: number;
  ok?: boolean;
  boxType?: "info" | "warning" | "error" | string;
  message?: string;
  detail?: string;
}

export interface ModExportUiState {
  open: boolean;
  running: boolean;
  percent: number | null;
  status: string;
  log: string;
  resultMessage: string;
  resultDetail: string;
  resultOk: boolean;
  resultBoxType: "info" | "warning" | "error";
}

const INITIAL: ModExportUiState = {
  open: false,
  running: false,
  percent: null,
  status: "",
  log: "",
  resultMessage: "",
  resultDetail: "",
  resultOk: true,
  resultBoxType: "info",
};

let state: ModExportUiState = { ...INITIAL };
const listeners = new Set<(next: ModExportUiState) => void>();
let exportLock = false;

function emit() {
  for (const cb of listeners) cb(state);
}

function setState(patch: Partial<ModExportUiState>) {
  state = { ...state, ...patch };
  emit();
}

function appendLog(line: string) {
  const next = state.log ? `${state.log}\n${line}` : line;
  const lines = next.split("\n");
  setState({
    log: lines.length > MAX_LOG_LINES ? lines.slice(-MAX_LOG_LINES).join("\n") : next,
  });
}

export function getModExportState(): ModExportUiState {
  return state;
}

export function subscribeModExportState(cb: (next: ModExportUiState) => void): () => void {
  listeners.add(cb);
  cb(state);
  return () => {
    listeners.delete(cb);
  };
}

export function closeModExportDialog() {
  if (state.running) return;
  setState({ ...INITIAL });
}

function applyProgress(data: ModExportProgressPayload | null | undefined) {
  if (!data || typeof data !== "object") return;
  if (data.type === "init") {
    const folders = data.folderCount ?? 0;
    const zips = data.zipCount ?? 0;
    const steps = data.totalSteps ?? 0;
    setState({
      percent: steps > 0 ? 0 : null,
      status: t("modExport.initSummary", { folders, zips, steps }),
    });
    return;
  }
  if (data.type === "step") {
    const cur = data.current || 0;
    const tot = Math.max(1, data.total || 1);
    const pct = Math.min(100, Math.round((100 * cur) / tot));
    const phase =
      data.phase === "zip" ? t("modExport.phaseZip") : t("modExport.phaseFolder");
    const name = String(data.label || "").slice(0, 140);
    setState({
      percent: pct,
      status: t("modExport.stepLine", {
        phase,
        current: cur,
        total: tot,
        name: name || "—",
      }),
    });
    return;
  }
  if (data.type === "log" && data.line) {
    appendLog(data.line);
    return;
  }
  if (data.type === "done") {
    setState({ status: t("modExport.finishing") });
    return;
  }
  if (data.type === "result") {
    const box =
      data.boxType === "error" || data.boxType === "warning" || data.boxType === "info"
        ? data.boxType
        : data.ok === false
          ? "error"
          : "info";
    setState({
      running: false,
      percent: data.ok === false ? state.percent : 100,
      resultOk: data.ok !== false,
      resultBoxType: box,
      resultMessage: String(data.message || ""),
      resultDetail: String(data.detail || ""),
      status: String(data.message || t("modExport.finishing")),
    });
  }
}

export async function startModStoreImageExport(): Promise<unknown> {
  const api = getFarmDashApi();
  if (!api?.exportModStoreImages) {
    throw new Error(t("setup.toastModScanPcOnly"));
  }
  if (exportLock) return;
  exportLock = true;
  setState({
    ...INITIAL,
    open: true,
    running: true,
    percent: null,
    status: tOr("modExport.startingPs", "Starting PowerShell…"),
  });

  const unsub =
    typeof api.subscribeExportModStoreImagesProgress === "function"
      ? api.subscribeExportModStoreImagesProgress((payload) => {
          applyProgress(payload as ModExportProgressPayload);
        })
      : () => undefined;

  try {
    const result = await api.exportModStoreImages({ suppressNativeDialog: true });
    if (state.running) {
      const rec = result && typeof result === "object" ? (result as Record<string, unknown>) : null;
      const ok = rec?.ok !== false;
      setState({
        running: false,
        percent: ok ? 100 : state.percent,
        resultOk: ok,
        resultBoxType: ok ? "info" : "error",
        resultMessage: String(rec?.error || rec?.message || t("modExport.finishing")),
        status: String(rec?.error || rec?.message || t("modExport.finishing")),
      });
    }
    return result;
  } catch (err) {
    const msg = String((err as Error)?.message || err);
    setState({
      running: false,
      resultOk: false,
      resultBoxType: "error",
      resultMessage: msg,
      status: msg,
    });
    throw err;
  } finally {
    unsub();
    exportLock = false;
  }
}
