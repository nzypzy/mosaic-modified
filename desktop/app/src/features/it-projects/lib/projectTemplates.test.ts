import { describe, expect, it } from "vitest";
import { createBAProject, GENERAL_PHASES, normalizeBAState } from "./business-analysis";

describe("IT project types", () => {
  it("creates General projects by default, with their own phases and an empty task list", () => {
    const project = createBAProject("Laptop refresh");
    expect(project.template).toBe("general");
    expect(project.generalTasks).toEqual([]);
    expect(project.generalPhases.map((phase) => phase.name)).toEqual(GENERAL_PHASES.map((phase) => phase.name));
    expect(createBAProject("Portal", "dev").template).toBe("dev");
  });

  it("treats projects saved before project types existed as Development projects", () => {
    const legacy = { id: "p1", name: "Old project", requirements: [], phases: [] };
    const [project] = normalizeBAState({ projects: [legacy] }).projects;
    expect(project.template).toBe("dev");
    expect(project.generalTasks).toEqual([]);
    expect(project.generalPhases).toHaveLength(GENERAL_PHASES.length);
  });

  it("keeps General tasks, phase dates and deliverables through a save", () => {
    const project = createBAProject("Network audit");
    project.generalTasks = [{ id: "TASK-001", task: "Collect switch inventory", owner: "Alex", dueDate: "2026-12-01", status: "In Progress", priority: "High", notes: "Floors 2-4" }];
    project.generalPhases[0] = { ...project.generalPhases[0], startDate: "2026-11-25", deliverables: project.generalPhases[0].deliverables.map((item, index) => ({ ...item, done: index === 0 })) };
    const [saved] = normalizeBAState(JSON.parse(JSON.stringify({ projects: [project] }))).projects;
    expect(saved.template).toBe("general");
    expect(saved.generalTasks).toEqual(project.generalTasks);
    expect(saved.generalPhases[0].startDate).toBe("2026-11-25");
    expect(saved.generalPhases[0].deliverables[0].done).toBe(true);
  });

  it("keeps both types' data when a project switches type", () => {
    const project = { ...createBAProject("Switcher"), template: "dev" as const };
    project.generalTasks = [{ id: "TASK-001", task: "Kept", owner: "", dueDate: "", status: "To Do", priority: "", notes: "" }];
    const [saved] = normalizeBAState({ projects: [project] }).projects;
    expect(saved.template).toBe("dev");
    expect(saved.generalTasks[0].task).toBe("Kept");
  });
});
