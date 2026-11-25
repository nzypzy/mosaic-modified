export type ClickUpAssignee = { id: string; name: string; email: string };

export type ClickUpPendingTask = {
  id: string;
  name: string;
  status: string;
  statusType: string;
  statusColor: string;
  assignees: ClickUpAssignee[];
  /** Optional: snapshots saved before start dates were tracked do not have it. */
  startDate?: number | null;
  dueDate: number | null;
  priority: "urgent" | "high" | "normal" | "low" | null;
  url: string;
  listId: string;
  listName: string;
  dateUpdated: number | null;
};

export type ClickUpListState = { id: string; name: string; error?: string | null; count?: number | null };

export type ClickUpSnapshot = {
  tasks: ClickUpPendingTask[];
  lists: ClickUpListState[];
  user: { id: string; name: string } | null;
  lastSyncedAt: number | null;
  lastError: string | null;
  syncing?: boolean;
  /** Last time Mosaic confirmed the data with ClickUp ("As of"). */
  lastCheckedAt?: number | null;
  lastFullSyncAt?: number | null;
  status?: "idle" | "no-token" | "checking" | "ok" | "rate-limited" | "offline" | "error";
  retryAt?: number | null;
  lastMode?: "full" | "check" | null;
  lastRequestCount?: number;
  manualCooldownUntil?: number | null;
};

export function formatAsOf(time: number | null | undefined) {
  if (!time) return null;
  return new Date(time).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The "As of … · state" line shown next to ClickUp data. */
export function syncStatusText(snapshot: ClickUpSnapshot | null, now = Date.now()) {
  if (!snapshot) return { asOf: null, state: "Loading…", tone: "muted" as const };
  const asOf = formatAsOf(snapshot.lastCheckedAt ?? snapshot.lastSyncedAt);
  const time = (value: number) => new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (snapshot.syncing || snapshot.status === "checking") return { asOf, state: "Checking ClickUp…", tone: "muted" as const };
  if (snapshot.status === "rate-limited") return { asOf, state: snapshot.retryAt && snapshot.retryAt > now ? `ClickUp limit reached, retrying at ${time(snapshot.retryAt)}` : "ClickUp limit reached, retrying soon", tone: "warn" as const };
  if (snapshot.status === "offline") return { asOf, state: "Offline, showing saved tasks", tone: "warn" as const };
  if (snapshot.status === "error" || snapshot.lastError) return { asOf, state: snapshot.lastError || "ClickUp could not be checked", tone: "error" as const };
  if (!asOf) return { asOf, state: "Not synced yet", tone: "muted" as const };
  return { asOf, state: "Up to date", tone: "ok" as const };
}

export type ClickUpStatus = {
  tokenSaved: boolean;
  encryptionAvailable: boolean;
  lists: Array<{ id: string; name: string }>;
  notifyScope: "mine" | "all";
  user: { id: string; name: string } | null;
  lastSyncedAt: number | null;
  lastError: string | null;
};

export type ClickUpBridge = {
  getClickUpStatus: () => Promise<ClickUpStatus>;
  getClickUpSnapshot: () => Promise<ClickUpSnapshot>;
  saveClickUpToken: (token: string) => Promise<ClickUpStatus>;
  removeClickUpToken: () => Promise<ClickUpStatus>;
  addClickUpList: (input: string) => Promise<ClickUpStatus>;
  removeClickUpList: (listId: string) => Promise<ClickUpStatus>;
  setClickUpNotifyScope: (scope: "mine" | "all") => Promise<ClickUpStatus>;
  refreshClickUp: () => Promise<ClickUpSnapshot>;
  onClickUpUpdated: (listener: (snapshot: ClickUpSnapshot) => void) => () => void;
  onClickUpOpen?: (listener: () => void) => () => void;
};

export function clickUpBridge(): ClickUpBridge | undefined {
  if (typeof window === "undefined") return undefined;
  const bridge = (window as Window & { mosaicDesktop?: Partial<ClickUpBridge> }).mosaicDesktop;
  return bridge?.getClickUpSnapshot ? bridge as ClickUpBridge : undefined;
}

export type DueFilter = "all" | "overdue" | "today" | "week" | "none";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(time: number) {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function isOverdue(task: ClickUpPendingTask, now = Date.now()) {
  return task.dueDate !== null && task.dueDate < startOfDay(now);
}

export function dueBucket(task: ClickUpPendingTask, now = Date.now()): "overdue" | "today" | "week" | "later" | "none" {
  if (task.dueDate === null) return "none";
  const today = startOfDay(now);
  if (task.dueDate < today) return "overdue";
  if (task.dueDate < today + DAY_MS) return "today";
  if (task.dueDate < today + 7 * DAY_MS) return "week";
  return "later";
}

export type ClickUpFilters = { listId: string; assignee: string; due: DueFilter; search: string };

export function filterTasks(tasks: ClickUpPendingTask[], filters: ClickUpFilters, userId: string | null, now = Date.now()) {
  const query = filters.search.trim().toLowerCase();
  return tasks.filter((task) => {
    if (filters.listId !== "all" && task.listId !== filters.listId) return false;
    if (filters.assignee === "me" && !(userId && task.assignees.some((assignee) => assignee.id === userId))) return false;
    if (filters.assignee === "unassigned" && task.assignees.length > 0) return false;
    if (!["all", "me", "unassigned"].includes(filters.assignee) && !task.assignees.some((assignee) => assignee.id === filters.assignee)) return false;
    const bucket = dueBucket(task, now);
    if (filters.due === "overdue" && bucket !== "overdue") return false;
    if (filters.due === "today" && bucket !== "today") return false;
    if (filters.due === "week" && bucket !== "today" && bucket !== "week") return false;
    if (filters.due === "none" && bucket !== "none") return false;
    if (query && !`${task.name} ${task.status} ${task.listName} ${task.assignees.map((assignee) => assignee.name).join(" ")}`.toLowerCase().includes(query)) return false;
    return true;
  });
}

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

/** Overdue first, then by due date (no date last), then by priority. */
export function sortTasks(tasks: ClickUpPendingTask[]) {
  return [...tasks].sort((a, b) => {
    const dueA = a.dueDate ?? Number.MAX_SAFE_INTEGER;
    const dueB = b.dueDate ?? Number.MAX_SAFE_INTEGER;
    if (dueA !== dueB) return dueA - dueB;
    return (PRIORITY_ORDER[a.priority || ""] ?? 4) - (PRIORITY_ORDER[b.priority || ""] ?? 4);
  });
}

export function assigneeOptions(tasks: ClickUpPendingTask[]) {
  const seen = new Map<string, string>();
  for (const task of tasks) for (const assignee of task.assignees) if (assignee.id && !seen.has(assignee.id)) seen.set(assignee.id, assignee.name);
  return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** ClickUp status types: "open" is the first status (to do), "custom" covers in-between statuses (in progress, review, ...). */
export function progressGroup(task: ClickUpPendingTask): "in-progress" | "to-do" {
  return task.statusType === "open" ? "to-do" : "in-progress";
}

/** Local calendar day key, YYYY-MM-DD. */
export function localDateKey(time: number) {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export type CalendarTaskMark = { task: ClickUpPendingTask; kind: "due" | "start" | "span" };

const MAX_SPAN_DAYS = 120;

/**
 * Where each task appears on a calendar: its due day, its start day and the days in between
 * (timeline). Very long timelines are capped so one task cannot fill months of the calendar.
 */
export function calendarMarks(tasks: ClickUpPendingTask[]) {
  const byDay = new Map<string, CalendarTaskMark[]>();
  const add = (key: string, mark: CalendarTaskMark) => {
    const list = byDay.get(key);
    if (list) list.push(mark); else byDay.set(key, [mark]);
  };
  for (const task of tasks) {
    const start = task.startDate ?? null;
    const due = task.dueDate;
    if (start !== null && due !== null && start < due) {
      const cursor = new Date(start);
      cursor.setHours(0, 0, 0, 0);
      const dueKey = localDateKey(due);
      for (let day = 0; day <= MAX_SPAN_DAYS; day += 1) {
        const key = localDateKey(cursor.getTime());
        add(key, { task, kind: key === dueKey ? "due" : day === 0 ? "start" : "span" });
        if (key === dueKey) break;
        cursor.setDate(cursor.getDate() + 1);
      }
    } else if (due !== null) {
      add(localDateKey(due), { task, kind: "due" });
    } else if (start !== null) {
      add(localDateKey(start), { task, kind: "start" });
    }
  }
  return byDay;
}
