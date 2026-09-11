/** Theme storage + CSS variable application (legacy theming.js). */

export type ThemeTab =
  | "global"
  | "vehicles"
  | "fields"
  | "economy"
  | "pastures";

export interface ThemeColors {
  bg: string;
  panel: string;
  primary: string;
  accent: string;
}

export type ThemesMap = Record<ThemeTab, ThemeColors>;

const STORAGE_KEY = "dashboard_themes";

export const DEFAULT_THEME_COLORS: ThemeColors = {
  bg: "#121212",
  panel: "#1a1a1a",
  primary: "#2d5016",
  accent: "#daa520",
};

export const THEME_TABS: ThemeTab[] = [
  "global",
  "vehicles",
  "fields",
  "economy",
  "pastures",
];

export function defaultThemes(): ThemesMap {
  const base = { ...DEFAULT_THEME_COLORS };
  return {
    global: { ...base },
    vehicles: { ...base },
    fields: { ...base },
    economy: { ...base },
    pastures: { ...base },
  };
}

export function loadThemes(): ThemesMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultThemes();
    const parsed = JSON.parse(raw) as Partial<ThemesMap>;
    const out = defaultThemes();
    for (const tab of THEME_TABS) {
      if (parsed[tab]) out[tab] = { ...DEFAULT_THEME_COLORS, ...parsed[tab] };
    }
    return out;
  } catch {
    return defaultThemes();
  }
}

export function saveThemes(themes: ThemesMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(themes));
  } catch {
    /* ignore */
  }
}

export function clearThemesStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function applyThemeVars(theme: ThemeColors): void {
  const root = document.documentElement;
  root.style.setProperty("--farm-darker", theme.bg);
  root.style.setProperty("--farm-dark", theme.panel);
  root.style.setProperty("--farm-primary", theme.primary);
  root.style.setProperty("--farm-accent", theme.accent);
  /* NEW APP aliases — keep surfaces as tinted glass over section photos */
  root.style.setProperty("--farm-bg", theme.bg);
  root.style.setProperty("--farm-panel", theme.panel);
  root.style.setProperty(
    "--farm-surface",
    `color-mix(in srgb, ${theme.panel} 36%, transparent)`,
  );
  root.style.setProperty(
    "--farm-surface-strong",
    `color-mix(in srgb, ${theme.panel} 52%, transparent)`,
  );
}
export function applyThemeForSection(themes: ThemesMap, section: string): void {
  // Livestock merged into Pastures — reuse pastures theme for legacy keys.
  const resolved = section === "livestock" ? "pastures" : section;
  const key = (THEME_TABS.includes(resolved as ThemeTab) ? resolved : "global") as ThemeTab;
  applyThemeVars(themes[key] || themes.global);
}
