// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Summary refinement runs through Claude (useEchoAI().runStructured), so the tests stub that call.
const runStructured = vi.fn();
vi.mock("@/features/ask-echo/components/EchoAI", () => ({ useEchoAI: () => ({ runStructured, isWorking: false }) }));

import { MeetingSummaryEditor } from "./MeetingWorkspaceContent";

afterEach(() => {
  cleanup();
  runStructured.mockReset();
});

describe("MeetingSummaryEditor", () => {
  it("lets the user choose a refinement style and sends it with the summary request", async () => {
    runStructured.mockResolvedValue({ summary: "Concise summary", bottom_line: "Decision pending." });
    render(
      <MeetingSummaryEditor
        summary="Original summary"
        bottomLine="Original bottom line"
        onChange={vi.fn()}
        notes="Agenda: renewal review"
        transcript="The team discussed renewal timing."
      />,
    );

    fireEvent.change(screen.getByLabelText("Refinement style"), { target: { value: "concise" } });
    fireEvent.click(screen.getByRole("button", { name: "Refine with AI" }));
    await waitFor(() => expect(runStructured).toHaveBeenCalled());

    const [instruction, , options] = runStructured.mock.calls[0];
    expect(instruction).toContain("concise style");
    expect(options).toEqual({ model: "sonnet" });
  });

  it("refines the summary using meeting notes and transcript, then keeps fields editable", async () => {
    runStructured.mockResolvedValue({ summary: "Refined summary", bottom_line: "Agreed to proceed." });
    const onChange = vi.fn();
    render(
      <MeetingSummaryEditor
        summary="Original summary"
        bottomLine="Original bottom line"
        onChange={onChange}
        notes="Agenda: renewal review"
        transcript="The team agreed to proceed."
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Refine with AI" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("Refined summary", "Agreed to proceed."));
    const [, context] = runStructured.mock.calls[0];
    expect(context).toContain("Meeting notes:\nAgenda: renewal review");
    expect(context).toContain("Transcript:\nThe team agreed to proceed.");
    expect(screen.getByLabelText("Summary")).toBeTruthy();
    expect(screen.getByLabelText("Bottom line")).toBeTruthy();
  });
});
