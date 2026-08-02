import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname } from "path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { TaskItem } from "@shared/types/task";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");

  return {
    tempRoot: createTestTempRoot("fyllocode-task-store-"),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

import { loadTasks, saveTasks, tasksPath } from "@main/infra/storage/task-store";

const workspaceId = "workspace-1";

function task(overrides: Partial<TaskItem> = {}): TaskItem {
  const now = new Date("2026-05-10T00:00:00.000Z");
  return {
    id: "task-1",
    workspaceId: "workspace-1",
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
  it("resolves Workspace-scoped tasks path", () => {
    expect(tasksPath(workspaceId)).toBe(`${tempRoot}/workspaces/workspace-1/tasks/tasks.json`);
  });

  it("returns empty list when tasks file does not exist", async () => {
    await expect(loadTasks(workspaceId)).resolves.toEqual([]);
  });

  it("round-trips tasks with versioned document format", async () => {
    const item = task();

    await saveTasks(workspaceId, [item]);

    const raw = JSON.parse(readFileSync(tasksPath(workspaceId), "utf8")) as {
      version: number;
      tasks: Array<{ id: string; createdAt: string; updatedAt: string }>;
    };

    expect(raw.version).toBe(1);
    expect(raw.tasks[0]).toMatchObject({
      id: "task-1",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    await expect(loadTasks(workspaceId)).resolves.toEqual([item]);
  });

  it("isolates the same task ID across Workspaces", async () => {
    await saveTasks("workspace-1", [task({ workspaceId: "workspace-1", title: "Workspace A" })]);
    await saveTasks("workspace-2", [task({ workspaceId: "workspace-2", title: "Workspace B" })]);

    await expect(loadTasks("workspace-1")).resolves.toEqual([
      task({ workspaceId: "workspace-1", title: "Workspace A" }),
    ]);
    await expect(loadTasks("workspace-2")).resolves.toEqual([
      task({ workspaceId: "workspace-2", title: "Workspace B" }),
    ]);
  });

  it("normalizes persisted tasks with missing optional fields", async () => {
    mkdirSync(dirname(tasksPath(workspaceId)), { recursive: true });
    writeFileSync(
      tasksPath(workspaceId),
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

    await expect(loadTasks(workspaceId)).resolves.toEqual([
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

  it("ignores legacy proposalId and normalizes originSessionId", async () => {
    mkdirSync(dirname(tasksPath(workspaceId)), { recursive: true });
    writeFileSync(
      tasksPath(workspaceId),
      JSON.stringify({
        version: 1,
        tasks: [
          {
            id: "task-1",
            workspaceId: "workspace-1",
            title: "Stored task",
            description: {
              format: "plain_text",
              content: "Details",
            },
            status: "open",
            source: "local",
            sourceMeta: { source: "local" },
            labels: [],
            proposalId: "change-legacy",
            originSessionId: "session-1",
            createdAt: "2026-05-10T00:00:00.000Z",
            updatedAt: "2026-05-10T00:00:00.000Z",
          },
        ],
      }),
      "utf8"
    );

    const loaded = await loadTasks(workspaceId);

    expect(loaded).toEqual([task({ title: "Stored task", originSessionId: "session-1" })]);
    expect(loaded[0]).not.toHaveProperty("proposalId");
  });

  it("drops persisted tasks with legacy string descriptions", async () => {
    mkdirSync(dirname(tasksPath(workspaceId)), { recursive: true });
    writeFileSync(
      tasksPath(workspaceId),
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

    await expect(loadTasks(workspaceId)).resolves.toEqual([]);
  });
});
