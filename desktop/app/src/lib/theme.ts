"use client";

import { useCallback, useSyncExternalStore } from "react";
import { CUSTOM_THEME_STORAGE_KEY, CUSTOM_THEME_STYLE_ID, DARK_QUERY, DEFAULT_THEME, THEME_STORAGE_KEY } from "./themeConfig";

/** Light, dark, follow the Windows setting, or a local custom theme ("custom:<id>"). Dark is Mosaic's original look. */
export type ThemePreference = "light" | "dark" | "system" | `custom:${string}`;
export type ResolvedTheme = "light" | "dark";
/** A colour theme loaded from the profile's themes folder (never part of the repository). */
export type LocalTheme = { id: string; name: string; base: ResolvedTheme; css: string };

export { DEFAULT_THEME, THEME_STORAGE_KEY };
const THEME_EVENT = "mosaic-theme-change";
const CUSTOM_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function isThemePreference(value: unknown): value is ThemePreference {
  if (value === "light" || value === "dark" || value === "system") return true;
  return typeof value === "string" && value.startsWith("custom:") && CUSTOM_ID.test(value.slice(7));
}

export function isCustomPreference(value: ThemePreference): value is `custom:${string}` {
  return value.startsWith("custom:");
}

function readStoredCustomTheme(): LocalTheme | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CUSTOM_THEME_STORAGE_KEY) || "null") as LocalTheme | null;
    return parsed && typeof parsed.id === "string" && typeof parsed.css === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean, customBase: ResolvedTheme = "dark"): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  if (isCustomPreference(preference)) return customBase;
  return preference;
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!isThemePreference(stored)) return DEFAULT_THEME;
    // A custom theme is usable only when its colours are stored too.
    if (isCustomPreference(stored) && readStoredCustomTheme()?.id !== stored.slice(7)) return DEFAULT_THEME;
    return stored;
  } catch {
    return DEFAULT_THEME;
  }
}

function systemPrefersDark() {
  try { return window.matchMedia(DARK_QUERY).matches; } catch { return true; }
}

type DesktopThemeBridge = {
  setNativeTheme?: (preference: "light" | "dark" | "system") => Promise<unknown>;
  listLocalThemes?: () => Promise<LocalTheme[]>;
  openLocalThemesFolder?: () => Promise<unknown>;
};

export function themeBridge() {
  return (window as Window & { mosaicDesktop?: DesktopThemeBridge }).mosaicDesktop;
}

function applyCustomStyle(theme: LocalTheme | null) {
  const root = document.documentElement;
  let style = document.getElementById(CUSTOM_THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!theme) {
    style?.remove();
    delete root.dataset.customTheme;
    return;
  }
  if (!style) {
    style = document.createElement("style");
    style.id = CUSTOM_THEME_STYLE_ID;
    document.head.appendChild(style);
  }
  // textContent (not innerHTML): the file is treated as CSS text only.
  style.textContent = theme.css;
  root.dataset.customTheme = theme.id;
}

/** Applies the theme to <html> (data-theme + color-scheme), any custom colours, and the Windows title bar. */
export function applyTheme(preference: ThemePreference) {
  const custom = isCustomPreference(preference) ? readStoredCustomTheme() : null;
  const effective: ThemePreference = isCustomPreference(preference) && custom?.id !== preference.slice(7) ? DEFAULT_THEME : preference;
  const resolved = resolveTheme(effective, systemPrefersDark(), custom?.base);
  const root = document.documentElement;
  applyCustomStyle(isCustomPreference(effective) ? custom : null);
  root.dataset.theme = resolved;
  root.dataset.themePreference = effective;
  root.style.colorScheme = resolved;
  void themeBridge()?.setNativeTheme?.(isCustomPreference(effective) ? resolved : effective)?.catch?.(() => {});
  return resolved;
}

export function setThemePreference(preference: ThemePreference) {
  try { window.localStorage.setItem(THEME_STORAGE_KEY, preference); } catch { /* still applies for this session */ }
  applyTheme(preference);
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Selects a local theme and remembers its colours so it applies before the next paint. */
export function setCustomTheme(theme: LocalTheme) {
  try { window.localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(theme)); } catch { /* applies for this session only */ }
  setThemePreference(`custom:${theme.id}`);
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  const onSystemChange = () => {
    if (readStoredPreference() === "system") applyTheme("system");
    onChange();
  };
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onChange);
  media.addEventListener("change", onSystemChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
    media.removeEventListener("change", onSystemChange);
  };
}

function snapshot() {
  const preference = readStoredPreference();
  return `${preference}|${resolveTheme(preference, systemPrefersDark(), readStoredCustomTheme()?.base)}`;
}

export function useTheme() {
  const value = useSyncExternalStore(subscribe, snapshot, () => `${DEFAULT_THEME}|dark`);
  const separator = value.lastIndexOf("|");
  const preference = value.slice(0, separator) as ThemePreference;
  const resolved = value.slice(separator + 1) as ResolvedTheme;
  const setPreference = useCallback((next: ThemePreference) => setThemePreference(next), []);
  /** Footer quick switch: flips between light and dark (leaves "follow Windows" and custom themes). */
  const toggle = useCallback(() => setThemePreference(resolved === "dark" ? "light" : "dark"), [resolved]);
  return { preference, resolved, setPreference, toggle };
}

/**
 * Re-applies the saved theme after the app loads (also updates the Windows title bar). If a custom
 * theme is selected, its colours are refreshed from the themes folder, or it falls back to Dark when
 * the file is gone.
 */
export function syncThemeOnLoad() {
  const preference = readStoredPreference();
  applyTheme(preference);
  const bridge = themeBridge();
  if (!isCustomPreference(preference) || !bridge?.listLocalThemes) return;
  void bridge.listLocalThemes().then((themes) => {
    const current = themes.find((theme) => `custom:${theme.id}` === preference);
    if (current) setCustomTheme(current);
    else setThemePreference(DEFAULT_THEME);
  }).catch(() => {});
}
