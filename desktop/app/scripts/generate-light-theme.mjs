// Generates src/app/theme-light.css: Mosaic's light theme.
//
// Mosaic was built dark-first in places (Ask Echo, top bar, parts of the main page use fixed dark
// hex classes such as bg-[#1e1e1e] text-[#cccccc]). This script scans every .tsx file for
// arbitrary-hex colour classes and writes light-mode replacements:
//   dark neutral backgrounds -> white / light grey (by darkness)
//   dark tinted backgrounds  -> light tint of the same hue (status boxes)
//   light neutral text       -> dark grey; light coloured text -> darker shade of the same hue
//   dark neutral borders     -> light grey
// Brand colours (navy, gold, accent blues) and white text are left alone.
// Re-run after adding new hard-coded colours:  node scripts/generate-light-theme.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = path.join(appRoot, "src");
const outputFile = path.join(srcRoot, "app", "theme-light.css");
const L = ':root[data-theme="light"]';

const KEEP = new Set([
  "003366", "002244", "001a33", "00254a", "0078d4", "007acc", "0e639c", "1177bb", "174778", "1683d8",
  "c9ab4c", "c9a84c", "c9a33b", "b9973f", "fffcfb", "ffffff",
]);
const SELECTION = new Set(["04395e", "094771"]);

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) files.push(full);
  }
  return files;
}

function rgb(hex) {
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}
function luminance(hex) {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function hsv(hex) {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s: max ? d / max : 0 };
}
function hueFamily(h) {
  if (h < 20 || h >= 330) return "red";
  if (h < 70) return "yellow";
  if (h < 170) return "green";
  if (h < 265) return "blue";
  return "purple";
}
const TINT = { red: "#fde7e9", yellow: "#fff4ce", green: "#dff6dd", blue: "#e5f1fb", purple: "#f1e8f8" };
const INK = { red: "#b42318", yellow: "#8a6100", green: "#1a7f37", blue: "#005fb8", purple: "#6f42c1" };

function lightBackground(hex, hover = false) {
  if (KEEP.has(hex)) return null;
  if (SELECTION.has(hex)) return "#cce3f8";
  const lum = luminance(hex);
  if (lum >= 0.09) return null; // already a light or mid colour
  const { h, s } = hsv(hex);
  if (s >= 0.3) return TINT[hueFamily(h)];
  if (hover) return "#e8e8e8";
  if (lum < 0.0135) return "#ffffff";
  if (lum < 0.03) return "#f3f3f3";
  return "#e5e5e5";
}
function lightText(hex) {
  if (KEEP.has(hex)) return null;
  const lum = luminance(hex);
  if (lum > 0.9 || lum < 0.25) return null; // white stays; dark text is already readable on light
  const { h, s } = hsv(hex);
  if (s < 0.25) return lum > 0.5 ? "#1f1f1f" : "#595959";
  return INK[hueFamily(h)];
}
function lightBorder(hex) {
  if (KEEP.has(hex)) return null;
  const lum = luminance(hex);
  if (lum >= 0.12) return null;
  return "#d4d4d4";
}

const pattern = /(?<![\w:-])((?:hover|disabled):)?(bg|text|border|border-[tblrxy]|divide)-\[#([0-9a-fA-F]{6})\]/g;
const found = new Map();
for (const file of walk(srcRoot)) {
  for (const match of fs.readFileSync(file, "utf8").matchAll(pattern)) {
    const variant = match[1] || "";
    const property = match[2];
    const hex = match[3].toLowerCase();
    found.set(`${variant}${property}-[#${hex}]`, { variant, property, hex });
  }
}

const SIDE = { t: "top", b: "bottom", l: "left", r: "right" };
const rules = [];
for (const [className, { variant, property, hex }] of [...found.entries()].sort()) {
  let declaration = null;
  if (property === "bg") {
    const color = lightBackground(hex, variant === "hover:");
    if (color) declaration = `background-color: ${color} !important;`;
  } else if (property === "text") {
    const color = lightText(hex);
    if (color) declaration = `color: ${color} !important;`;
  } else if (property === "divide") {
    const color = lightBorder(hex);
    if (color) rules.push(`${L} [class*="${className}" i] > :not(:last-child) { border-color: ${color} !important; }`);
    continue;
  } else {
    const color = lightBorder(hex);
    if (color) {
      const side = property.slice(7);
      declaration = side && SIDE[side] ? `border-${SIDE[side]}-color: ${color} !important;` : `border-color: ${color} !important;`;
    }
  }
  if (!declaration) continue;
  // Base classes match only as a whole class (start of the list or after a space), so a
  // hover-only class never changes the resting colour.
  const selector = variant === "hover:"
    ? `${L} [class*="${className}" i]:hover:not(:disabled)`
    : variant === "disabled:"
      ? `${L} [class*="${className}" i]:disabled`
      : `${L} :is([class^="${className}" i], [class*=" ${className}" i])`;
  rules.push(`${selector} { ${declaration} }`);
}

const header = `/* Mosaic light theme. Generated by scripts/generate-light-theme.mjs, edit that script, not this file.
   Light mode turns off the dark re-colouring layer in globals.css and uses these replacements. */

${L} {
  --color-vscode-editor: #ffffff;
  --color-vscode-sidebar: #f8f8f8;
  --color-vscode-activity: #f3f3f3;
  --color-vscode-panel: #f8f8f8;
  --color-vscode-raised: #e8e8e8;
  --color-vscode-border: #e0e0e0;
  --color-vscode-text: #1f1f1f;
  --color-vscode-muted: #616161;
  --color-vscode-icon: #616161;
  --color-vscode-accent: #005fb8;
  --color-vscode-selection: #cce3f8;
  --color-vscode-hover: #ececec;
  --color-vscode-status: #f3f3f3;
  --color-vscode-command: #ffffff;
  --color-vscode-input: #ffffff;
}

${L} .vscode-workbench {
  color-scheme: light;
  font-size: 13px;
}

${L} .mosaic-topbar {
  background: #f3f3f3;
  border-color: #e0e0e0;
  color: #1f1f1f;
}

${L} .mosaic-topbar input {
  background: #ffffff !important;
  border-color: #d4d4d4 !important;
  color: #1f1f1f !important;
}

${L} .mosaic-topbar kbd {
  background: #f3f3f3 !important;
  border-color: #d4d4d4 !important;
  color: #616161 !important;
}

/* Light named colours used on dark-first screens (Settings, ClickUp) need more contrast on white. */
${L} :is([class^="text-red-200"], [class*=" text-red-200"], [class^="text-red-300"], [class*=" text-red-300"]) { color: #b42318 !important; }
${L} :is([class^="text-green-400"], [class*=" text-green-400"]) { color: #1a7f37 !important; }
${L} :is([class^="text-amber-300"], [class*=" text-amber-300"]) { color: #8a6100 !important; }
${L} :is([class*=" bg-red-950/"], [class^="bg-red-950/"]) { background-color: #fde7e9 !important; }

/* White hover text on dark-first controls; brand buttons keep white on their navy/red/blue hover. */
${L} [class~="hover:text-white"]:not([class*="hover:bg-[#0" i]):not([class*="hover:bg-[#C9" i]):not([class*="hover:bg-red" i]):not([class*="hover:bg-blue" i]):not([class*="hover:bg-brand" i]):not([class*="hover:bg-emerald" i]):hover { color: #1f1f1f !important; }

${L} ::selection { background: #cce3f8; }

/* Generated replacements for hard-coded colour classes (${rules.length} rules). */
`;

fs.writeFileSync(outputFile, `${header}${rules.join("\n")}\n`, "utf8");
console.log(`Wrote ${path.relative(appRoot, outputFile)} with ${rules.length} generated rules from ${found.size} colour classes.`);
