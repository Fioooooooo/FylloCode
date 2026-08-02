import { afterEach, describe, expect, it } from "vitest";
import { rmSync } from "fs";
import { randomUUID } from "crypto";
import { createTask } from "@main/services/automation/task/task-service";
import { loadTasks, tasksPath } from "@main/infra/storage/task-store";

function tempProjectPath(): string {
  return `workspace-${randomUUID()}`;
}

function cleanupProject(projectPath: string): void {
  try {
    rmSync(tasksPath(projectPath), { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors.
  }
}

describe("task-store concurrency", () => {
  afterEach(() => {
    // Each test cleans up its own path; nothing global to restore.
  });

  it("does not lose tasks when two createTask calls race", async () => {
    const projectPath = tempProjectPath();

    try {
      const [first, second] = await Promise.all([
        createTask(projectPath, { title: "Task A" }),
        createTask(projectPath, { title: "Task B" }),
      ]);

      expect(first.id).not.toBe(second.id);

      const tasks = await loadTasks(projectPath);
      expect(tasks).toHaveLength(2);
      expect(tasks.map((t) => t.title).sort()).toEqual(["Task A", "Task B"]);
    } finally {
      cleanupProject(projectPath);
    }
  });

  it("returns the same task for concurrent duplicate actionIds", async () => {
    const projectPath = tempProjectPath();

    try {
      const [first, second] = await Promise.all([
        createTask(projectPath, { title: "Task A" }, { actionId: "shared-action" }),
        createTask(projectPath, { title: "Task B" }, { actionId: "shared-action" }),
      ]);

      expect(first.id).toBe(second.id);
      expect(first.title).toBe("Task A");

      const tasks = await loadTasks(projectPath);
      expect(tasks).toHaveLength(1);
    } finally {
      cleanupProject(projectPath);
    }
  });
});
