// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isThemePreference, resolveTheme } from "./theme";
import { CUSTOM_THEME_STORAGE_KEY, DEFAULT_THEME, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "./themeConfig";

describe("Mosaic theme", () => {
  it("resolves Follow Windows from the system setting", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("only accepts the three known preferences", () => {
    expect(["light", "dark", "system"].every(isThemePreference)).toBe(true);
    expect(isThemePreference("blue")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  it("keeps dark as the default and applies the saved theme before the page paints", () => {
    expect(DEFAULT_THEME).toBe("dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("light");
    window.localStorage.setItem(THEME_STORAGE_KEY, "nonsense");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("local custom themes", () => {
  it("accepts only safe custom theme ids", () => {
    expect(isThemePreference("custom:ocean")).toBe(true);
    expect(isThemePreference("custom:My Theme")).toBe(false);
    expect(isThemePreference("custom:")).toBe(false);
  });

  it("applies a saved custom theme before the page paints, on its base theme", () => {
    document.getElementById("mosaic-custom-theme")?.remove();
    window.localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify({ id: "teal", name: "Teal", base: "dark", css: ":root{--x:1}" }));
    window.localStorage.setItem(THEME_STORAGE_KEY, "custom:teal");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.customTheme).toBe("teal");
    expect(document.getElementById("mosaic-custom-theme")?.textContent).toBe(":root{--x:1}");
  });

  it("falls back to Dark when the selected custom theme's colours are missing", () => {
    document.getElementById("mosaic-custom-theme")?.remove();
    delete document.documentElement.dataset.customTheme;
    window.localStorage.removeItem(CUSTOM_THEME_STORAGE_KEY);
    window.localStorage.setItem(THEME_STORAGE_KEY, "custom:gone");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.customTheme).toBeUndefined();
    expect(document.getElementById("mosaic-custom-theme")).toBeNull();
  });
});
