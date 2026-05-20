import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname } from "path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { TaskItem } from "@shared/types/task";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@main/__tests__/test-temp-root");

  return {
    tempRoot: createTestTempRoot("fyllocode-task-store-"),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

import { loadTasks, saveTasks, tasksPath } from "@main/infra/storage/task-store";

const projectPath = "/tmp/project";

function task(overrides: Partial<TaskItem> = {}): TaskItem {
  const now = new Date("2026-05-10T00:00:00.000Z");
  return {
    id: "task-1",
    projectId: "tmp-project",
    title: "Fix bug",
    description: { format: "plain_text", content: "Details" },
    status: "open",
    source: "local",
    sourceMeta: { source: "local" },
    labels: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("task-store", () => {
  it("resolves project scoped tasks path", () => {
    expect(tasksPath(projectPath)).toBe(`${tempRoot}/projects/tmp-project/tasks/tasks.json`);
  });

  it("returns empty list when tasks file does not exist", async () => {
    await expect(loadTasks(projectPath)).resolves.toEqual([]);
  });

  it("round-trips tasks with versioned document format", async () => {
    const item = task();

    await saveTasks(projectPath, [item]);

    const raw = JSON.parse(readFileSync(tasksPath(projectPath), "utf8")) as {
      version: number;
      tasks: Array<{ id: string; createdAt: string; updatedAt: string }>;
    };

    expect(raw.version).toBe(1);
    expect(raw.tasks[0]).toMatchObject({
      id: "task-1",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    await expect(loadTasks(projectPath)).resolves.toEqual([item]);
  });

  it("normalizes persisted tasks with missing optional fields", async () => {
    mkdirSync(dirname(tasksPath(projectPath)), { recursive: true });
    writeFileSync(
      tasksPath(projectPath),
      JSON.stringify({
        version: 1,
        tasks: [
          {
            id: "task-1",
            title: "Stored task",
            description: {
              format: "plain_text",
              content: "",
            },
            createdAt: "2026-05-10T00:00:00.000Z",
            updatedAt: "2026-05-10T00:00:00.000Z",
          },
        ],
      }),
      "utf8"
    );

    await expect(loadTasks(projectPath)).resolves.toEqual([
      task({
        title: "Stored task",
        description: { format: "plain_text", content: "" },
        status: "open",
        source: "local",
        sourceMeta: { source: "local" },
        labels: [],
        assignee: undefined,
      }),
    ]);
  });

  it("drops persisted tasks with legacy string descriptions", async () => {
    mkdirSync(dirname(tasksPath(projectPath)), { recursive: true });
    writeFileSync(
      tasksPath(projectPath),
      JSON.stringify({
        version: 1,
        tasks: [
          {
            id: "task-legacy",
            title: "Legacy task",
            description: "string description",
            createdAt: "2026-05-10T00:00:00.000Z",
            updatedAt: "2026-05-10T00:00:00.000Z",
          },
        ],
      }),
      "utf8"
    );

    await expect(loadTasks(projectPath)).resolves.toEqual([]);
  });
});
