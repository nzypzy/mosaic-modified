// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePromptDialog } from "./PromptDialog";

function Harness({ onResult }: { onResult: (value: string | null) => void }) {
  const { ask, dialog } = usePromptDialog();
  return <div>
    <button type="button" onClick={() => void ask({ title: "New IT project", label: "Project name", confirmLabel: "Create project" }).then(onResult)}>Open</button>
    {dialog}
  </div>;
}

afterEach(cleanup);

describe("in-app prompt dialog (replaces window.prompt, which Electron does not support)", () => {
  it("returns the typed text and closes", async () => {
    const results: Array<string | null> = [];
    render(<Harness onResult={(value) => results.push(value)} />);
    fireEvent.click(screen.getByText("Open"));
    const input = screen.getByLabelText("Project name");
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "  Laptop refresh  " } });
    await act(async () => { fireEvent.click(screen.getByText("Create project")); });
    expect(results).toEqual(["Laptop refresh"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("returns null on Cancel or Escape, and cannot submit empty text", async () => {
    const results: Array<string | null> = [];
    render(<Harness onResult={(value) => results.push(value)} />);
    fireEvent.click(screen.getByText("Open"));
    expect((screen.getByText("Create project") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.click(screen.getByText("Cancel")); });
    fireEvent.click(screen.getByText("Open"));
    await act(async () => { fireEvent.keyDown(screen.getByLabelText("Project name"), { key: "Escape" }); });
    expect(results).toEqual([null, null]);
  });
});

function ChoiceHarness({ onResult }: { onResult: (value: unknown) => void }) {
  const { askWithChoice, dialog } = usePromptDialog();
  return <div>
    <button type="button" onClick={() => void askWithChoice({ title: "New IT project", label: "Project name", confirmLabel: "Create project", choices: [{ value: "general", label: "General" }, { value: "dev", label: "Development" }], defaultChoice: "general" }).then(onResult)}>Open with type</button>
    {dialog}
  </div>;
}

describe("prompt dialog with a type choice", () => {
  it("returns the name and the chosen type", async () => {
    const results: unknown[] = [];
    render(<ChoiceHarness onResult={(value) => results.push(value)} />);
    fireEvent.click(screen.getByText("Open with type"));
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Portal" } });
    fireEvent.click(screen.getByLabelText(/Development/));
    await act(async () => { fireEvent.click(screen.getByText("Create project")); });
    expect(results).toEqual([{ value: "Portal", choice: "dev" }]);
  });
});
