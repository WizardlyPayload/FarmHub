import { formatNumber, num } from "./ModPage";

/** Horizontal fill bar; `ratio` is 0..1. */
export function ModBar({ ratio, tone, label }: { ratio: unknown; tone?: "warn" | "danger"; label?: string }) {
  const n = num(ratio);
  const pct = n == null ? 0 : Math.max(0, Math.min(1, n)) * 100;
  return (
    <div class={`fd-mod-page__bar${tone ? ` is-${tone}` : ""}`} role="img" aria-label={label ?? `${formatNumber(pct, 0)}%`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export type ModChartPoint = { key: string; label: string; value: number | null; current?: boolean; title?: string };

/** Small column chart for history series (prices per period, monthly totals). */
export function ModBarChart({ points, format }: { points: ModChartPoint[]; format?: (n: number) => string }) {
  const values = points.map((p) => (p.value != null && Number.isFinite(p.value) ? p.value : 0));
  const max = Math.max(0, ...values);
  if (points.length === 0 || max <= 0) return null;
  return (
    <div class="fd-mod-page__chart" role="img">
      {points.map((p, i) => {
        const v = values[i];
        const text = p.value == null ? "—" : format ? format(p.value) : formatNumber(p.value, 2);
        return (
          <div key={p.key} class={`fd-mod-page__chart-col${p.current ? " is-current" : ""}`} title={p.title ?? `${p.label}: ${text}`}>
            <span style={{ height: `${Math.max(2, (v / max) * 100)}%` }} />
            <small>{p.label}</small>
          </div>
        );
      })}
    </div>
  );
}
