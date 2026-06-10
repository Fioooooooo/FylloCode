import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFylloActionDispatcher } from "@renderer/composables/useFylloActionDispatcher";

const createTaskMock = vi.hoisted(() => vi.fn());
const createSessionTaskMock = vi.hoisted(() => vi.fn());
const currentProject = vi.hoisted(() => ({
  value: { id: "project-1" } as { id: string } | null,
}));

vi.mock("@renderer/stores/task", () => ({
  useTaskStore: () => ({
    createTask: createTaskMock,
  }),
}));

vi.mock("@renderer/api/lineage", () => ({
  lineageApi: {
    createSessionTask: createSessionTaskMock,
  },
}));

vi.mock("@renderer/stores/project", () => ({
  useProjectStore: () => ({
    get currentProject() {
      return currentProject.value;
    },
  }),
}));

describe("useFylloActionDispatcher", () => {
  beforeEach(() => {
    createTaskMock.mockReset();
    createSessionTaskMock.mockReset();
    currentProject.value = { id: "project-1" };
  });

  it("routes task.create through lineage createSessionTask with session context", async () => {
    createSessionTaskMock.mockResolvedValue({ ok: true, data: {} });

    const { dispatchFylloAction } = useFylloActionDispatcher();
    const result = await dispatchFylloAction(
      "task.create",
      {
        title: "补齐错误处理",
        description: "整理异常分支",
      },
      { sessionId: "session-1" }
    );

    expect(result).toEqual({ ok: true });
    expect(createSessionTaskMock).toHaveBeenCalledWith("project-1", {
      sessionId: "session-1",
      title: "补齐错误处理",
      description: "整理异常分支",
    });
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it("passes undefined description when description is missing", async () => {
    createSessionTaskMock.mockResolvedValue({ ok: true, data: {} });

    const { dispatchFylloAction } = useFylloActionDispatcher();
    await dispatchFylloAction(
      "task.create",
      {
        title: "补齐错误处理",
      },
      { sessionId: "session-1" }
    );

    expect(createSessionTaskMock).toHaveBeenCalledWith("project-1", {
      sessionId: "session-1",
      title: "补齐错误处理",
      description: undefined,
    });
  });

  it("returns failed results when sessionId is missing", async () => {
    createSessionTaskMock.mockResolvedValue({ ok: true, data: {} });

    const { dispatchFylloAction } = useFylloActionDispatcher();
    const result = await dispatchFylloAction("task.create", {
      title: "补齐错误处理",
    });

    expect(result).toEqual({
      ok: false,
      error: "当前聊天会话缺少 sessionId，无法创建任务。",
    });
    expect(createSessionTaskMock).not.toHaveBeenCalled();
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it("returns failed results when lineage createSessionTask fails", async () => {
    createSessionTaskMock.mockResolvedValue({
      ok: false,
      error: { message: "创建失败" },
    });

    const { dispatchFylloAction } = useFylloActionDispatcher();
    const result = await dispatchFylloAction(
      "task.create",
      {
        title: "补齐错误处理",
      },
      { sessionId: "session-1" }
    );

    expect(result).toEqual({
      ok: false,
      error: "创建失败",
    });
  });
});
