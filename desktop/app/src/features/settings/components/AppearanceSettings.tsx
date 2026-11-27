"use client";

import { useEffect, useState } from "react";
import { Download, FolderOpen, Monitor, Moon, Palette, Sun, Upload } from "lucide-react";
import { setCustomTheme, themeBridge, useTheme, type LocalTheme, type ThemePreference } from "@/lib/theme";

const OPTIONS: Array<{ value: ThemePreference; label: string; description: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", description: "Bright background", icon: Sun },
  { value: "dark", label: "Dark", description: "Mosaic's original look", icon: Moon },
  { value: "system", label: "Follow Windows", description: "Matches your Windows setting", icon: Monitor },
];

function Option({ selected, label, description, icon: Icon, onSelect }: { selected: boolean; label: string; description: string; icon: typeof Sun; onSelect: () => void }) {
  return <button type="button" role="radio" aria-checked={selected} onClick={onSelect}
    className={`flex items-start gap-3 border px-3 py-3 text-left ${selected ? "border-vscode-accent bg-vscode-selection/40" : "border-vscode-border hover:bg-vscode-hover"}`}>
    <Icon size={16} className={`mt-0.5 shrink-0 ${selected ? "text-vscode-accent" : "text-vscode-muted"}`} />
    <span className="min-w-0">
      <span className="block text-xs font-semibold">{label}</span>
      <span className="mt-0.5 block text-[11px] text-vscode-muted">{description}</span>
    </span>
  </button>;
}

// Planned theme file format (placeholder; import/export are not built yet).
const THEME_FORMAT_EXAMPLE = `/* Mosaic theme: name=My Theme; base=dark */
:root[data-custom-theme="my-theme"] {
  --color-vscode-editor: #0e1a1c;   /* page background */
  --color-vscode-sidebar: #0a1517;  /* sidebar */
  --color-vscode-panel: #0c181a;    /* panels and cards */
  --color-vscode-border: #1d3b3f;
  --color-vscode-text: #dcf5f2;
  --color-vscode-muted: #8fbcb6;
  --color-vscode-accent: #13958b;   /* buttons, links */
  --color-vscode-selection: #5c1f40;
  --color-vscode-status: #0b4d48;   /* status bar */
}`;

export function AppearanceSettings() {
  const { preference, resolved, setPreference } = useTheme();
  const [localThemes, setLocalThemes] = useState<LocalTheme[]>([]);
  const bridge = themeBridge();

  useEffect(() => {
    let active = true;
    void themeBridge()?.listLocalThemes?.().then((themes) => { if (active) setLocalThemes(themes); }).catch(() => {});
    return () => { active = false; };
  }, []);

  return <section className="border border-vscode-border bg-vscode-panel p-5">
    <h2 className="text-sm font-semibold">Appearance</h2>
    <p className="mt-1 text-xs text-vscode-muted">Choose how Mosaic looks. You can also switch between light and dark from the icon in the status bar at the bottom.</p>
    <div role="radiogroup" aria-label="Theme" className="mt-4 grid gap-2 sm:grid-cols-3">
      {OPTIONS.map((option) => <Option key={option.value} selected={preference === option.value} label={option.label} description={option.description} icon={option.icon} onSelect={() => setPreference(option.value)} />)}
      {localThemes.map((theme) => <Option key={theme.id} selected={preference === `custom:${theme.id}`} label={theme.name} description={`Local theme · ${theme.base} base`} icon={Palette} onSelect={() => setCustomTheme(theme)} />)}
    </div>
    {preference === "system" && <p className="mt-2 text-[11px] text-vscode-muted">Windows is currently set to {resolved} mode.</p>}
    {bridge?.openLocalThemesFolder && <button type="button" onClick={() => void bridge.openLocalThemesFolder?.()} className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-vscode-muted hover:text-vscode-text">
      <FolderOpen size={13} /> Open local themes folder
    </button>}

    {/* Placeholder: import / export your own design (to be finished). */}
    <div className="mt-5 border border-dashed border-vscode-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold">Import your own design <span className="ml-1 border border-vscode-border px-1.5 py-0.5 text-[10px] font-normal text-vscode-muted">Coming soon</span></h3>
          <p className="mt-1 max-w-xl text-[11px] text-vscode-muted">Export a theme (or the template), change its colours, and import it as your own theme.</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-vscode-muted">
            <li>Imported themes are saved on this PC only: never uploaded, synced or added to the code.</li>
            <li>Any theme can be exported as a file, to back it up or to share it.</li>
          </ul>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled title="Coming soon" className="inline-flex items-center gap-1.5 border border-vscode-border px-2.5 py-1.5 text-[11px] disabled:opacity-50"><Download size={13} /> Export template</button>
          <button type="button" disabled title="Coming soon" className="inline-flex items-center gap-1.5 border border-vscode-border px-2.5 py-1.5 text-[11px] disabled:opacity-50"><Upload size={13} /> Import theme…</button>
        </div>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-[11px] text-vscode-muted hover:text-vscode-text">Theme file format</summary>
        <pre className="mt-2 overflow-x-auto border border-vscode-border bg-vscode-editor p-3 font-mono text-[11px] leading-5 text-vscode-text">{THEME_FORMAT_EXAMPLE}</pre>
      </details>
    </div>
  </section>;
}
