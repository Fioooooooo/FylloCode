import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { AutomationTaskChannels as TaskChannels } from "@shared/ipc/automation/task.channels";
import { IpcErrorCodes } from "@shared/constants/error-codes";

const mocks = vi.hoisted(() => ({
  listTasks: vi.fn(),
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  resolveTaskProjectPath: vi.fn(),
}));

vi.mock("@main/services/automation/task/task-aggregator", () => ({
  listTasks: mocks.listTasks,
  getTask: mocks.getTask,
}));

vi.mock("@main/services/automation/task/task-service", () => ({
  createTask: mocks.createTask,
  updateTask: mocks.updateTask,
  deleteTask: mocks.deleteTask,
  resolveTaskProjectPath: mocks.resolveTaskProjectPath,
}));

describe("registerTaskHandlers", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const task = {
      id: "task-1",
      projectId: "project-1",
      title: "任务 1",
      description: {
        format: "plain_text",
        content: "详情",
      },
      status: "open",
      source: "local",
      sourceMeta: { source: "local" },
      labels: [],
      createdAt: new Date("2026-05-17T00:00:00.000Z"),
      updatedAt: new Date("2026-05-17T00:00:00.000Z"),
    };
    mocks.getTask.mockResolvedValue(task);
    mocks.createTask.mockResolvedValue(task);
    mocks.updateTask.mockResolvedValue(task);
    mocks.resolveTaskProjectPath.mockResolvedValue("/tmp/project-1");

    const { registerTaskHandlers } = await import("@main/ipc/automation/task");
    registerTaskHandlers();
  });

  function handler(channel: string): (event: unknown, input: unknown) => Promise<unknown> {
    const call = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([registeredChannel]) => registeredChannel === channel);
    expect(call).toBeTruthy();
    return call![1] as (event: unknown, input: unknown) => Promise<unknown>;
  }

  it("returns task detail for automation:task:get", async () => {
    const result = await handler(TaskChannels.get)(
      {},
      { projectId: "project-1", taskId: "task-1" }
    );

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        id: "task-1",
        description: {
          format: "plain_text",
          content: "详情",
        },
      }),
    });
    expect(mocks.getTask).toHaveBeenCalledWith("project-1", "task-1");
  });

  it("returns validation error for invalid automation:task:get payload", async () => {
    const result = await handler(TaskChannels.get)({}, { projectId: "project-1", taskId: "" });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: IpcErrorCodes.VALIDATION_ERROR,
      }),
    });
    expect(mocks.getTask).not.toHaveBeenCalled();
  });

  it("returns task not found when automation:task:get resolves null", async () => {
    mocks.getTask.mockResolvedValueOnce(null);

    const result = await handler(TaskChannels.get)(
      {},
      { projectId: "project-1", taskId: "missing" }
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: IpcErrorCodes.TASK_NOT_FOUND,
      }),
    });
  });

  it("returns structured descriptions for automation:task:create and automation:task:update", async () => {
    const createResult = await handler(TaskChannels.create)(
      {},
      {
        projectId: "project-1",
        title: "任务 1",
        description: {
          format: "plain_text",
          content: "详情",
        },
      }
    );
    const updateResult = await handler(TaskChannels.update)(
      {},
      {
        projectId: "project-1",
        taskId: "task-1",
        patch: {
          description: {
            format: "plain_text",
            content: "详情",
          },
        },
      }
    );

    expect(createResult).toEqual({
      ok: true,
      data: expect.objectContaining({
        description: {
          format: "plain_text",
          content: "详情",
        },
      }),
    });
    expect(updateResult).toEqual({
      ok: true,
      data: expect.objectContaining({
        description: {
          format: "plain_text",
          content: "详情",
        },
      }),
    });
  });
});
