import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type { TaskItem } from "@shared/types/task";

const mocks = vi.hoisted(() => ({
  newTaskId: vi.fn(() => "task-generated"),
  loadTasks: vi.fn(),
  saveTasks: vi.fn(),
}));

vi.mock("@main/infra/ids", () => ({
  newTaskId: mocks.newTaskId,
}));

vi.mock("@main/infra/storage/task-store", () => ({
  loadTasks: mocks.loadTasks,
  saveTasks: mocks.saveTasks,
}));

import {
  createTask,
  deleteTask,
  listTasks,
  updateTask,
} from "@main/services/automation/task/task-service";

function task(overrides: Partial<TaskItem> = {}): TaskItem {
  const createdAt = new Date("2026-05-10T00:00:00.000Z");
  const updatedAt = new Date("2026-05-10T00:00:00.000Z");
  return {
    id: "task-1",
    projectId: "tmp-project",
    title: "Task",
    description: { format: "plain_text", content: "" },
    status: "open",
    source: "local",
    sourceMeta: { source: "local" },
    labels: [],
    createdAt,
    updatedAt,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-10T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("task-service", () => {
  it("lists tasks sorted by updatedAt descending", async () => {
    const older = task({ id: "task-old", updatedAt: new Date("2026-05-09T00:00:00.000Z") });
    const newer = task({ id: "task-new", updatedAt: new Date("2026-05-10T00:00:00.000Z") });
    mocks.loadTasks.mockResolvedValue([older, newer]);

    await expect(listTasks("/tmp/project")).resolves.toEqual([newer, older]);
  });

  it("creates a local task with generated id, timestamps, and defaults", async () => {
    const existing = task();
    mocks.loadTasks.mockResolvedValue([existing]);

    const created = await createTask("/tmp/project", { title: "New task" });

    expect(created).toMatchObject({
      id: "task-generated",
      projectId: "tmp-project",
      title: "New task",
      description: { format: "plain_text", content: "" },
      status: "open",
      source: "local",
      sourceMeta: { source: "local" },
      labels: [],
    });
    expect(created.createdAt.toISOString()).toBe("2026-05-10T12:00:00.000Z");
    expect(created.updatedAt.toISOString()).toBe("2026-05-10T12:00:00.000Z");
    expect(created.originSessionId).toBeUndefined();
    expect(mocks.saveTasks).toHaveBeenCalledWith("/tmp/project", [existing, created]);
  });

  it("updates a task with partial patch and refreshes updatedAt", async () => {
    const existing = task();
    mocks.loadTasks.mockResolvedValue([existing]);

    const updated = await updateTask("/tmp/project", "task-1", {
      title: "Updated",
      status: "closed",
    });

    expect(updated).toMatchObject({
      id: "task-1",
      title: "Updated",
      status: "closed",
      description: { format: "plain_text", content: "" },
    });
    expect(updated.updatedAt.toISOString()).toBe("2026-05-10T12:00:00.000Z");
    expect(mocks.saveTasks).toHaveBeenCalledWith("/tmp/project", [updated]);
  });

  it("does not let task patches change originSessionId", async () => {
    const existing = task({ originSessionId: "session-original" });
    mocks.loadTasks.mockResolvedValue([existing]);

    const updated = await updateTask("/tmp/project", "task-1", {
      title: "Updated",
      originSessionId: "session-next",
    } as never);

    expect(updated.originSessionId).toBe("session-original");
    expect(mocks.saveTasks).toHaveBeenCalledWith("/tmp/project", [updated]);
  });

  it("persists structured plain text descriptions for create and update", async () => {
    const existing = task();
    mocks.loadTasks.mockResolvedValueOnce([]).mockResolvedValueOnce([existing]);

    const created = await createTask("/tmp/project", {
      title: "Task with description",
      description: { format: "plain_text", content: "create body" },
    });
    const updated = await updateTask("/tmp/project", "task-1", {
      description: { format: "plain_text", content: "updated body" },
    });

    expect(created.description).toEqual({ format: "plain_text", content: "create body" });
    expect(updated.description).toEqual({ format: "plain_text", content: "updated body" });
  });

  it("deletes existing tasks", async () => {
    const first = task({ id: "task-1" });
    const second = task({ id: "task-2" });
    mocks.loadTasks.mockResolvedValue([first, second]);

    await deleteTask("/tmp/project", "task-1");

    expect(mocks.saveTasks).toHaveBeenCalledWith("/tmp/project", [second]);
  });

  it("rejects update and delete for missing task ids", async () => {
    mocks.loadTasks.mockResolvedValue([]);

    await expect(updateTask("/tmp/project", "missing", { title: "x" })).rejects.toMatchObject({
      code: IpcErrorCodes.TASK_NOT_FOUND,
    });
    await expect(deleteTask("/tmp/project", "missing")).rejects.toMatchObject({
      code: IpcErrorCodes.TASK_NOT_FOUND,
    });
    expect(mocks.saveTasks).not.toHaveBeenCalled();
  });
});
