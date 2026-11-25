"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { clickUpBridge, syncStatusText, type ClickUpSnapshot } from "../lib/clickupDesktop";

const TONE: Record<string, string> = {
  ok: "text-emerald-600",
  muted: "text-gray-500",
  warn: "text-amber-600",
  error: "text-red-500",
};

/**
 * "As of Nov 25, 2026, 10:42 AM · Up to date" plus a Sync now button.
 * Sync now always pulls every open task and can be used once every 30 seconds.
 */
export function ClickUpSyncStatus({ snapshot, onSnapshot, compact = false }: { snapshot: ClickUpSnapshot | null; onSnapshot?: (next: ClickUpSnapshot) => void; compact?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  const [syncing, setSyncing] = useState(false);
  const cooldownUntil = snapshot?.manualCooldownUntil || 0;
  const coolingDown = cooldownUntil > now;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), coolingDown ? 1_000 : 30_000);
    return () => window.clearInterval(timer);
  }, [coolingDown]);

  const sync = async () => {
    const bridge = clickUpBridge();
    if (!bridge || syncing || coolingDown) return;
    setSyncing(true);
    try {
      const next = await bridge.refreshClickUp();
      onSnapshot?.(next);
    } catch { /* the status line shows the error from the snapshot */ }
    finally { setSyncing(false); setNow(Date.now()); }
  };

  const { asOf, state, tone } = syncStatusText(snapshot, now);
  const busy = syncing || Boolean(snapshot?.syncing);
  const waitSeconds = Math.ceil((cooldownUntil - now) / 1000);

  return <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${compact ? "text-[11px]" : "text-xs"}`}>
    <span className="text-gray-500" title={snapshot?.lastMode === "check" ? `Last check used ${snapshot.lastRequestCount ?? 1} ClickUp request` : undefined}>
      {asOf ? <>As of <span className="font-semibold">{asOf}</span></> : "Not synced yet"}
    </span>
    <span className={TONE[tone] || TONE.muted} role="status">· {state}</span>
    <button type="button" onClick={() => void sync()} disabled={busy || coolingDown || !snapshot?.lists?.length}
      title={coolingDown ? `Sync now is available again in ${waitSeconds}s` : "Pull every open task from ClickUp now"}
      className="inline-flex items-center gap-1 border border-gray-200 px-2 py-0.5 font-semibold hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50">
      <RefreshCw size={compact ? 11 : 12} className={busy ? "animate-spin" : ""} />
      {busy ? "Syncing…" : coolingDown ? `Sync now (${waitSeconds}s)` : "Sync now"}
    </button>
  </div>;
}
