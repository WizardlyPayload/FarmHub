/** Live mod export vs held snapshot / savegame XML — mirrors legacy environment.js. */

import type { DashboardPayload } from "@/types/dashboard";

export const LUA_EXPORT_STALE_MS = 90_000;

export type ConnectionBadgeKind = "live" | "snap" | "connecting";

export interface ConnectionBadgeState {
  dataSource?: string;
  stateStatus?: string;
  luaAvailable?: boolean;
  xmlAvailable?: boolean;
  apiConnected?: boolean;
  dataTimestamps?: DashboardPayload["dataTimestamps"] | null;
  nowMs?: number;
}

export interface ConnectionBadge {
  kind: ConnectionBadgeKind;
  labelKey: string;
  titleKey: string;
  tone: "accent" | "default" | "warn" | "danger";
  fallbackLabel?: string;
  fallbackTitle?: string;
}

export function isLuaExportStale(
  lastLuaReceivedAt: string | number | undefined,
  nowMs = Date.now(),
  staleMs = LUA_EXPORT_STALE_MS,
): boolean {
  if (lastLuaReceivedAt == null || lastLuaReceivedAt === "") return true;
  const parsed = Date.parse(String(lastLuaReceivedAt));
  if (Number.isNaN(parsed)) return true;
  const windowMs = Number(staleMs);
  const limit = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : LUA_EXPORT_STALE_MS;
  return nowMs - parsed > limit;
}

export function resolveNavbarConnectionBadge(state: ConnectionBadgeState = {}): ConnectionBadge {
  const src = state.dataSource || "unknown";
  const ts = state.dataTimestamps || {};
  const nowMs = Number(state.nowMs) || Date.now();
  const staleMs = Number(ts.luaExportStaleMs) || LUA_EXPORT_STALE_MS;
  const lastLuaAt =
    typeof ts.lastLuaReceivedAt === "string" || typeof ts.lastLuaReceivedAt === "number"
      ? ts.lastLuaReceivedAt
      : undefined;
  const luaStale = isLuaExportStale(lastLuaAt, nowMs, staleMs);
  const heldOrCached =
    ts.cacheUsedDueToFailure === true ||
    ts.isStale === true ||
    ts.confidence === "cache" ||
    ts.confidence === "held";
  const gameLive = !!state.luaAvailable && !luaStale && !heldOrCached
    && (!state.stateStatus || state.stateStatus === "snapshot") && src !== "xml_only";

  if (src === "unknown" && !state.luaAvailable && !state.xmlAvailable) {
    return {
      kind: "connecting",
      labelKey: state.apiConnected ? "nav.badgeConnectingApi" : "nav.badgeConnecting",
      titleKey: "nav.badgeConnectingTitle",
      tone: "default",
    };
  }

  if (!gameLive) {
    const heldSnapshot = state.stateStatus === "held" || state.stateStatus === "cache" ||
      ts.cacheUsedDueToFailure === true || ts.confidence === "cache" ||
      ts.confidence === "held" || !!(ts.heldFromSnapshotAt || ts.mergeHeldStaleAt);
    if (state.xmlAvailable !== true) {
      const staleSnapshot = ts.isStale === true || !!ts.liveExportStaleAt || luaStale;
      return {
        kind: "snap",
        labelKey: heldSnapshot ? "ux.freshness.held" : staleSnapshot ? "ux.freshness.stale" : "ux.state.stale",
        titleKey: "ux.freshness.staleHint",
        tone: "warn",
        fallbackLabel: heldSnapshot ? "Held snapshot" : staleSnapshot ? "Stale" : "Showing last known data.",
        fallbackTitle: "This is last-known data, not a live export. Refresh after the game or dedicated server is writing again.",
      };
    }
    return {
      kind: "snap",
      labelKey: heldSnapshot ? "ux.freshness.held" : luaStale && lastLuaAt !== undefined
        ? "ux.freshness.stale" : "nav.badgeSnapXml",
      titleKey: heldSnapshot
        ? "nav.badgeSnapXmlHeldTitle"
        : luaStale
          ? "nav.badgeSnapXmlStaleTitle"
          : "nav.badgeSnapXmlTitle",
      tone: "warn",
    };
  }

  return {
    kind: "live",
    labelKey: "nav.badgeLiveApi",
    titleKey: "nav.badgeLiveApiTitle",
    tone: "accent",
  };
}

export function needsModActivationNotice(state: {
  activeServerId?: string | null;
  luaAvailable?: boolean;
  dataSource?: string;
  xmlAvailable?: boolean;
}): boolean {
  if (!state.activeServerId) return false;
  if (state.luaAvailable) return false;
  const src = state.dataSource || "unknown";
  if (src === "lua_only" || src === "merged") return false;
  if (src === "xml_only") return true;
  return !!state.xmlAvailable;
}

export function luaStaleRefreshDelayMs(
  lastLuaReceivedAt: string | number | undefined,
  staleMs = LUA_EXPORT_STALE_MS,
  nowMs = Date.now(),
): number | null {
  if (lastLuaReceivedAt == null || lastLuaReceivedAt === "") return null;
  const parsed = Date.parse(String(lastLuaReceivedAt));
  if (Number.isNaN(parsed)) return null;
  const remaining = parsed + staleMs - nowMs;
  return Math.max(0, remaining + 250);
}
