// Shared by the server layout (inline <head> script) and the client theme hook. No "use client" here.

export const THEME_STORAGE_KEY = "mosaic.theme.v1";
/** Dark is Mosaic's original look. */
export const DEFAULT_THEME = "dark" as const;
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Runs in <head> before the page paints, so Mosaic never flashes the wrong theme.
 * Keep it dependency-free; it mirrors applyTheme().
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var p=localStorage.getItem(k);if(p!=="light"&&p!=="dark"&&p!=="system")p=${JSON.stringify(DEFAULT_THEME)};var d=p==="system"?window.matchMedia(${JSON.stringify(DARK_QUERY)}).matches:p==="dark";var r=document.documentElement;r.dataset.theme=d?"dark":"light";r.dataset.themePreference=p;r.style.colorScheme=d?"dark":"light";}catch(e){document.documentElement.dataset.theme="dark";}})();`;
