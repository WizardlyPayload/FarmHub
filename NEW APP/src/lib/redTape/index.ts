/** FS25_RedTape — compliance data helpers for Economy → Compliance tab. */

import { t } from "@/i18n/i18n";

export interface RedTapePolicy {
  nameKey?: string;
  policyIndex?: number;
  warnings?: number;
  watched?: boolean;
  nextEvaluationMonth?: number | string;
}

export interface RedTapeScheme {
  nameKey?: string;
  schemeIndex?: number;
  tier?: string;
  watched?: boolean;
}

export interface RedTapeCropRotationRow {
  farmlandId?: number | string;
  crops?: string[];
}

export interface RedTapeTaxStatement {
  month?: number | string;
  totalTaxableIncome?: number;
  totalTax?: number;
  paid?: boolean;
}

export interface RedTapeTax {
  currentMonthIncome?: number;
  currentMonthExpenses?: number;
  statements?: RedTapeTaxStatement[];
}

export interface RedTapeGrant {
  grantId?: string;
  xmlFilename?: string;
  status?: string;
  approvedAmount?: number;
  requestedAmount?: number;
}

export interface RedTapeEvent {
  typeKey?: string;
  detail?: string;
  month?: number | string;
  year?: number | string;
}

export interface RedTapeFarmRow {
  tier?: string;
  points?: number;
  policies?: RedTapePolicy[];
  activeSchemes?: RedTapeScheme[];
  availableSchemes?: RedTapeScheme[];
  cropRotation?: RedTapeCropRotationRow[];
  tax?: RedTapeTax;
  grants?: RedTapeGrant[];
  events?: RedTapeEvent[];
  [key: string]: unknown;
}

export interface RedTapePayload {
  enabled?: boolean;
  byFarm?: Record<string, RedTapeFarmRow>;
  [key: string]: unknown;
}

export function formatMoney(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function rtLabel(nameKey: unknown, fallback?: string): string {
  if (!nameKey) return fallback || "—";
  const key = String(nameKey);
  if (key.startsWith("rt_") || key.includes(".")) {
    const out = t(key);
    if (out !== key) return out;
  }
  return key.replace(/^rt_/, "").replace(/_/g, " ");
}

export function tierTone(tier: unknown): "accent" | "default" | "warn" | "danger" {
  const tierStr = String(tier || "D").toUpperCase();
  if (tierStr === "A") return "accent";
  if (tierStr === "B") return "default";
  if (tierStr === "C") return "warn";
  return "danger";
}

export function isRedTapeModActive(redTape: RedTapePayload | null | undefined): boolean {
  return !!(redTape && redTape.enabled === true);
}

/** Lua empty tables serialize as `{}` — never treat them as arrays. */
export function asArray<T>(x: T[] | unknown): T[] {
  return Array.isArray(x) ? x : [];
}

/** Normalize list fields on a Red Tape farm row so `.map` / `.length` are safe. */
export function normalizeRedTapeFarm(farm: RedTapeFarmRow | null | undefined): RedTapeFarmRow | null {
  if (!farm || typeof farm !== "object") return null;
  const tax = farm.tax;
  return {
    ...farm,
    policies: asArray<RedTapePolicy>(farm.policies),
    activeSchemes: asArray<RedTapeScheme>(farm.activeSchemes),
    availableSchemes: asArray<RedTapeScheme>(farm.availableSchemes),
    cropRotation: asArray<RedTapeCropRotationRow>(farm.cropRotation),
    grants: asArray<RedTapeGrant>(farm.grants),
    events: asArray<RedTapeEvent>(farm.events),
    tax: tax
      ? {
          ...tax,
          statements: asArray<RedTapeTaxStatement>(tax.statements),
        }
      : tax,
  };
}

export function getRedTapeForActiveFarm(
  redTape: RedTapePayload | null | undefined,
  farmId: number | null | undefined
): RedTapeFarmRow | null {
  if (!isRedTapeModActive(redTape)) return null;
  const fid = String(Number(farmId) || 1);
  const raw = redTape!.byFarm?.[fid] || redTape!.byFarm?.[String(Number(fid))] || null;
  return normalizeRedTapeFarm(raw);
}

/** Normalize crop rotation rows for UI (oldest → newest columns). */
export function getCropRotationRows(
  cropRotation: RedTapeCropRotationRow[] | null | undefined
): Array<{ farmlandId: string | number; crops: string[] }> {
  const rows = asArray<RedTapeCropRotationRow>(cropRotation);
  return rows.map((row) => ({
    farmlandId: row.farmlandId != null ? row.farmlandId : "—",
    crops: asArray<string>(row.crops),
  }));
}
