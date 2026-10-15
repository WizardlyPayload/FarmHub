/**
 * Top-bar / settings labels for configured Local servers.
 * Prefer in-game save name, then map title — show both when they differ.
 * Never treat a slot id like `savegame18` as the save name.
 */

export type ServerLabelParts = {
  name?: string | null;
  savegameName?: string | null;
  mapTitle?: string | null;
  localSubFolder?: string | null;
};

function clean(value: string | null | undefined): string {
  return String(value || "").trim();
}

export function isSaveSlotId(value: string | null | undefined): boolean {
  return /^savegame\d+$/i.test(clean(value));
}

/** Drop trailing `(savegameN)` that auto-detect appends. */
export function stripSaveSlotSuffix(value: string | null | undefined): string {
  return clean(value).replace(/\s*\(\s*savegame\d+\s*\)\s*$/i, "").trim();
}

/** True when one label already contains the other (avoid "Riverbend — Riverbend Springs"). */
function alreadyMentions(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

/**
 * Display label for a save/server tab or dropdown option.
 * Examples:
 * - "Demo Montana - RF + companions — Montana Map, Multifruit 4x"
 * - "Demo Riverbend - Base — Riverbend Springs"
 */
export function formatServerLabel(parts: ServerLabelParts): string {
  const saveRaw = clean(parts.savegameName);
  const save = isSaveSlotId(saveRaw) ? "" : saveRaw;
  const map = clean(parts.mapTitle);
  const configured = stripSaveSlotSuffix(parts.name);
  const slot = clean(parts.localSubFolder);

  if (save && map && !alreadyMentions(save, map)) {
    return `${save} — ${map}`;
  }
  if (save) return save;

  // Config already carries "Save — Map" from a previous detect/rename.
  if (configured && map && alreadyMentions(configured, map)) {
    return configured;
  }
  if (configured && map && !isSaveSlotId(configured) && !alreadyMentions(configured, map)) {
    return `${configured} — ${map}`;
  }
  if (configured && !isSaveSlotId(configured)) {
    return configured;
  }
  if (map && slot) return `${map} (${slot})`;
  if (map) return map;
  return slot || "Save";
}

/** Keep identical save names distinguishable without cluttering unique labels. */
export function formatUniqueServerLabels<T extends ServerLabelParts & { id: string }>(servers: readonly T[]): string[] {
  const base = servers.map(formatServerLabel);
  const count = (labels: string[]) => {
    const totals = new Map<string, number>();
    for (const label of labels) {
      const key = label.toLowerCase();
      totals.set(key, (totals.get(key) || 0) + 1);
    }
    return totals;
  };
  const baseCounts = count(base);
  const withSlots = base.map((label, index) => {
    if ((baseCounts.get(label.toLowerCase()) || 0) === 1) return label;
    return `${label} — ${clean(servers[index].localSubFolder) || servers[index].id}`;
  });
  const slotCounts = count(withSlots);
  return withSlots.map((label, index) =>
    (slotCounts.get(label.toLowerCase()) || 0) === 1 ? label : `${label} (${servers[index].id})`,
  );
}
