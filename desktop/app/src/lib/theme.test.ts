// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isThemePreference, resolveTheme } from "./theme";
import { DEFAULT_THEME, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "./themeConfig";

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
