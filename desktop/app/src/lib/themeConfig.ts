// Shared by the server layout (inline <head> script) and the client theme hook. No "use client" here.

export const THEME_STORAGE_KEY = "mosaic.theme.v1";
/** The selected local (custom) theme: { id, name, base, css }. Custom themes live in the profile's themes folder, never in the repo. */
export const CUSTOM_THEME_STORAGE_KEY = "mosaic.theme.custom.v1";
export const CUSTOM_THEME_STYLE_ID = "mosaic-custom-theme";
/** Dark is Mosaic's original look. */
export const DEFAULT_THEME = "dark" as const;
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Runs in <head> before the page paints, so Mosaic never flashes the wrong theme.
 * Keep it dependency-free; it mirrors applyTheme().
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var p=localStorage.getItem(k);var r=document.documentElement;var base=null;if(p&&p.indexOf("custom:")===0){var c=null;try{c=JSON.parse(localStorage.getItem(${JSON.stringify(CUSTOM_THEME_STORAGE_KEY)})||"null")}catch(e){}if(c&&"custom:"+c.id===p&&typeof c.css==="string"){base=c.base==="light"?"light":"dark";r.dataset.customTheme=c.id;var s=document.createElement("style");s.id=${JSON.stringify(CUSTOM_THEME_STYLE_ID)};s.textContent=c.css;document.head.appendChild(s);}else{p=null;}}if(!base&&p!=="light"&&p!=="dark"&&p!=="system")p=${JSON.stringify(DEFAULT_THEME)};var d=base?base==="dark":p==="system"?window.matchMedia(${JSON.stringify(DARK_QUERY)}).matches:p==="dark";r.dataset.theme=d?"dark":"light";r.dataset.themePreference=p;r.style.colorScheme=d?"dark":"light";}catch(e){document.documentElement.dataset.theme="dark";}})();`;
