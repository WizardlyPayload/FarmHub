import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { Badge, Button, Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import { catalogEntry } from "@/lib/companionMods/catalog";
import { formatCurrency } from "@/lib/economy";
import { useUnitDisplay } from "@/lib/fill-unit-mode";
import { formatProfileUnitPrice, saveProfileFromUnitDisplay } from "@/lib/profile-display";
import { useDashboardStore } from "@/store/dashboard-store";
import { LUA_EXPORT_STALE_MS, luaStaleRefreshDelayMs, resolveNavbarConnectionBadge } from "@/lib/connection-badge";
import type { DashboardPayload } from "@/types/dashboard";
import { companionPageEntry, modPageSection } from "@/sections/mods/registry";
import type { CompanionPageData, CompanionPageEntry, CompanionPagesPayload } from "@/sections/mods/types";
import "@/sections/economy/economy.css";
import "./mods.css";

export type CompanionModRow = {
  id?: string;
  title?: string;
  version?: string | null;
  modName?: string | null;
  detected?: boolean;
};

export type CompanionPageContext = {
  payload: Record<string, unknown> | null;
  page: CompanionPageData | null;
  mod: CompanionModRow | null;
  farmId: number;
  farmData: Record<string, unknown> | null;
};

export function pageTitle(entry: CompanionPageEntry): string {
  return tOr(`companionPage.${entry.key}.title`, entry.title);
}

/** Reading for one page: the page export, the companion catalog row and this farm's slice. */
export function useCompanionPage(key: string): CompanionPageContext {
  const payload = useDashboardStore((s) => s.payload) as Record<string, unknown> | null;
  const farmId = Number(useDashboardStore((s) => s.activeFarmId) ?? 1) || 1;
  const entry = companionPageEntry(key);
  const pages = (payload?.companionPages as CompanionPagesPayload | null | undefined)?.pages;
  const page = pages && pages[key] && typeof pages[key] === "object" ? pages[key] : null;
  const cm = payload?.companionMods as { mods?: unknown } | null | undefined;
  const mods = Array.isArray(cm?.mods) ? (cm!.mods as CompanionModRow[]) : [];
  const catalogId = entry?.catalogId ?? key;
  const mod = mods.find((m) => m && m.id === catalogId && m.detected === true) ?? null;
  const byFarm = page?.byFarm;
  const farmSlice = byFarm && typeof byFarm === "object" ? byFarm[String(farmId)] : null;
  return {
    payload,
    page,
    mod,
    farmId,
    farmData: farmSlice && typeof farmSlice === "object" ? farmSlice : null,
  };
}

export type ModReadingState = "missing" | "waiting" | "ok" | "partial" | "limited" | "failed";

export function readingState(page: CompanionPageData | null, mod: CompanionModRow | null): ModReadingState {
  if (!page && !mod) return "missing";
  if (!page) return "waiting";
  switch (page.readState) {
    case "ok":
      return "ok";
    case "partial":
      return "partial";
    case "failed":
      return "failed";
    case "settings-only":
    case "detection-only":
      return "limited";
    default:
      return page.detected === true ? "ok" : "waiting";
  }
}

function stateBadge(state: ModReadingState, live: boolean) {
  switch (state) {
    case "ok":
      return live
        ? <Badge tone="accent">{tOr("companionPage.shared.stateOk", "Live reading")}</Badge>
        : <Badge tone="warn">{tOr("companionPage.shared.stateLast", "Last reading")}</Badge>;
    case "partial":
      return <Badge tone="warn">{tOr("companionPage.shared.statePartial", "Partial reading")}</Badge>;
    case "limited":
      return <Badge>{tOr("companionPage.shared.stateLimited", "Limited reading")}</Badge>;
    case "failed":
      return <Badge tone="danger">{tOr("companionPage.shared.stateFailed", "Reading failed")}</Badge>;
    case "waiting":
      return <Badge>{tOr("companionPage.shared.stateWaiting", "Waiting for data")}</Badge>;
    case "missing":
      return null;
    default: {
      const never: never = state;
      return never;
    }
  }
}

function hasMoistureMapCropReading(page: CompanionPageData | null): boolean {
  const base = page?.baseMoisturePercent;
  if (typeof base === "number" && Number.isFinite(base)) return true;
  return Array.isArray(page?.crops) && page.crops.some((crop: unknown) => {
    if (!crop || typeof crop !== "object" || Array.isArray(crop)) return false;
    const row = crop as Record<string, unknown>;
    return ["qualityNow", "yieldNow", "gradeNow", "priceFactorNow"].some((key) =>
      typeof row[key] === "number" && Number.isFinite(row[key]));
  });
}

function stateNotice(state: ModReadingState, page: CompanionPageData | null, key: string): string | null {
  switch (state) {
    case "waiting":
      return tOr(
        "companionPage.shared.noticeWaiting",
        "The mod is installed, but the FarmDashboard mod has not sent a reading for it yet. It appears after the next export cycle; older FarmDashboard mod versions do not send it.",
      );
    case "limited":
      return page?.readState === "detection-only"
        ? tOr("companionPage.shared.noticeDetection", "This mod keeps its numbers to itself, so FarmHub can only confirm it is running.")
        : key === "moistureSystem" && page?.readState === "settings-only" && hasMoistureMapCropReading(page)
          ? tOr(
              "companionPage.moistureSystem.noticeMapCropLimited",
              "Map moisture and crop estimates are available. Farm-specific silo, bale and irrigation readings are not available for this farm.",
            )
        : tOr("companionPage.shared.noticeSettings", "Only this mod's settings are readable. Live figures stay in the game.");
    case "failed":
      return tOr("companionPage.shared.noticeFailed", "FarmHub could not read this mod on the last export. The figures below may be missing or out of date.");
    case "partial":
      return tOr("companionPage.shared.noticePartial", "Some of this mod's readings were unavailable on the last export.");
    case "ok":
    case "missing":
      return null;
    default: {
      const never: never = state;
      return never;
    }
  }
}

/** Standard frame for a dedicated companion page: header, reading notice, then the page body. */
export function ModPage({
  entry,
  lead,
  children,
}: {
  entry: CompanionPageEntry;
  lead?: string;
  children?: ComponentChildren;
}) {
  const { payload, page, mod } = useCompanionPage(entry.key);
  const dash = payload as DashboardPayload | null;
  const ts = dash?.dataTimestamps;
  const lastLua = typeof ts?.lastLuaReceivedAt === "string" || typeof ts?.lastLuaReceivedAt === "number"
    ? ts.lastLuaReceivedAt : undefined;
  const staleMs = Number(ts?.luaExportStaleMs) || LUA_EXPORT_STALE_MS;
  const [, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const delay = luaStaleRefreshDelayMs(lastLua, staleMs, Date.now());
    if (delay == null) return;
    const id = window.setTimeout(() => setNowMs(Date.now()), delay);
    return () => window.clearTimeout(id);
  }, [lastLua, staleMs]);
  const live = resolveNavbarConnectionBadge({
    dataSource: dash?.dataSource,
    stateStatus: (dash as DashboardPayload & { sourceBinding?: { stateStatus?: string } } | null)?.sourceBinding?.stateStatus,
    luaAvailable: dash?.luaAvailable,
    xmlAvailable: dash?.xmlAvailable,
    dataTimestamps: ts,
    nowMs: Date.now(),
  }).kind === "live";
  const state = readingState(page, mod);
  const version = page?.version ?? mod?.version ?? null;
  const notice = stateNotice(state, page, entry.key);
  return (
    <div class="fd-economy fd-mod-page" data-mod-page={entry.key}>
      <header class="fd-section-header fd-mod-page__header">
        <h2>{pageTitle(entry)}</h2>
        <div class="fd-economy__env">
          {version ? <Badge>{tOr("companionPage.shared.version", "v{{version}}", { version })}</Badge> : null}
          {stateBadge(state, live)}
        </div>
        {lead ? <p class="fd-muted-sm">{lead}</p> : null}
      </header>
      {state === "missing" ? (
        <div class="fd-economy__empty">
          <h3>{tOr("companionPage.shared.notDetectedTitle", "Not detected in this save")}</h3>
          <p>
            {tOr(
              "companionPage.shared.notDetected",
              "{{mod}} is not loaded in the save FarmHub is reading. Enable it in the game's mod list and load the save.",
              { mod: pageTitle(entry) },
            )}
          </p>
        </div>
      ) : (
        <>
          {notice ? (
            <p class={`fd-mod-page__notice is-${state}`} role="status">
              {notice}
            </p>
          ) : null}
          {children}
        </>
      )}
    </div>
  );
}

export type ModStatTile = {
  key: string;
  label: string;
  value: ComponentChildren;
  hint?: string | null;
  tone?: "ok" | "warn" | "danger";
};

/** Same stat row as the Red Tape / NPC Favor pages. */
export function ModStatTiles({ tiles }: { tiles: ModStatTile[] }) {
  if (tiles.length === 0) return null;
  return (
    <div class="fd-economy__stats fd-mod-page__stats">
      {tiles.map((tile) => (
        <div key={tile.key} data-stat={tile.key} class={`fd-mod-page__stat${tile.tone ? ` is-${tile.tone}` : ""}`}>
          <span class="fd-economy__muted">{tile.label}</span>
          <strong>{tile.value}</strong>
          {tile.hint ? <small class="fd-mod-page__stat-hint">{tile.hint}</small> : null}
        </div>
      ))}
    </div>
  );
}

export function ModEmpty({ children }: { children?: ComponentChildren }) {
  return <p class="fd-economy__muted fd-mod-page__empty">{children}</p>;
}

export type ModColumn = { key: string; label: string; align?: "start" | "end" | "center" };
export type ModRow = { key: string; cells: Record<string, ComponentChildren>; tone?: "warn" | "danger" | "ok" };

export function ModTable({ columns, rows, empty }: { columns: ModColumn[]; rows: ModRow[]; empty?: string }) {
  if (rows.length === 0) return empty ? <ModEmpty>{empty}</ModEmpty> : null;
  const cls = (align?: ModColumn["align"]) => (align === "end" ? "text-end" : align === "center" ? "text-center" : undefined);
  return (
    <div class="fd-economy__table-wrap">
      <table class="fd-economy__table fd-mod-page__table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} class={cls(c.align)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} data-row={row.key} class={row.tone ? `is-${row.tone}` : undefined}>
              {columns.map((c) => (
                <td key={c.key} class={cls(c.align)}>
                  {row.cells[c.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type ModKeyValue = { key: string; label: string; value: ComponentChildren };

export function ModKeyValues({ rows }: { rows: ModKeyValue[] }) {
  if (rows.length === 0) return null;
  return (
    <dl class="fd-mod-page__kv">
      {rows.map((row) => (
        <div key={row.key} data-kv={row.key}>
          <dt>{row.label}</dt>
          <dd>{row.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** "What this mod does": catalog description, version, folder and what to check in game. */
export function ModAbout({
  entry,
  lookFor = [],
  children,
}: {
  entry: CompanionPageEntry;
  lookFor?: string[];
  children?: ComponentChildren;
}) {
  const { page, mod } = useCompanionPage(entry.key);
  const cat = catalogEntry(entry.catalogId);
  const desc = cat ? tOr(cat.descKey, cat.desc) : tOr(`companionPage.${entry.key}.desc`, "");
  const version = page?.version ?? mod?.version ?? null;
  const folder = page?.modName ?? mod?.modName ?? null;
  return (
    <Card title={tOr("companionPage.shared.aboutTitle", "About this mod")} class="fd-mod-page__about">
      {desc ? <p>{desc}</p> : null}
      <ModKeyValues
        rows={[
          { key: "version", label: tOr("companionPage.shared.aboutVersion", "Detected version"), value: version ?? "—" },
          { key: "folder", label: tOr("companionPage.shared.aboutFolder", "Mod folder"), value: folder ?? "—" },
        ]}
      />
      {children}
      {lookFor.length > 0 ? (
        <>
          <h4 class="fd-mod-page__subhead">{tOr("companionPage.shared.lookFor", "What to look for in game")}</h4>
          <ul class="fd-mod-page__checklist">
            {lookFor.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}

/** "Open full page" link used by section summary panels and the Companion mods index. */
export function ModPageLink({ pageKey, label }: { pageKey: string; label?: string }) {
  const setSection = useDashboardStore((s) => s.setSection);
  const entry = companionPageEntry(pageKey);
  if (!entry) return null;
  return (
    <Button variant="ghost" onClick={() => setSection(modPageSection(entry.key))}>
      {label ?? tOr("companionPage.shared.openPage", "Open full page")}
    </Button>
  );
}

export function useMoney(): (amount: unknown) => string {
  const profile = saveProfileFromUnitDisplay(useUnitDisplay());
  return (amount: unknown) => {
    const n = Number(amount);
    return amount == null || !Number.isFinite(n) ? "—" : formatCurrency(n, profile);
  };
}

/** Per-unit quotes (price per litre) in the save currency, with fractional precision. */
export function useUnitPrice(): (amount: unknown) => string {
  const profile = saveProfileFromUnitDisplay(useUnitDisplay());
  return (amount: unknown) => {
    const n = Number(amount);
    return amount == null || !Number.isFinite(n) ? "—" : formatProfileUnitPrice(n, profile);
  };
}

export function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function formatNumber(value: unknown, dp = 0): string {
  const n = num(value);
  if (n == null) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** `ratio` true: 0.035 -> 3.5 %. Otherwise the value is already a percent. */
export function formatPercent(value: unknown, opts: { ratio?: boolean; dp?: number } = {}): string {
  const n = num(value);
  if (n == null) return "—";
  const pct = opts.ratio ? n * 100 : n;
  return `${formatNumber(pct, opts.dp ?? 1)}%`;
}

export function periodLabel(period: unknown): string {
  const n = num(period);
  if (n == null || n < 1 || n > 12) return "—";
  return tOr("companions.periodLabel", "Period {{period}}", { period: Math.round(n) });
}

export function asList<T = Record<string, unknown>>(value: unknown): T[] {
  return Array.isArray(value) ? (value.filter((v) => v != null) as T[]) : [];
}

export function yesNo(value: unknown): string {
  if (value === true) return tOr("companionPage.shared.yes", "Yes");
  if (value === false) return tOr("companionPage.shared.no", "No");
  return "—";
}
