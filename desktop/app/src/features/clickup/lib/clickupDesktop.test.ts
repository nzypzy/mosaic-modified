import { describe, expect, it } from "vitest";
import { assigneeOptions, calendarMarks, dueBucket, filterTasks, localDateKey, progressGroup, sortTasks, syncStatusText, type ClickUpPendingTask } from "./clickupDesktop";

const NOW = new Date(2026, 10, 24, 10, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

function task(id: string, overrides: Partial<ClickUpPendingTask> = {}): ClickUpPendingTask {
  return {
    id, name: `Task ${id}`, status: "to do", statusType: "open", statusColor: "", assignees: [],
    dueDate: null, priority: null, url: `https://app.clickup.com/t/${id}`, listId: "L1", listName: "Requests", dateUpdated: null,
    ...overrides,
  };
}

describe("ClickUp pending task filters", () => {
  const me = { id: "42", name: "Me", email: "" };
  const other = { id: "7", name: "Bea", email: "" };
  const tasks = [
    task("overdue", { dueDate: NOW - 2 * DAY, assignees: [me] }),
    task("today", { dueDate: NOW + 60_000, assignees: [other] }),
    task("week", { dueDate: NOW + 3 * DAY, listId: "L2", listName: "Initiatives" }),
    task("later", { dueDate: NOW + 30 * DAY, priority: "urgent" }),
    task("none", { name: "Printer request" }),
  ];
  const all = { listId: "all", assignee: "all", due: "all" as const, search: "" };

  it("buckets due dates relative to today", () => {
    expect(tasks.map((item) => dueBucket(item, NOW))).toEqual(["overdue", "today", "week", "later", "none"]);
  });

  it("filters by due date, assignee, List and search text", () => {
    const ids = (filters: Parameters<typeof filterTasks>[1]) => filterTasks(tasks, filters, "42", NOW).map((item) => item.id);
    expect(ids({ ...all, due: "overdue" })).toEqual(["overdue"]);
    expect(ids({ ...all, due: "week" })).toEqual(["today", "week"]);
    expect(ids({ ...all, assignee: "me" })).toEqual(["overdue"]);
    expect(ids({ ...all, assignee: "7" })).toEqual(["today"]);
    expect(ids({ ...all, assignee: "unassigned" })).toEqual(["week", "later", "none"]);
    expect(ids({ ...all, listId: "L2" })).toEqual(["week"]);
    expect(ids({ ...all, search: "printer" })).toEqual(["none"]);
  });

  it("sorts overdue first and tasks without a due date last", () => {
    expect(sortTasks([...tasks].reverse()).map((item) => item.id)).toEqual(["overdue", "today", "week", "later", "none"]);
  });

  it("lists each assignee once", () => {
    expect(assigneeOptions(tasks)).toEqual([{ id: "7", name: "Bea" }, { id: "42", name: "Me" }]);
  });
});

describe("ClickUp dashboard and calendar helpers", () => {
  it("splits to-do (first status) from in-progress (custom statuses)", () => {
    expect(progressGroup(task("a", { statusType: "open" }))).toBe("to-do");
    expect(progressGroup(task("b", { statusType: "custom", status: "in progress" }))).toBe("in-progress");
  });

  it("marks the due day, and the start-to-due timeline when a task has both", () => {
    const start = new Date(2026, 10, 24, 9).getTime();
    const due = new Date(2026, 10, 26, 17).getTime();
    const marks = calendarMarks([
      task("timeline", { startDate: start, dueDate: due }),
      task("due-only", { dueDate: due }),
      task("start-only", { startDate: start }),
      task("undated"),
    ]);
    const kinds = (key: string) => (marks.get(key) || []).map((mark) => `${mark.task.id}:${mark.kind}`);
    expect(kinds("2026-11-24")).toEqual(["timeline:start", "start-only:start"]);
    expect(kinds("2026-11-25")).toEqual(["timeline:span"]);
    expect(kinds("2026-11-26")).toEqual(["timeline:due", "due-only:due"]);
    expect([...marks.keys()].sort()).toEqual(["2026-11-24", "2026-11-25", "2026-11-26"]);
  });

  it("uses local calendar days", () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 30).getTime())).toBe("2026-01-05");
  });
});

describe("ClickUp As-of status", () => {
  const base = { tasks: [], lists: [{ id: "L1", name: "Requests" }], user: null, lastSyncedAt: null, lastError: null };
  const checked = new Date(2026, 10, 25, 10, 42).getTime();

  it("shows the last confirmed time and Up to date", () => {
    const text = syncStatusText({ ...base, lastCheckedAt: checked, status: "ok" }, checked + 60_000);
    expect(text.asOf).toContain("2026");
    expect(text.state).toBe("Up to date");
    expect(text.tone).toBe("ok");
  });

  it("explains checking, rate limits and offline while keeping the As-of time", () => {
    expect(syncStatusText({ ...base, lastCheckedAt: checked, syncing: true }).state).toBe("Checking ClickUp…");
    const limited = syncStatusText({ ...base, lastCheckedAt: checked, status: "rate-limited", retryAt: checked + 3 * 60_000 }, checked + 60_000);
    expect(limited.state).toMatch(/^ClickUp limit reached, retrying at /);
    expect(limited.asOf).not.toBeNull();
    expect(syncStatusText({ ...base, lastCheckedAt: checked, status: "offline" }).state).toBe("Offline, showing saved tasks");
  });

  it("says Not synced yet before the first pull", () => {
    expect(syncStatusText({ ...base }).state).toBe("Not synced yet");
  });
});
