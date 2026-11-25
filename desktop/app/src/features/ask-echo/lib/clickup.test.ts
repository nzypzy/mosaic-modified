import { afterEach, describe, expect, it, vi } from "vitest";
import { loadClickUpContext } from "./clickup";

describe("loadClickUpContext", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("fetches only lists belonging to pages the user can access", async () => {
    vi.stubEnv("MOSAIC_CLICKUP_DAILY_LOG_LIST_ID", "daily-log-list");
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tasks: [] }) });
    await loadClickUpContext({ token: "token", pages: ["tasks"], taskListId: "task-list", fetcher: fetcher as any });
    const urls = fetcher.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes("task-list"))).toBe(true);
    expect(urls.some((url) => url.includes("daily-log-list"))).toBe(false);
  });

  it("labels notebook records so the UI can open the matching page", async () => {
    vi.stubEnv("MOSAIC_CLICKUP_DAILY_LOG_LIST_ID", "daily-log-list");
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tasks: [{ id: "log-1", name: "September 12, 2026 - Alex", text_content: "Completed the proposal", url: "https://app.clickup.com/t/log-1" }] }) });
    const sources = await loadClickUpContext({ token: "token", pages: ["notebook"], taskListId: "", fetcher: fetcher as any });
    expect(sources[0]).toMatchObject({ page: "notebook", meetingId: "log-1", meetingTitle: "September 12, 2026 - Alex" });
  });
});
