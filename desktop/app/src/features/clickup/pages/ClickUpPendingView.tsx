"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Search, Settings } from "lucide-react";
import { ClickUpSyncStatus } from "../components/ClickUpSyncStatus";
import {
  assigneeOptions, clickUpBridge, dueBucket, filterTasks, sortTasks,
  type ClickUpFilters, type ClickUpSnapshot, type DueFilter,
} from "../lib/clickupDesktop";

const selectClass = "border border-vscode-border bg-vscode-input px-2 py-1.5 text-xs text-vscode-text outline-none focus:border-vscode-accent";
const PRIORITY_STYLE: Record<string, string> = { urgent: "text-red-300", high: "text-amber-300", normal: "text-vscode-muted", low: "text-vscode-muted" };

function formatDue(dueDate: number | null) {
  if (dueDate === null) return "No due date";
  return new Date(dueDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function ClickUpPendingView({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const [snapshot, setSnapshot] = useState<ClickUpSnapshot | null>(null);
  const [filters, setFilters] = useState<ClickUpFilters>({ listId: "all", assignee: "all", due: "all", search: "" });
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const bridge = clickUpBridge();

  useEffect(() => {
    if (!bridge) return;
    void bridge.getClickUpSnapshot().then(setSnapshot).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
    const unsubscribe = bridge.onClickUpUpdated((next) => { setSnapshot(next); setNow(Date.now()); });
    const clock = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => { unsubscribe(); window.clearInterval(clock); };
  }, [bridge]);

  const tasks = useMemo(() => snapshot?.tasks || [], [snapshot]);
  const visible = useMemo(() => sortTasks(filterTasks(tasks, filters, snapshot?.user?.id || null, now)), [tasks, filters, snapshot?.user?.id, now]);
  const people = useMemo(() => assigneeOptions(tasks), [tasks]);
  const overdueCount = useMemo(() => tasks.filter((task) => dueBucket(task, now) === "overdue").length, [tasks, now]);
  const dueSoonCount = useMemo(() => tasks.filter((task) => ["today", "week"].includes(dueBucket(task, now))).length, [tasks, now]);
  const set = <K extends keyof ClickUpFilters>(key: K, value: ClickUpFilters[K]) => setFilters((current) => ({ ...current, [key]: value }));

  if (!bridge) {
    return <section className="mx-auto w-full max-w-5xl px-6 py-8 text-vscode-text"><p className="text-sm text-vscode-muted">ClickUp is available in the Mosaic desktop app.</p></section>;
  }

  const notConfigured = snapshot && !snapshot.lists.length && !tasks.length;

  return <section className="mx-auto w-full max-w-6xl px-6 py-8 text-vscode-text">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-vscode-border pb-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-vscode-muted">ClickUp</p>
        <h1 className="mt-2 text-2xl font-semibold">Pending tasks</h1>
        <p className="mt-2 text-sm text-vscode-muted">
          {tasks.length} open · <span className={overdueCount ? "text-red-300" : ""}>{overdueCount} overdue</span> · {dueSoonCount} due within 7 days
        </p>
        <div className="mt-2"><ClickUpSyncStatus snapshot={snapshot} onSnapshot={(next) => { setSnapshot(next); setNow(Date.now()); }} /></div>
      </div>
      <div className="flex gap-2">
        {onOpenSettings && <button type="button" onClick={onOpenSettings} className="inline-flex items-center gap-2 border border-vscode-border px-3 py-2 text-xs hover:bg-vscode-hover"><Settings size={14} /> ClickUp settings</button>}
      </div>
    </header>

    {(error || (snapshot?.status === "error" && snapshot.lastError)) && <p role="alert" className="mb-4 border border-red-700/70 bg-red-950/30 px-3 py-2 text-sm text-red-200">{error || snapshot?.lastError}</p>}
    {snapshot?.lists.filter((list) => list.error).map((list) => <p key={list.id} className="mb-2 text-xs text-amber-300">{list.name}: {list.error}</p>)}

    {notConfigured ? <div className="border border-vscode-border bg-vscode-panel p-5 text-sm">
      <h2 className="font-semibold">Connect ClickUp</h2>
      <p className="mt-2 text-vscode-muted">Save your ClickUp personal API token and add your Lists in Settings. Mosaic then shows their open tasks here.</p>
      {onOpenSettings && <button type="button" onClick={onOpenSettings} className="mt-4 inline-flex items-center gap-2 bg-vscode-accent px-3 py-2 text-xs font-semibold text-white hover:brightness-110"><Settings size={14} /> Open settings</button>}
    </div> : <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-vscode-muted" />
          <input value={filters.search} onChange={(event) => set("search", event.target.value)} placeholder="Search tasks" aria-label="Search tasks" className={`${selectClass} w-56 pl-7`} />
        </label>
        <select aria-label="List" value={filters.listId} onChange={(event) => set("listId", event.target.value)} className={selectClass}>
          <option value="all">All Lists</option>
          {(snapshot?.lists || []).map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
        </select>
        <select aria-label="Assignee" value={filters.assignee} onChange={(event) => set("assignee", event.target.value)} className={selectClass}>
          <option value="all">Everyone</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
        <select aria-label="Due date" value={filters.due} onChange={(event) => set("due", event.target.value as DueFilter)} className={selectClass}>
          <option value="all">Any due date</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due today</option>
          <option value="week">Due within 7 days</option>
          <option value="none">No due date</option>
        </select>
        <span className="ml-auto text-xs text-vscode-muted">{visible.length} shown</span>
      </div>

      <div className="overflow-x-auto border border-vscode-border">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="bg-vscode-panel text-vscode-muted">
            <tr><th className="px-3 py-2 font-medium">Task</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Assignee</th><th className="px-3 py-2 font-medium">Due</th><th className="px-3 py-2 font-medium">Priority</th><th className="px-3 py-2 font-medium">List</th></tr>
          </thead>
          <tbody>
            {visible.map((task) => {
              const bucket = dueBucket(task, now);
              return <tr key={task.id} className={`border-t border-vscode-border ${bucket === "overdue" ? "bg-red-950/20" : ""}`}>
                <td className="px-3 py-2"><a href={task.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-vscode-text hover:underline">{task.name}<ExternalLink size={11} className="shrink-0 text-vscode-muted" /></a></td>
                <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: task.statusColor || "#888" }} />{task.status}</span></td>
                <td className="px-3 py-2 text-vscode-muted">{task.assignees.length ? task.assignees.map((assignee) => assignee.name).join(", ") : "Unassigned"}</td>
                <td className={`px-3 py-2 ${bucket === "overdue" ? "font-semibold text-red-300" : bucket === "today" ? "text-amber-300" : "text-vscode-muted"}`}>{bucket === "overdue" && <AlertTriangle size={11} className="mr-1 inline" />}{formatDue(task.dueDate)}</td>
                <td className={`px-3 py-2 capitalize ${PRIORITY_STYLE[task.priority || ""] || "text-vscode-muted"}`}>{task.priority || "—"}</td>
                <td className="px-3 py-2 text-vscode-muted">{task.listName}</td>
              </tr>;
            })}
            {!visible.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-vscode-muted">{tasks.length ? "No tasks match these filters." : snapshot?.syncing ? "Checking ClickUp…" : "No open tasks."}</td></tr>}
          </tbody>
        </table>
      </div>
    </>}
  </section>;
}
