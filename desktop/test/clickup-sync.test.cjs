const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { ClickUpSync, parseListId, normalizeTask, findChanges, mergeChangedTasks } = require("../src/clickup-sync.cjs");

const TOKEN = "pk_test_token";
const LISTS = [{ id: "L1", name: "Requests" }, { id: "L2", name: "Initiatives" }];

function apiTask(id, overrides = {}) {
  return {
    id,
    name: `Task ${id}`,
    status: { status: "to do", type: "open", color: "#d3d3d3" },
    assignees: [{ id: 42, username: "Me", email: "me@example.com" }],
    due_date: null,
    priority: null,
    url: `https://app.clickup.com/t/${id}`,
    list: { id: "L1", name: "Requests" },
    date_updated: "1700000000000",
    ...overrides,
  };
}

// Simulated ClickUp API. `handler(route)` returns a body, or { status, body, headers }.
function fakeClickUp(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const route = url.replace("https://api.clickup.com/api/v2", "");
    calls.push({ route, authorization: init?.headers?.Authorization });
    const result = handler(route) ?? { status: 404, body: { err: "not found" } };
    const isEnvelope = result && typeof result === "object" && "status" in result && "body" in result;
    const status = isEnvelope ? result.status : 200;
    const headers = new Map(Object.entries(isEnvelope ? result.headers || {} : {}));
    return { ok: status >= 200 && status < 300, status, headers: { get: (name) => headers.get(name.toLowerCase()) ?? null }, json: async () => (isEnvelope ? result.body : result) };
  };
  return { calls, fetchImpl };
}

function defaultRoutes(tasksByList, changed = []) {
  return (route) => {
    if (route === "/user") return { user: { id: 42, username: "Me" } };
    if (route === "/team") return { teams: [{ id: "T1", name: "Workspace" }] };
    const list = /^\/list\/(\w+)\/task\?page=(\d+)/.exec(route);
    if (list) return { tasks: Number(list[2]) === 0 ? (tasksByList[list[1]] || []) : [], last_page: true };
    if (route.startsWith("/team/T1/task?")) return { tasks: changed };
    return null;
  };
}

function makeSync(api, options = {}) {
  let clock = options.start ?? new Date(2026, 10, 25, 9, 0).getTime();
  const sync = new ClickUpSync({
    getToken: () => TOKEN,
    getLists: () => LISTS,
    cachePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mosaic-clickup-")), "snapshot.json"),
    fetchImpl: api.fetchImpl,
    now: () => clock,
    sleep: options.sleep || (async () => {}),
    notify: options.notify || (() => {}),
  });
  return { sync, advance: (ms) => { clock += ms; }, set: (time) => { clock = time; } };
}

test("reads List IDs from links and plain IDs", () => {
  assert.equal(parseListId("https://app.clickup.com/9018123/v/li/901801234567"), "901801234567");
  assert.equal(parseListId("https://app.clickup.com/9018123/v/l/6-901801234567-1"), "901801234567");
  assert.equal(parseListId(" 901801234567 "), "901801234567");
  assert.equal(parseListId("not a list link!"), null);
});

test("normalizes tasks, including assignees given as plain IDs and start dates", () => {
  const task = normalizeTask(apiTask("a", { assignees: ["7"], start_date: "1699000000000", due_date: "1700000000000", priority: { priority: "High" } }), { id: "L1", name: "Requests" });
  assert.deepEqual(task.assignees, [{ id: "7", name: "7", email: "" }]);
  assert.equal(task.startDate, 1699000000000);
  assert.equal(task.dueDate, 1700000000000);
  assert.equal(task.priority, "high");
});

test("first sync is a full pull: token sent as-is, done tasks dropped, as-of time recorded", async () => {
  const api = fakeClickUp(defaultRoutes({ L1: [apiTask("a"), apiTask("b", { status: { status: "complete", type: "done" } })], L2: [apiTask("c", { list: { id: "L2", name: "Initiatives" } })] }));
  const { sync } = makeSync(api);
  const snapshot = await sync.refresh();
  assert.deepEqual(snapshot.tasks.map((task) => task.id).sort(), ["a", "c"]);
  assert.ok(api.calls.every((call) => call.authorization === TOKEN));
  assert.equal(snapshot.lastMode, "full");
  assert.equal(snapshot.status, "ok");
  assert.equal(snapshot.lastCheckedAt, new Date(2026, 10, 25, 9, 0).getTime());
});

test("later checks the same day use ONE request for all Lists and merge only the changes", async () => {
  let changed = [];
  const api = fakeClickUp((route) => defaultRoutes({ L1: [apiTask("a"), apiTask("b")] }, changed)(route));
  const { sync, advance } = makeSync(api);
  await sync.refresh();
  const callsAfterFull = api.calls.length;

  advance(10 * 60_000);
  changed = [];
  let snapshot = await sync.refresh();
  assert.equal(api.calls.length - callsAfterFull, 1, "nothing changed: exactly one request");
  assert.equal(snapshot.lastMode, "check");
  assert.equal(snapshot.lastRequestCount, 1);
  const check = api.calls.at(-1).route;
  assert.match(check, /^\/team\/T1\/task\?page=0&list_ids\[\]=L1&list_ids\[\]=L2&date_updated_gt=\d+&include_closed=true&subtasks=true$/);
  assert.equal(snapshot.lastCheckedAt, new Date(2026, 10, 25, 9, 10).getTime(), "as-of time moves even when nothing changed");

  advance(10 * 60_000);
  changed = [
    apiTask("a", { status: { status: "in progress", type: "custom" } }),
    apiTask("b", { status: { status: "closed", type: "closed" } }),
    apiTask("d", { list: { id: "L2", name: "Initiatives" } }),
  ];
  snapshot = await sync.refresh();
  assert.deepEqual(snapshot.tasks.map((task) => `${task.id}:${task.status}`).sort(), ["a:in progress", "d:to do"]);
  assert.equal(snapshot.lastRequestCount, 1);
});

test("the first check of a new day is a full pull again", async () => {
  const api = fakeClickUp(defaultRoutes({ L1: [apiTask("a")] }));
  const { sync, set } = makeSync(api);
  await sync.refresh();
  set(new Date(2026, 10, 26, 8, 0).getTime());
  const snapshot = await sync.refresh();
  assert.equal(snapshot.lastMode, "full");
});

test("Sync now always pulls everything, and is ignored for 30 seconds after", async () => {
  const api = fakeClickUp(defaultRoutes({ L1: [apiTask("a")] }));
  const { sync, advance } = makeSync(api);
  await sync.refresh();
  advance(60_000);
  let snapshot = await sync.refresh({ manual: true });
  assert.equal(snapshot.lastMode, "full");
  const calls = api.calls.length;
  advance(10_000);
  snapshot = await sync.refresh({ manual: true });
  assert.equal(api.calls.length, calls, "no requests during the cooldown");
  assert.equal(snapshot.manualCooldownUntil, new Date(2026, 10, 25, 9, 1, 30).getTime(), "cooldown ends 30 seconds after the last Sync now");
  advance(25_000);
  await sync.refresh({ manual: true });
  assert.ok(api.calls.length > calls, "allowed again after 30 seconds");
});

test("when ClickUp's limit is reached the saved tasks stay and a retry time is shown", async () => {
  let limited = false;
  const resetAt = Math.floor(new Date(2026, 10, 25, 9, 12).getTime() / 1000);
  const api = fakeClickUp((route) => (limited && route.startsWith("/team/T1/task")
    ? { status: 429, body: { err: "Rate limit" }, headers: { "x-ratelimit-reset": String(resetAt) } }
    : defaultRoutes({ L1: [apiTask("a")] })(route)));
  const { sync, advance } = makeSync(api);
  await sync.refresh();
  limited = true;
  advance(10 * 60_000);
  const snapshot = await sync.refresh();
  sync.stop();
  assert.equal(snapshot.status, "rate-limited");
  assert.equal(snapshot.retryAt, resetAt * 1000);
  assert.deepEqual(snapshot.tasks.map((task) => task.id), ["a"]);
  assert.equal(snapshot.lastCheckedAt, new Date(2026, 10, 25, 9, 0).getTime(), "as-of stays at the last successful check");
});

test("waits for the reset when ClickUp says only a few requests are left", async () => {
  const waits = [];
  const reset = String(Math.floor(new Date(2026, 10, 25, 9, 0, 20).getTime() / 1000));
  const api = fakeClickUp((route) => {
    const body = defaultRoutes({ L1: [apiTask("a")] })(route);
    return body && { status: 200, body, headers: { "x-ratelimit-remaining": "2", "x-ratelimit-reset": reset } };
  });
  const { sync } = makeSync(api, { sleep: async (ms) => { waits.push(ms); } });
  await sync.refresh();
  assert.ok(waits.length > 0 && waits.every((ms) => ms > 0 && ms <= 65_000));
});

test("notifies new tasks and status changes for my tasks, but never on the first sync", async () => {
  let changed = [];
  const notifications = [];
  const api = fakeClickUp((route) => defaultRoutes({ L1: [apiTask("a")] }, changed)(route));
  const { sync, advance } = makeSync(api, { notify: (change) => notifications.push(change) });
  await sync.refresh();
  assert.equal(notifications.length, 0);
  advance(10 * 60_000);
  changed = [apiTask("a", { status: { status: "in progress", type: "custom" } }), apiTask("b"), apiTask("c", { assignees: [{ id: 99, username: "Someone else" }] })];
  await sync.refresh();
  assert.deepEqual(notifications.map((change) => `${change.kind}:${change.task.id}`).sort(), ["new:b", "status:a"]);
});

test("due-soon reminders are sent once per task per day", () => {
  const now = Date.UTC(2026, 10, 24, 1, 0, 0);
  const task = normalizeTask(apiTask("a", { due_date: String(now + 3 * 60 * 60_000) }), { id: "L1", name: "Requests" });
  const first = findChanges([task], [task], { userId: "42", now });
  assert.deepEqual(first.changes.map((change) => change.kind), ["due"]);
  const second = findChanges([task], [task], { userId: "42", now: now + 60_000, notifiedDue: first.notifiedDue });
  assert.equal(second.changes.length, 0);
});

test("merging changes ignores tasks from Lists that are not added", () => {
  const current = [normalizeTask(apiTask("a"), LISTS[0])];
  const other = normalizeTask(apiTask("x", { list: { id: "L9", name: "Other" } }));
  assert.deepEqual(mergeChangedTasks(current, [other], new Set(["L1", "L2"])).map((task) => task.id), ["a"]);
});

test("a rejected token is reported and the saved tasks are kept", async () => {
  const api = fakeClickUp(() => ({ status: 401, body: { err: "Token invalid" } }));
  const { sync } = makeSync(api);
  const snapshot = await sync.refresh();
  assert.equal(snapshot.status, "error");
  assert.match(snapshot.lastError, /rejected the API token/);
});
