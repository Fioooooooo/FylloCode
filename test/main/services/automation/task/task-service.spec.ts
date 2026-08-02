import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type { TaskItem } from "@shared/types/task";

const mocks = vi.hoisted(() => ({
  newTaskId: vi.fn(() => "task-generated"),
  loadTasks: vi.fn(),
  saveTasks: vi.fn(),
  updateTasks: vi.fn(),
}));

vi.mock("@main/infra/ids", () => ({
  newTaskId: mocks.newTaskId,
}));

vi.mock("@main/infra/storage/task-store", () => ({
  loadTasks: mocks.loadTasks,
  saveTasks: mocks.saveTasks,
  updateTasks: mocks.updateTasks,
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
    workspaceId: "workspace-1",
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

  // Simulate the real updateTasks behavior using the mocked load/save primitives.
  mocks.updateTasks.mockImplementation(async (_projectPath, updater) => {
    const current = ((await mocks.loadTasks()) as TaskItem[]) ?? [];
    const next = updater(current);
    if (next !== current) {
      await mocks.saveTasks(_projectPath, next);
    }
    return next;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("task-service", () => {
  it("lists tasks sorted by updatedAt descending", async () => {
    const older = task({ id: "task-old", updatedAt: new Date("2026-05-09T00:00:00.000Z") });
    const newer = task({ id: "task-new", updatedAt: new Date("2026-05-10T00:00:00.000Z") });
    mocks.loadTasks.mockResolvedValue([older, newer]);

    await expect(listTasks("workspace-1")).resolves.toEqual([newer, older]);
  });

  it("creates a local task with generated id, timestamps, and defaults", async () => {
    const existing = task();
    mocks.loadTasks.mockResolvedValue([existing]);

    const created = await createTask("workspace-1", { title: "New task" });

    expect(created).toMatchObject({
      id: "task-generated",
      workspaceId: "workspace-1",
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
    expect(mocks.saveTasks).toHaveBeenCalledWith("workspace-1", [existing, created]);
  });

  it("updates a task with partial patch and refreshes updatedAt", async () => {
    const existing = task();
    mocks.loadTasks.mockResolvedValue([existing]);

    const updated = await updateTask("workspace-1", "task-1", {
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
    expect(mocks.saveTasks).toHaveBeenCalledWith("workspace-1", [updated]);
  });

  it("does not let task patches change originSessionId", async () => {
    const existing = task({ originSessionId: "session-original" });
    mocks.loadTasks.mockResolvedValue([existing]);

    const updated = await updateTask("workspace-1", "task-1", {
      title: "Updated",
      originSessionId: "session-next",
    } as never);

    expect(updated.originSessionId).toBe("session-original");
    expect(mocks.saveTasks).toHaveBeenCalledWith("workspace-1", [updated]);
  });

  it("persists structured plain text descriptions for create and update", async () => {
    const existing = task();
    mocks.loadTasks.mockResolvedValueOnce([]).mockResolvedValueOnce([existing]);

    const created = await createTask("workspace-1", {
      title: "Task with description",
      description: { format: "plain_text", content: "create body" },
    });
    const updated = await updateTask("workspace-1", "task-1", {
      description: { format: "plain_text", content: "updated body" },
    });

    expect(created.description).toEqual({ format: "plain_text", content: "create body" });
    expect(updated.description).toEqual({ format: "plain_text", content: "updated body" });
  });

  it("deduplicates target Folder IDs on create and update while preserving first order", async () => {
    mocks.loadTasks.mockResolvedValueOnce([]);
    const created = await createTask("workspace-1", {
      title: "Targeted task",
      targetFolderIds: ["folder-b", "folder-a", "folder-b"],
    });
    expect(created.targetFolderIds).toEqual(["folder-b", "folder-a"]);

    mocks.loadTasks.mockResolvedValueOnce([created]);
    const updated = await updateTask("workspace-1", created.id, {
      targetFolderIds: ["folder-a", "folder-a"],
    });
    expect(updated.targetFolderIds).toEqual(["folder-a"]);

    mocks.loadTasks.mockResolvedValueOnce([updated]);
    const cleared = await updateTask("workspace-1", updated.id, { targetFolderIds: [] });
    expect(cleared.targetFolderIds).toBeUndefined();
  });

  it("deletes existing tasks", async () => {
    const first = task({ id: "task-1" });
    const second = task({ id: "task-2" });
    mocks.loadTasks.mockResolvedValue([first, second]);

    await deleteTask("workspace-1", "task-1");

    expect(mocks.saveTasks).toHaveBeenCalledWith("workspace-1", [second]);
  });

  it("rejects update and delete for missing task ids", async () => {
    mocks.loadTasks.mockResolvedValue([]);

    await expect(updateTask("workspace-1", "missing", { title: "x" })).rejects.toMatchObject({
      code: IpcErrorCodes.TASK_NOT_FOUND,
    });
    await expect(deleteTask("workspace-1", "missing")).rejects.toMatchObject({
      code: IpcErrorCodes.TASK_NOT_FOUND,
    });
    expect(mocks.saveTasks).not.toHaveBeenCalled();
  });

  it("returns existing task when actionId matches (idempotent creation)", async () => {
    const existing = task({ id: "task-existing", actionId: "fyllo-action-1" });
    mocks.loadTasks.mockResolvedValue([existing]);

    const created = await createTask(
      "workspace-1",
      { title: "New task" },
      { actionId: "fyllo-action-1" }
    );

    expect(created).toBe(existing);
    expect(mocks.newTaskId).not.toHaveBeenCalled();
    expect(mocks.saveTasks).not.toHaveBeenCalled();
  });

  it("stores actionId on newly created tasks", async () => {
    mocks.loadTasks.mockResolvedValue([]);

    const created = await createTask(
      "workspace-1",
      { title: "New task" },
      { actionId: "fyllo-action-1" }
    );

    expect(created.actionId).toBe("fyllo-action-1");
    expect(mocks.saveTasks).toHaveBeenCalledWith("workspace-1", [created]);
  });
});
