"use client";

import { useEffect, useState } from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { clickUpBridge, type ClickUpStatus } from "../lib/clickupDesktop";
import { useClickUpSnapshot } from "../hooks/useClickUpSnapshot";
import { ClickUpSyncStatus } from "./ClickUpSyncStatus";

const inputClass = "mt-1 w-full border border-vscode-border bg-vscode-input px-3 py-2 text-sm text-vscode-text outline-none focus:border-vscode-accent";
const buttonClass = "inline-flex items-center gap-2 border border-vscode-border px-3 py-2 text-xs hover:bg-vscode-hover disabled:opacity-50";

export function ClickUpSettings() {
  const [status, setStatus] = useState<ClickUpStatus | null>(null);
  const [token, setToken] = useState("");
  const [listInput, setListInput] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const snapshot = useClickUpSnapshot();

  useEffect(() => {
    const bridge = clickUpBridge();
    if (!bridge) return;
    void bridge.getClickUpStatus().then(setStatus).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
    return bridge.onClickUpUpdated(() => { void bridge.getClickUpStatus().then(setStatus).catch(() => {}); });
  }, []);

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    setMessage("");
    setError("");
    try { await action(); } catch (cause) {
      setError((cause instanceof Error ? cause.message : String(cause)).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
    } finally { setBusy(""); }
  };

  const bridge = clickUpBridge();
  if (!bridge) return null;

  return <section className="border border-vscode-border bg-vscode-panel p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold">ClickUp</h2>
        <p className="mt-1 max-w-2xl text-xs text-vscode-muted">Shows open tasks from the ClickUp Lists you add, checks for changes every 10 minutes (one request for all Lists) and notifies you. Read-only: Mosaic never changes ClickUp. The token is encrypted by Windows and stays on this PC.</p>
        <p className="mt-2 text-xs text-vscode-muted">
          {status?.tokenSaved ? <span className="text-green-400">Token saved{status.user?.name ? ` · signed in as ${status.user.name}` : ""}</span> : "No token saved"}
        </p>
        {status?.tokenSaved && <div className="mt-2"><ClickUpSyncStatus snapshot={snapshot} /></div>}
      </div>
    </div>

    <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
      <label className="text-xs text-vscode-muted">Personal API token
        <input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder={status?.tokenSaved ? "Saved · paste a new token to replace it" : "pk_…"} autoComplete="new-password" className={inputClass} />
      </label>
      <div className="flex gap-2">
        <button type="button" disabled={Boolean(busy) || !token.trim()} onClick={() => void run("token", async () => { setStatus(await bridge.saveClickUpToken(token)); setToken(""); setMessage("Token checked with ClickUp and saved."); })} className="inline-flex items-center gap-2 bg-vscode-accent px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"><KeyRound size={14} /> Save token</button>
        {status?.tokenSaved && <button type="button" disabled={Boolean(busy)} onClick={() => void run("remove-token", async () => { setStatus(await bridge.removeClickUpToken()); setMessage("Token removed from this PC."); })} className={buttonClass}><Trash2 size={14} /> Remove</button>}
      </div>
    </div>
    <p className="mt-1 text-[11px] text-vscode-muted">Create it in ClickUp: avatar → Settings → Apps → API Token. Never paste it into chats or files.</p>

    <div className="mt-5">
      <h3 className="text-xs font-semibold">Lists</h3>
      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
        <label className="text-xs text-vscode-muted">Paste a ClickUp List link or List ID
          <input value={listInput} onChange={(event) => setListInput(event.target.value)} placeholder="https://app.clickup.com/…/v/li/…" className={inputClass} />
        </label>
        <button type="button" disabled={Boolean(busy) || !listInput.trim() || !status?.tokenSaved} onClick={() => void run("list", async () => { setStatus(await bridge.addClickUpList(listInput)); setListInput(""); setMessage("List added."); })} className={buttonClass}><Plus size={14} /> Add List</button>
      </div>
      {!status?.tokenSaved && <p className="mt-1 text-[11px] text-vscode-muted">Save the token first, so Mosaic can check the List.</p>}
      <ul className="mt-3 space-y-1">
        {(status?.lists || []).map((list) => <li key={list.id} className="flex items-center justify-between gap-2 border border-vscode-border px-3 py-2 text-xs">
          <span className="min-w-0 truncate">{list.name} <span className="text-vscode-muted">· {list.id}</span></span>
          <button type="button" disabled={Boolean(busy)} onClick={() => void run(`remove-${list.id}`, async () => { setStatus(await bridge.removeClickUpList(list.id)); })} aria-label={`Remove ${list.name}`} className="text-vscode-muted hover:text-red-300 disabled:opacity-50"><Trash2 size={14} /></button>
        </li>)}
        {status && !status.lists.length && <li className="text-xs text-vscode-muted">No Lists added yet.</li>}
      </ul>
    </div>

    <label className="mt-5 block text-xs text-vscode-muted">Desktop notifications
      <select value={status?.notifyScope || "mine"} disabled={Boolean(busy) || !status} onChange={(event) => void run("scope", async () => { setStatus(await bridge.setClickUpNotifyScope(event.target.value === "all" ? "all" : "mine")); })} className={`${inputClass} md:max-w-sm`}>
        <option value="mine">Only tasks assigned to me</option>
        <option value="all">All tasks in my Lists</option>
      </select>
    </label>

    {message && <p role="status" className="mt-3 text-xs text-green-400">{message}</p>}
    {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
  </section>;
}
