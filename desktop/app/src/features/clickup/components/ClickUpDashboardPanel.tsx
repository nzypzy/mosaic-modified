"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, ExternalLink, ListChecks } from "lucide-react";
import { dueBucket, progressGroup, sortTasks, type ClickUpPendingTask, type ClickUpSnapshot } from "../lib/clickupDesktop";
import { ClickUpSyncStatus } from "./ClickUpSyncStatus";

const ROWS_PER_COLUMN = 6;

function dueLabel(task: ClickUpPendingTask, now: number) {
  if (task.dueDate === null) return "No due date";
  const bucket = dueBucket(task, now);
  const date = new Date(task.dueDate).toLocaleDateString([], { month: "short", day: "numeric" });
  if (bucket === "overdue") return `Overdue · ${date}`;
  if (bucket === "today") return "Due today";
  return `Due ${date}`;
}

function TaskColumn({ title, tasks, now, onOpenClickUp }: { title: string; tasks: ClickUpPendingTask[]; now: number; onOpenClickUp?: () => void }) {
  const shown = tasks.slice(0, ROWS_PER_COLUMN);
  return <div className="min-w-0">
    <div className="mb-2 flex items-center justify-between">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{title}</span>
      <span className="text-[10px] font-semibold text-[#003366]">{tasks.length}</span>
    </div>
    <ul className="space-y-1.5">
      {shown.map((task) => {
        const overdue = dueBucket(task, now) === "overdue";
        return <li key={task.id} className={`border px-3 py-2 ${overdue ? "border-red-500/40 bg-red-500/10" : "border-gray-200/90 bg-white/60"}`}>
          <a href={task.url} target="_blank" rel="noreferrer" className="flex items-start gap-1.5 text-xs font-semibold text-[#1b1d1e] hover:text-[#003366] hover:underline">
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{task.name}</span>
            <ExternalLink size={11} className="mt-0.5 shrink-0 text-gray-400" />
          </a>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-500">
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: task.statusColor || "#9ca3af" }} />{task.status}</span>
            <span className={overdue ? "font-semibold text-red-500" : ""}>{overdue && <AlertTriangle size={10} className="mr-0.5 inline" />}{dueLabel(task, now)}</span>
            <span className="truncate">{task.listName}</span>
          </div>
        </li>;
      })}
      {!tasks.length && <li className="border border-dashed border-gray-200 px-3 py-3 text-center text-[11px] text-gray-400">Nothing here</li>}
    </ul>
    {tasks.length > shown.length && onOpenClickUp && <button type="button" onClick={onOpenClickUp} className="mt-2 text-[11px] font-semibold text-[#C9AB4C] hover:underline">+{tasks.length - shown.length} more</button>}
  </div>;
}

export function ClickUpDashboardPanel({ snapshot, onOpenClickUp }: { snapshot: ClickUpSnapshot | null; onOpenClickUp?: () => void }) {
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [now] = useState(() => Date.now());
  const userId = snapshot?.user?.id || null;
  const tasks = useMemo(() => {
    const all = snapshot?.tasks || [];
    return scope === "mine" && userId ? all.filter((task) => task.assignees.some((assignee) => assignee.id === userId)) : all;
  }, [snapshot?.tasks, scope, userId]);
  const inProgress = useMemo(() => sortTasks(tasks.filter((task) => progressGroup(task) === "in-progress")), [tasks]);
  const toDo = useMemo(() => sortTasks(tasks.filter((task) => progressGroup(task) === "to-do")), [tasks]);
  const overdue = tasks.filter((task) => dueBucket(task, now) === "overdue").length;

  if (!snapshot) return null;
  const connected = snapshot.lists.length > 0;

  return <div className="rounded-none border border-gray-200/90 bg-[#FFFCFB] p-5 shadow-2xs">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <ListChecks size={16} className="text-[#003366]" />
        <span className="text-xs font-bold uppercase tracking-widest text-[#003366]">ClickUp work</span>
        {connected && <span className="text-[11px] text-gray-500">{inProgress.length} in progress · {toDo.length} to do{overdue ? <span className="font-semibold text-red-500"> · {overdue} overdue</span> : null}</span>}
      </div>
      <div className="flex items-center gap-2">
        {connected && userId && <div className="inline-flex border border-gray-200 text-[11px]">
          {(["mine", "all"] as const).map((value) => <button key={value} type="button" onClick={() => setScope(value)} className={`px-2.5 py-1 font-semibold ${scope === value ? "border-b border-[#C9AB4C] text-[#1b1d1e]" : "text-gray-500 hover:text-gray-900"}`}>{value === "mine" ? "Assigned to me" : "All"}</button>)}
        </div>}
        {onOpenClickUp && <button type="button" onClick={onOpenClickUp} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#003366] hover:underline">Open ClickUp <ArrowRight size={12} /></button>}
      </div>
    </div>
    {!connected
      ? <p className="text-xs text-gray-500">Connect ClickUp in Settings to see your in-progress and to-do tasks here.</p>
      : <>
        <div className="mb-3"><ClickUpSyncStatus snapshot={snapshot} compact /></div>
        <div className="grid gap-5 md:grid-cols-2">
          <TaskColumn title="In progress" tasks={inProgress} now={now} onOpenClickUp={onOpenClickUp} />
          <TaskColumn title="To do" tasks={toDo} now={now} onOpenClickUp={onOpenClickUp} />
        </div>
        {scope === "mine" && userId && !tasks.length && (snapshot.tasks.length > 0) && <p className="mt-3 text-[11px] text-gray-500">No open tasks are assigned to you. Switch to All to see the {snapshot.tasks.length} open tasks in your Lists.</p>}
      </>}
  </div>;
}
