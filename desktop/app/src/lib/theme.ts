"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DARK_QUERY, DEFAULT_THEME, THEME_STORAGE_KEY } from "./themeConfig";

/** Light, dark, or follow the Windows setting. Dark is Mosaic's original look. */
export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export { DEFAULT_THEME, THEME_STORAGE_KEY };
const THEME_EVENT = "mosaic-theme-change";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function systemPrefersDark() {
  try { return window.matchMedia(DARK_QUERY).matches; } catch { return true; }
}

type DesktopThemeBridge = { setNativeTheme?: (preference: ThemePreference) => Promise<unknown> };

/** Applies the theme to <html> (data-theme + color-scheme) and to the Windows title bar. */
export function applyTheme(preference: ThemePreference) {
  const resolved = resolveTheme(preference, systemPrefersDark());
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolved;
  const bridge = (window as Window & { mosaicDesktop?: DesktopThemeBridge }).mosaicDesktop;
  void bridge?.setNativeTheme?.(preference)?.catch?.(() => {});
  return resolved;
}

export function setThemePreference(preference: ThemePreference) {
  try { window.localStorage.setItem(THEME_STORAGE_KEY, preference); } catch { /* still applies for this session */ }
  applyTheme(preference);
  window.dispatchEvent(new Event(THEME_EVENT));
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
  return `${preference}|${resolveTheme(preference, systemPrefersDark())}`;
}

export function useTheme() {
  const value = useSyncExternalStore(subscribe, snapshot, () => `${DEFAULT_THEME}|dark`);
  const [preference, resolved] = value.split("|") as [ThemePreference, ResolvedTheme];
  const setPreference = useCallback((next: ThemePreference) => setThemePreference(next), []);
  /** Footer quick switch: flips between light and dark (leaves "follow Windows"). */
  const toggle = useCallback(() => setThemePreference(resolved === "dark" ? "light" : "dark"), [resolved]);
  return { preference, resolved, setPreference, toggle };
}

/** Re-applies the saved theme after the app loads, so the Windows title bar matches too. */
export function syncThemeOnLoad() {
  applyTheme(readStoredPreference());
}
