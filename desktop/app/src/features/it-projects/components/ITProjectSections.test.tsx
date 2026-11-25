// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ITProjectSections } from "./ITProjectSections";
import { createBAProject, DEFAULT_BA_COLUMN_WIDTHS } from "../lib/business-analysis";
import type { BAProject, BAProjectTemplate } from "../types/business-analysis";

afterEach(cleanup);

function Harness({ template }: { template: BAProjectTemplate }) {
  const [project, setProject] = useState<BAProject>(() => createBAProject("Test project", template));
  return <ITProjectSections
    project={project}
    updateProject={(updater) => setProject((current) => updater(current))}
    updateRequirement={() => {}}
    addRequirement={() => {}}
    onRequestDeleteRequirement={() => {}}
    onViewRequirement={() => {}}
    reports={() => <p>Reports content</p>}
    renderRequirementCard={() => null}
    tableColumnWidths={DEFAULT_BA_COLUMN_WIDTHS}
    resizeColumn={() => {}}
    filterCategory="All categories"
    filterPriority="All priorities"
    onFilterCategoryChange={() => {}}
    onFilterPriorityChange={() => {}}
  />;
}

const tabNames = () => screen.getAllByRole("tab").map((tab) => tab.textContent);

describe("IT project sections by project type", () => {
  it("General projects show Overview, Tasks and Reports with the general timeline", () => {
    render(<Harness template="general" />);
    expect(tabNames()).toEqual(["Overview", "Tasks", "Reports"]);
    expect(screen.getByText("Initiation")).toBeDefined();
    expect(screen.queryByText("Discovery & Elicitation")).toBeNull();
  });

  it("Development projects keep the full delivery layout", () => {
    render(<Harness template="dev" />);
    expect(tabNames()).toEqual(["Dashboard", "Product Backlog", "Sprint Backlog", "RTM", "System Design and Architecture", "End to End Process", "Deployment", "Reports"]);
    expect(screen.getByText("Discovery & Elicitation")).toBeDefined();
  });

  it("adds a General task with owner, due date and status fields", () => {
    render(<Harness template="general" />);
    fireEvent.click(screen.getByRole("tab", { name: "Tasks" }));
    fireEvent.click(screen.getAllByText("Add item")[0]);
    expect(screen.getByLabelText("TASK-001 Task")).toBeDefined();
    expect(screen.getByLabelText("TASK-001 Owner")).toBeDefined();
    expect((screen.getByLabelText("TASK-001 Due date") as HTMLInputElement).type).toBe("date");
    expect(screen.getByLabelText("TASK-001 Status")).toBeDefined();
  });
});
