"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "@/lib/theme";

const OPTIONS: Array<{ value: ThemePreference; label: string; description: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", description: "Bright background", icon: Sun },
  { value: "dark", label: "Dark", description: "Mosaic's original look", icon: Moon },
  { value: "system", label: "Follow Windows", description: "Matches your Windows setting", icon: Monitor },
];

export function AppearanceSettings() {
  const { preference, resolved, setPreference } = useTheme();
  return <section className="border border-vscode-border bg-vscode-panel p-5">
    <h2 className="text-sm font-semibold">Appearance</h2>
    <p className="mt-1 text-xs text-vscode-muted">Choose how Mosaic looks. You can also switch between light and dark from the icon in the status bar at the bottom.</p>
    <div role="radiogroup" aria-label="Theme" className="mt-4 grid gap-2 sm:grid-cols-3">
      {OPTIONS.map(({ value, label, description, icon: Icon }) => {
        const selected = preference === value;
        return <button key={value} type="button" role="radio" aria-checked={selected} onClick={() => setPreference(value)}
          className={`flex items-start gap-3 border px-3 py-3 text-left ${selected ? "border-vscode-accent bg-vscode-selection/40" : "border-vscode-border hover:bg-vscode-hover"}`}>
          <Icon size={16} className={`mt-0.5 shrink-0 ${selected ? "text-vscode-accent" : "text-vscode-muted"}`} />
          <span className="min-w-0">
            <span className="block text-xs font-semibold">{label}</span>
            <span className="mt-0.5 block text-[11px] text-vscode-muted">{description}</span>
          </span>
        </button>;
      })}
    </div>
    {preference === "system" && <p className="mt-2 text-[11px] text-vscode-muted">Windows is currently set to {resolved} mode.</p>}
  </section>;
}
