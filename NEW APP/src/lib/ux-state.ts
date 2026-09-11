/**
 * Module UI-state contract (mirrors FS25_FarmDashboard_App/uxContract.cjs).
 * Keep codes aligned with docs/UX-STATE-CONTRACT.md.
 */

export const UI_STATES = ["loading", "error", "empty", "success", "stale", "pending"] as const;
export type UiStateKind = (typeof UI_STATES)[number];

export const UX_ERROR_CODES = [
  "E_CONFIG_INCOMPLETE",
  "E_AUTH_MISSING",
  "E_INVALID_TOKEN",
  "E_LAN_BLOCKED",
  "E_LAN_TIMEOUT",
  "E_SETUP_LOCAL_ONLY",
  "E_SERVER_OFFLINE",
  "E_LUA_STALE",
  "E_MOD_MISSING",
  "E_MOD_OUTDATED",
  "E_PATH_DENIED",
  "E_PERMISSION_DENIED",
  "E_CACHE_FALLBACK",
  "E_NETWORK",
  "E_SAVE_FAILED",
] as const;

export type UxErrorCode = (typeof UX_ERROR_CODES)[number];

export type UxSource = "lua" | "xml" | "merged" | "cache" | "unknown";

export interface ModuleUiState {
  state: UiStateKind;
  timestamp: string;
  errorCode: UxErrorCode | string | null;
  lastUpdated: string | null;
  source: UxSource | string;
  isStale: boolean;
  staleReason: string | null;
}

export interface SetupStatusStep {
  id: "detect" | "connectivity" | "auth" | "service" | string;
  state: "success" | "error" | "pending" | string;
  errorCode: string | null;
}

export interface UxEvent {
  at: string;
  code: string;
  message: string;
  source: string;
}

export interface SetupStatus {
  status: "needs-setup" | "incomplete" | "degraded" | "ready" | string;
  lastErrorCode: string | null;
  nextAction: string;
  configCompleteness: number;
  requiresRestart: boolean;
  lanRisk?: { id: string; labelKey: string; tone: string; recommended?: boolean };
  steps: SetupStatusStep[];
  recentEvents: UxEvent[];
}

export function isUiState(value: string | undefined): value is UiStateKind {
  return UI_STATES.includes(value as UiStateKind);
}

export function buildModuleUiState(partial: Partial<ModuleUiState> & { state?: UiStateKind }): ModuleUiState {
  const state = isUiState(partial.state) ? partial.state : "loading";
  return {
    state,
    timestamp: partial.timestamp || new Date().toISOString(),
    errorCode: partial.errorCode || null,
    lastUpdated: partial.lastUpdated ?? null,
    source: partial.source || "unknown",
    isStale: state === "stale" || !!partial.isStale,
    staleReason: partial.staleReason ?? null,
  };
}

export function titleKeyForState(state: UiStateKind): string {
  switch (state) {
    case "loading":
      return "ux.state.loading";
    case "error":
      return "ux.state.error";
    case "empty":
      return "ux.state.empty";
    case "stale":
      return "ux.state.stale";
    case "success":
      return "ux.state.success";
    case "pending":
      return "ux.state.pending";
    default: {
      const _never: never = state;
      return _never;
    }
  }
}

export function errorCopyKey(code: string | null | undefined): string {
  if (!code) return "ux.state.error";
  return `ux.error.${code}`;
}

export function actionCopyKey(action: string | null | undefined): string {
  if (!action || action === "none") return "";
  return `ux.action.${action}`;
}
