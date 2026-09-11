/** Live mod export vs held snapshot / savegame XML — mirrors legacy environment.js. */

export const LUA_EXPORT_STALE_MS = 90_000;

export type ConnectionBadgeKind = "live" | "snap" | "connecting";

export interface ConnectionBadgeState {
  dataSource?: string;
  luaAvailable?: boolean;
  xmlAvailable?: boolean;
  apiConnected?: boolean;
  dataTimestamps?: Record<string, string | number | boolean | null | undefined> | null;
  nowMs?: number;
}

export interface ConnectionBadge {
  kind: ConnectionBadgeKind;
  labelKey: string;
  titleKey: string;
  tone: "accent" | "default" | "warn" | "danger";
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
  const gameLive = !!state.luaAvailable && !luaStale && src !== "xml_only";

  if (src === "unknown" && !state.luaAvailable && !state.xmlAvailable) {
    return {
      kind: "connecting",
      labelKey: state.apiConnected ? "nav.badgeConnectingApi" : "nav.badgeConnecting",
      titleKey: "nav.badgeConnectingTitle",
      tone: "default",
    };
  }

  if (!gameLive) {
    const heldSnapshot = !!(ts.liveExportStaleAt || ts.heldFromSnapshotAt || ts.mergeHeldStaleAt);
    return {
      kind: "snap",
      labelKey: "nav.badgeSnapXml",
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
  if (remaining <= 0) return null;
  return remaining + 250;
}
