// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleMeetingModal } from "./ScheduleMeetingModal";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ScheduleMeetingModal", () => {
  it("saves a scheduled meeting with status 'scheduled' and no summary yet", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "success" }) });
    vi.stubGlobal("fetch", fetchMock);
    const onScheduled = vi.fn();
    render(<ScheduleMeetingModal onClose={vi.fn()} onScheduled={onScheduled} />);
    fireEvent.change(screen.getByLabelText(/Meeting title/), { target: { value: "Network upgrade review" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Board Room" } });
    fireEvent.click(screen.getByRole("button", { name: "Schedule meeting" }));
    await waitFor(() => expect(onScheduled).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/meetings");
    const meeting = JSON.parse(init.body).meeting;
    expect(meeting.status).toBe("scheduled");
    expect(meeting.title).toBe("Network upgrade review");
    expect(meeting.location).toBe("Board Room");
    expect(meeting.summary).toBe("");
  });

  it("refuses an end time before the start time and does not save", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ScheduleMeetingModal onClose={vi.fn()} onScheduled={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Meeting title/), { target: { value: "Check" } });
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "11:00" } });
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Schedule meeting" }));
    expect(screen.getByRole("alert").textContent).toContain("end time must be after");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps Schedule disabled until a title is entered", () => {
    render(<ScheduleMeetingModal onClose={vi.fn()} onScheduled={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Schedule meeting" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
