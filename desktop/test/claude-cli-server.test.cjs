const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const test = require("node:test");
const { ClaudeCliServer, CLAUDE_MODELS } = require("../src/claude-cli-server.cjs");

// A stand-in for the Claude Code process: records how it was started and lets the test
// write stream-json lines to its stdout.
function fakeSpawn(calls) {
  return (executable, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.stdinText = "";
    child.stdin.on("data", (chunk) => { child.stdinText += chunk; });
    child.killed = false;
    child.kill = () => { child.killed = true; setImmediate(() => child.emit("exit", null, "SIGTERM")); return true; };
    child.finish = (lines, code = 0) => {
      for (const line of lines) child.stdout.write(`${JSON.stringify(line)}\n`);
      setImmediate(() => child.emit("exit", code, null));
    };
    calls.push({ executable, args, options, child });
    return child;
  };
}

function makeServer(calls, events) {
  return new ClaudeCliServer((event) => events.push(event), () => "http://127.0.0.1:1234", {
    findExecutable: () => "C:\\fake\\claude.exe",
    spawnProcess: fakeSpawn(calls),
    scratchDirectory: fs.mkdtempSync(path.join(os.tmpdir(), "mosaic-claude-test-")),
  });
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("offers Sonnet, Opus and Haiku with Sonnet first", async () => {
  const server = makeServer([], []);
  assert.deepEqual((await server.listModels()).map((model) => model.model), ["sonnet", "opus", "haiku"]);
  assert.equal(CLAUDE_MODELS[0].model, "sonnet");
});

test("chat turns are limited to reading and writing inside Outputs, and stream text back", async () => {
  const calls = [];
  const events = [];
  const server = makeServer(calls, events);
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "mosaic-claude-workspace-"));
  const process_ = process.env;
  process.env = { ...process_, ANTHROPIC_API_KEY: "should-not-be-passed" };
  try {
    const { threadId } = await server.startThread(workspace);
    await server.sendMessage("What did I do today?", "sonnet");
  } finally {
    process.env = process_;
  }

  const { args, options, child } = calls[0];
  const flag = (name) => args[args.indexOf(name) + 1];
  assert.equal(flag("--model"), "sonnet");
  assert.equal(flag("--tools"), "Read,Glob,Grep,Write,Edit");
  assert.equal(flag("--allowedTools"), "Edit(./Outputs/**)");
  assert.equal(flag("--permission-prompts"), "none");
  assert.equal(flag("--permission-mode"), "default");
  assert.ok(args.includes("--session-id"), "first turn creates the session");
  assert.equal(options.cwd, fs.realpathSync.native(workspace), "short Windows path names are expanded");
  assert.equal(options.env.ANTHROPIC_API_KEY, undefined, "never bills an API key");
  await flush();
  assert.equal(child.stdinText, "What did I do today?");

  child.finish([
    { type: "system", subtype: "init", session_id: "s" },
    { type: "stream_event", event: { type: "content_block_start", content_block: { type: "text" } } },
    { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } } },
    { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "Notebook/day.json" } }] } },
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1" }] } },
    { type: "stream_event", event: { type: "content_block_start", content_block: { type: "text" } } },
    { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Done" } } },
    { type: "result", subtype: "success", is_error: false, result: "Hello\n\nDone" },
  ]);
  await flush(); await flush();

  const text = events.filter((event) => event.type === "item/agentMessage/delta").map((event) => event.delta).join("");
  assert.equal(text, "Hello\n\nDone");
  assert.ok(events.some((event) => event.type === "item/started" && event.params.item.tool === "Read"));
  assert.ok(events.some((event) => event.type === "item/completed" && event.params.item.id === "t1"));
  const completed = events.find((event) => event.type === "turn/completed");
  assert.equal(completed.params.turn.status, "completed");

  await server.sendMessage("And yesterday?", "haiku");
  assert.ok(calls[1].args.includes("--resume"), "later turns resume the same session");
  assert.equal(calls[1].args[calls[1].args.indexOf("--model") + 1], "haiku");
  calls[1].child.finish([{ type: "result", subtype: "success", is_error: false, result: "ok" }]);
  await flush(); await flush();
});

test("interrupting a chat turn stops Claude and reports it as interrupted", async () => {
  const calls = [];
  const events = [];
  const server = makeServer(calls, events);
  await server.startThread(fs.mkdtempSync(path.join(os.tmpdir(), "mosaic-claude-workspace-")));
  await server.sendMessage("Long task", "opus");
  assert.equal(await server.interruptTurn(), true);
  await flush(); await flush();
  assert.equal(calls[0].child.killed, true);
  assert.equal(events.find((event) => event.type === "turn/completed").params.turn.status, "interrupted");
});

test("one-shot requests run without tools or saved sessions and return the text result", async () => {
  const calls = [];
  const server = makeServer(calls, []);
  const pending = server.runOnce("Return JSON {\"ok\":true}", "haiku");
  const { args, child } = calls[0];
  assert.equal(args[args.indexOf("--tools") + 1], "");
  assert.ok(args.includes("--no-session-persistence"));
  assert.equal(args[args.indexOf("--model") + 1], "haiku");
  child.finish([{ type: "result", subtype: "success", is_error: false, result: "{\"ok\":true}" }]);
  assert.equal(await pending, "{\"ok\":true}");
});

test("one-shot errors explain a missing Claude sign-in", async () => {
  const calls = [];
  const server = makeServer(calls, []);
  const pending = server.runOnce("Summarize", "sonnet");
  calls[0].child.finish([{ type: "result", subtype: "success", is_error: true, result: "Not logged in · Please run /login" }], 1);
  await assert.rejects(pending, /not signed in/);
});

test("rejects models other than the Claude aliases", async () => {
  const server = makeServer([], []);
  await assert.rejects(server.runOnce("Hi", "gpt-6"), /Choose Claude Sonnet, Opus or Haiku/);
});
