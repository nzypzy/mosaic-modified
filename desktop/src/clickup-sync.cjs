// Read-only ClickUp sync for the desktop app: keeps a local snapshot of the open tasks in the
// Lists the user added (in the Electron profile, never in the repo) and reports changes so Mosaic
// can show desktop notifications. Uses the user's personal API token.
//
// Request budget (ClickUp Free plan: 100 requests per minute per token):
// - Regular check (every 10 min): ONE "Get Filtered Team Tasks" request for all Lists, asking only
//   for tasks updated since the last check. Usually it returns nothing; changed tasks are merged in
//   (closed/done ones are dropped).
// - Full pull (all open tasks, List by List): the first check of each day, after the List set
//   changes, and on "Sync now". It catches what a change check cannot see (deleted or moved tasks).
// - The "who am I" and workspace lookups are cached for a day.
// - ClickUp's X-RateLimit-* headers are watched; when the budget runs low Mosaic waits for the
//   reset, and on a 429 it keeps the saved tasks and retries at the reset time.
const fs = require("node:fs");
const path = require("node:path");

const API_BASE = "https://api.clickup.com/api/v2";
const DEFAULT_INTERVAL_MS = 10 * 60_000;
const MANUAL_COOLDOWN_MS = 30_000;
const LOOKUP_CACHE_MS = 24 * 60 * 60_000;
const CHANGE_OVERLAP_MS = 60_000;
const MAX_PAGES = 50;
const PAGE_SIZE = 100;
const LOW_BUDGET = 5;
const MAX_INLINE_WAIT_MS = 65_000;
const DAY_MS = 24 * 60 * 60_000;
const PRIORITIES = new Set(["urgent", "high", "normal", "low"]);

class ClickUpApiError extends Error {
  constructor(message, status, retryAt = null) {
    super(message);
    this.name = "ClickUpApiError";
    this.status = status;
    this.retryAt = retryAt;
  }
}

/** X-RateLimit-Reset may be Unix seconds or milliseconds. */
function resetTime(headers) {
  const raw = Number(headers?.get?.("x-ratelimit-reset"));
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw < 1e12 ? raw * 1000 : raw;
}

async function clickUpRequest(token, route, fetchImpl = fetch, { onResponse } = {}) {
  if (!token) throw new ClickUpApiError("Add your ClickUp API token in Settings first.", 401);
  let response;
  try {
    response = await fetchImpl(`${API_BASE}${route}`, { headers: { Authorization: token, Accept: "application/json" } });
  } catch (error) {
    throw new ClickUpApiError(`Could not reach ClickUp. Check the internet connection. (${error instanceof Error ? error.message : error})`, 0);
  }
  onResponse?.(response);
  const body = await response.json().catch(() => ({}));
  if (response.ok) return body;
  if (response.status === 401) throw new ClickUpApiError("ClickUp rejected the API token. Create a new token in ClickUp and save it in Settings.", 401);
  if (response.status === 404) throw new ClickUpApiError("ClickUp could not find that List, or this token has no access to it.", 404);
  if (response.status === 429) throw new ClickUpApiError("ClickUp's request limit was reached.", 429, resetTime(response.headers) || Date.now() + 60_000);
  throw new ClickUpApiError(body?.err || `ClickUp returned an error (${response.status}).`, response.status);
}

/** Accepts a List ID or a ClickUp List link and returns the List ID. */
function parseListId(input) {
  const value = String(input || "").trim();
  if (!value) return null;
  const fromLink = /\/li\/([A-Za-z0-9-]+)/.exec(value) || /\/l\/6-([A-Za-z0-9]+)-\d+/.exec(value);
  if (fromLink) return fromLink[1];
  if (/^[A-Za-z0-9-]{1,64}$/.test(value)) return value;
  return null;
}

function toMillis(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeAssignee(entry) {
  if (entry && typeof entry === "object") {
    return {
      id: entry.id === undefined || entry.id === null ? "" : String(entry.id),
      name: String(entry.username || entry.email || entry.initials || "Unknown"),
      email: typeof entry.email === "string" ? entry.email : "",
    };
  }
  return { id: String(entry ?? ""), name: String(entry ?? "Unknown"), email: "" };
}

function normalizeTask(task, list) {
  const priority = typeof task?.priority?.priority === "string" ? task.priority.priority.toLowerCase() : null;
  const listId = String(task?.list?.id || list?.id || "");
  return {
    id: String(task.id),
    name: String(task.name || "Untitled task"),
    status: String(task?.status?.status || "open"),
    statusType: String(task?.status?.type || "open"),
    statusColor: typeof task?.status?.color === "string" ? task.status.color : "",
    assignees: Array.isArray(task.assignees) ? task.assignees.map(normalizeAssignee) : [],
    startDate: toMillis(task.start_date),
    dueDate: toMillis(task.due_date),
    priority: PRIORITIES.has(priority) ? priority : null,
    url: typeof task.url === "string" && task.url.startsWith("https://") ? task.url : `https://app.clickup.com/t/${encodeURIComponent(String(task.id))}`,
    listId,
    listName: String(task?.list?.name || list?.name || "List"),
    dateUpdated: toMillis(task.date_updated),
  };
}

/** Open = not closed and not in a done-type status. */
function isPending(task) {
  return task.statusType !== "closed" && task.statusType !== "done";
}

/**
 * Compares two snapshots and returns the notifications to show.
 * Only runs when a previous snapshot exists, so the first sync never floods notifications.
 */
function findChanges(previousTasks, nextTasks, { userId, scope = "mine", now = Date.now(), notifiedDue = {} } = {}) {
  const relevant = (task) => scope === "all" || (userId && task.assignees.some((assignee) => assignee.id === String(userId)));
  const previousById = new Map(previousTasks.map((task) => [task.id, task]));
  const changes = [];
  const nextNotifiedDue = {};
  const today = new Date(now).toISOString().slice(0, 10);
  for (const task of nextTasks) {
    if (!relevant(task)) continue;
    const before = previousById.get(task.id);
    if (!before) {
      changes.push({ kind: "new", task, title: "New ClickUp task", body: `${task.name} · ${task.listName}` });
    } else if (before.status !== task.status) {
      changes.push({ kind: "status", task, title: "ClickUp status changed", body: `${task.name}: ${before.status} → ${task.status}` });
    }
    if (task.dueDate && task.dueDate > now && task.dueDate - now <= DAY_MS) {
      if (notifiedDue[task.id] === today) nextNotifiedDue[task.id] = today;
      else {
        nextNotifiedDue[task.id] = today;
        changes.push({ kind: "due", task, title: "ClickUp task due within a day", body: `${task.name} · ${task.listName}` });
      }
    }
  }
  return { changes, notifiedDue: nextNotifiedDue };
}

/** Applies changed tasks from a change check: updates open ones, drops closed/done ones. */
function mergeChangedTasks(currentTasks, changedTasks, listIds) {
  const byId = new Map(currentTasks.map((task) => [task.id, task]));
  for (const task of changedTasks) {
    if (!listIds.has(task.listId) || !isPending(task)) byId.delete(task.id);
    else byId.set(task.id, task);
  }
  return [...byId.values()];
}

function listsSignature(lists) {
  return lists.map((list) => list.id).sort().join(",");
}

function localDay(time) {
  const date = new Date(time);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

const EMPTY_STATE = {
  tasks: [], lists: [], user: null, teamIds: [], lookupsAt: null,
  lastSyncedAt: null, lastCheckedAt: null, lastFullSyncAt: null, listsSignature: "",
  status: "idle", lastError: null, retryAt: null, lastMode: null, lastRequestCount: 0,
  notifiedDue: {}, syncing: false, manualCooldownUntil: null,
};

class ClickUpSync {
  constructor({ getToken, getLists, getNotifyScope = () => "mine", cachePath, onUpdate = () => {}, notify = () => {}, fetchImpl = fetch, intervalMs = DEFAULT_INTERVAL_MS, now = () => Date.now(), sleep }) {
    this.getToken = getToken;
    this.getLists = getLists;
    this.getNotifyScope = getNotifyScope;
    this.cachePath = cachePath;
    this.onUpdate = onUpdate;
    this.notify = notify;
    this.fetchImpl = fetchImpl;
    this.intervalMs = intervalMs;
    this.now = now;
    this.sleep = sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.timer = null;
    this.retryTimer = null;
    this.running = null;
    this.budget = { remaining: null, resetAt: null };
    this.state = this.readCache();
  }

  readCache() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.cachePath, "utf8"));
      return { ...EMPTY_STATE, ...saved, lastCheckedAt: saved.lastCheckedAt ?? saved.lastSyncedAt ?? null, syncing: false, manualCooldownUntil: null };
    } catch {
      return { ...EMPTY_STATE };
    }
  }

  writeCache() {
    try {
      fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
      const { syncing, manualCooldownUntil, ...saved } = this.state;
      fs.writeFileSync(this.cachePath, JSON.stringify(saved), { encoding: "utf8", mode: 0o600 });
    } catch (error) {
      console.error("Could not save the ClickUp snapshot:", error);
    }
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  setState(patch) {
    this.state = { ...this.state, ...patch };
    this.onUpdate(this.snapshot());
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.refresh().catch(() => {}); }, this.intervalMs);
    if (this.getToken() && this.getLists().length) void this.refresh().catch(() => {});
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.timer = null;
    this.retryTimer = null;
  }

  clear() {
    this.state = { ...EMPTY_STATE };
    try { fs.rmSync(this.cachePath, { force: true }); } catch { /* nothing cached */ }
    this.onUpdate(this.snapshot());
  }

  /**
   * full: pull every open task List by List. manual: "Sync now" (always full, 30-second cooldown).
   * Without options Mosaic decides: a change check, or a full pull when one is due.
   */
  async refresh({ full = false, manual = false } = {}) {
    if (manual) {
      const until = this.state.manualCooldownUntil;
      if (until && until > this.now()) return this.snapshot();
      this.state.manualCooldownUntil = this.now() + MANUAL_COOLDOWN_MS;
    }
    if (this.running) return this.running;
    this.running = this.runRefresh({ full: full || manual }).finally(() => { this.running = null; });
    return this.running;
  }

  async request(token, route, counter) {
    const { remaining, resetAt } = this.budget;
    if (remaining !== null && remaining <= LOW_BUDGET && resetAt && resetAt > this.now()) {
      const wait = resetAt - this.now() + 500;
      if (wait > MAX_INLINE_WAIT_MS) throw new ClickUpApiError("ClickUp's request limit is almost used up.", 429, resetAt);
      await this.sleep(wait);
    }
    counter.count += 1;
    return clickUpRequest(token, route, this.fetchImpl, {
      onResponse: (response) => {
        const left = Number(response.headers?.get?.("x-ratelimit-remaining"));
        this.budget = { remaining: Number.isFinite(left) ? left : null, resetAt: resetTime(response.headers) };
      },
    });
  }

  async lookups(token, counter) {
    const fresh = this.state.lookupsAt && this.now() - this.state.lookupsAt < LOOKUP_CACHE_MS && this.state.user && this.state.teamIds.length;
    if (fresh) return { user: this.state.user, teamIds: this.state.teamIds, lookupsAt: this.state.lookupsAt };
    const me = await this.request(token, "/user", counter);
    const teams = await this.request(token, "/team", counter);
    return {
      user: me?.user ? { id: String(me.user.id), name: String(me.user.username || me.user.email || "") } : null,
      teamIds: (Array.isArray(teams?.teams) ? teams.teams : []).map((team) => String(team.id)).filter(Boolean),
      lookupsAt: this.now(),
    };
  }

  async fullPull(token, lists, counter) {
    const tasks = [];
    const listStates = [];
    for (const list of lists) {
      try {
        const listTasks = [];
        for (let page = 0; page < MAX_PAGES; page += 1) {
          const body = await this.request(token, `/list/${encodeURIComponent(list.id)}/task?page=${page}&include_closed=false&subtasks=true&archived=false`, counter);
          const pageTasks = Array.isArray(body.tasks) ? body.tasks : [];
          for (const task of pageTasks) if (task && task.id !== undefined) listTasks.push(normalizeTask(task, list));
          if (body.last_page !== false || pageTasks.length === 0) break;
        }
        const open = listTasks.filter(isPending);
        tasks.push(...open);
        listStates.push({ ...list, error: null, count: open.length });
      } catch (error) {
        if (error instanceof ClickUpApiError && [0, 401, 429].includes(error.status)) throw error;
        // Keep the last known tasks of a List that failed this time.
        tasks.push(...this.state.tasks.filter((task) => task.listId === list.id));
        listStates.push({ ...list, error: error instanceof Error ? error.message : String(error), count: null });
      }
    }
    return { tasks, listStates };
  }

  async changeCheck(token, lists, teamIds, since, counter) {
    const listQuery = lists.map((list) => `list_ids[]=${encodeURIComponent(list.id)}`).join("&");
    const changed = [];
    for (const teamId of teamIds) {
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const body = await this.request(token, `/team/${encodeURIComponent(teamId)}/task?page=${page}&${listQuery}&date_updated_gt=${Math.floor(since)}&include_closed=true&subtasks=true`, counter);
        const pageTasks = Array.isArray(body.tasks) ? body.tasks : [];
        for (const task of pageTasks) if (task && task.id !== undefined) changed.push(normalizeTask(task, lists.find((list) => list.id === String(task?.list?.id))));
        if (pageTasks.length < PAGE_SIZE) break;
      }
    }
    return changed;
  }

  async runRefresh({ full }) {
    const token = this.getToken();
    const lists = this.getLists();
    if (!token || !lists.length) {
      this.setState({ tasks: [], lists: lists.map((list) => ({ ...list, error: null, count: 0 })), status: token ? "idle" : "no-token", lastError: token ? null : "Add your ClickUp API token in Settings.", syncing: false });
      return this.snapshot();
    }
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    this.setState({ syncing: true, status: "checking" });
    const startedAt = this.now();
    const counter = { count: 0 };
    try {
      const lookup = await this.lookups(token, counter);
      const signature = listsSignature(lists);
      const needsFull = full
        || !this.state.lastCheckedAt
        || !this.state.lastFullSyncAt
        || this.state.listsSignature !== signature
        || localDay(this.state.lastFullSyncAt) !== localDay(startedAt)
        || !lookup.teamIds.length;
      const previous = this.state.tasks;
      let tasks;
      let listStates;
      if (needsFull) {
        ({ tasks, listStates } = await this.fullPull(token, lists, counter));
      } else {
        const changed = await this.changeCheck(token, lists, lookup.teamIds, this.state.lastCheckedAt - CHANGE_OVERLAP_MS, counter);
        tasks = mergeChangedTasks(previous, changed, new Set(lists.map((list) => list.id)));
        listStates = lists.map((list) => ({ ...list, error: null, count: tasks.filter((task) => task.listId === list.id).length }));
      }
      const hadSnapshot = Boolean(this.state.lastCheckedAt);
      const { changes, notifiedDue } = findChanges(hadSnapshot ? previous : tasks, tasks, { userId: lookup.user?.id, scope: this.getNotifyScope(), now: startedAt, notifiedDue: this.state.notifiedDue });
      this.state = {
        ...this.state,
        ...lookup,
        tasks,
        lists: listStates,
        lastCheckedAt: startedAt,
        lastSyncedAt: startedAt,
        lastFullSyncAt: needsFull ? startedAt : this.state.lastFullSyncAt,
        listsSignature: signature,
        status: "ok",
        lastError: null,
        retryAt: null,
        lastMode: needsFull ? "full" : "check",
        lastRequestCount: counter.count,
        notifiedDue,
        syncing: false,
      };
      this.writeCache();
      for (const change of changes.slice(0, 5)) this.notify(change);
      if (changes.length > 5) this.notify({ kind: "summary", title: "ClickUp updates", body: `${changes.length - 5} more changes in your ClickUp Lists.` });
    } catch (error) {
      const status = error instanceof ClickUpApiError ? error.status : -1;
      const retryAt = status === 429 ? (error.retryAt || this.now() + 60_000) : null;
      this.state = {
        ...this.state,
        status: status === 429 ? "rate-limited" : status === 0 ? "offline" : "error",
        lastError: error instanceof Error ? error.message : String(error),
        retryAt,
        lastRequestCount: counter.count,
        syncing: false,
      };
      this.writeCache();
      if (retryAt) {
        this.retryTimer = setTimeout(() => { this.retryTimer = null; void this.refresh().catch(() => {}); }, Math.max(1_000, retryAt - this.now() + 1_000));
        this.retryTimer.unref?.();
      }
    }
    this.onUpdate(this.snapshot());
    return this.snapshot();
  }
}

module.exports = { ClickUpSync, ClickUpApiError, clickUpRequest, parseListId, normalizeTask, isPending, findChanges, mergeChangedTasks, MANUAL_COOLDOWN_MS };
