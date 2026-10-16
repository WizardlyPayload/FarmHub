import type { ComponentChildren } from "preact";

export type StatTile = {
  key: string;
  label: string;
  value: ComponentChildren;
  hint?: string | null;
  tone?: "ok" | "warn" | "danger";
  /** Word values (e.g. "Allowed") use a smaller face than numbers. */
  text?: boolean;
};

/** Same stat row as the Red Tape / NPC Favor pages, sized to fit inside a card. */
export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  if (tiles.length === 0) return null;
  return (
    <div class="fd-economy__stats fd-companions__stats">
      {tiles.map((tile) => (
        <div
          key={tile.key}
          data-stat={tile.key}
          class={`fd-companions__stat${tile.tone ? ` is-${tile.tone}` : ""}${tile.text ? " is-text" : ""}`}
        >
          <span class="fd-economy__muted">{tile.label}</span>
          <strong>{tile.value}</strong>
          {tile.hint ? <small class="fd-companions__stat-hint">{tile.hint}</small> : null}
        </div>
      ))}
    </div>
  );
}
