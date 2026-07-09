import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFylloActionDispatcher } from "@renderer/composables/useFylloActionDispatcher";

const createTaskMock = vi.hoisted(() => vi.fn());
const createSessionTaskMock = vi.hoisted(() => vi.fn());
const setSessionOriginTaskRefMock = vi.hoisted(() => vi.fn());
const openPlanReviewMock = vi.hoisted(() => vi.fn());
const currentProject = vi.hoisted(() => ({
  value: { id: "project-1" } as { id: string } | null,
}));

vi.mock("@renderer/stores/automation/task", () => ({
  useTaskStore: () => ({
    createTask: createTaskMock,
  }),
}));

vi.mock("@renderer/stores/insight/lineage", () => ({
  useLineageStore: () => ({
    createSessionTask: createSessionTaskMock,
  }),
}));

vi.mock("@renderer/composables/usePlanSlideover", () => ({
  usePlanSlideover: () => ({
    openPlanReview: openPlanReviewMock,
  }),
}));

vi.mock("@renderer/stores/workspace/project", () => ({
  useProjectStore: () => ({
    get currentProject() {
      return currentProject.value;
    },
  }),
}));

vi.mock("@renderer/stores/session/session", () => ({
  useSessionStore: () => ({
    setSessionOriginTaskRef: setSessionOriginTaskRefMock,
  }),
}));

describe("useFylloActionDispatcher", () => {
  beforeEach(() => {
    createTaskMock.mockReset();
    createSessionTaskMock.mockReset();
    setSessionOriginTaskRefMock.mockReset();
    openPlanReviewMock.mockReset();
    currentProject.value = { id: "project-1" };
  });

  it("routes task.create through lineage createSessionTask with session context", async () => {
    createSessionTaskMock.mockResolvedValue({ ok: true, data: { id: "task-1" } });

    const { dispatchFylloAction } = useFylloActionDispatcher();
    const result = await dispatchFylloAction(
      "task.create",
      {
        title: "补齐错误处理",
        description: "整理异常分支",
      },
      { sessionId: "session-1" }
    );

    expect(result).toEqual({ outcome: "succeeded" });
    expect(createSessionTaskMock).toHaveBeenCalledWith("project-1", {
      sessionId: "session-1",
      title: "补齐错误处理",
      description: "整理异常分支",
    });
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it("updates session originTaskRef after task.create succeeds", async () => {
    createSessionTaskMock.mockResolvedValue({ ok: true, data: { id: "task-new" } });

    const { dispatchFylloAction } = useFylloActionDispatcher();
    await dispatchFylloAction(
      "task.create",
      {
        title: "补齐错误处理",
      },
      { sessionId: "session-1" }
    );

    expect(setSessionOriginTaskRefMock).toHaveBeenCalledWith("session-1", "local:task-new");
  });

  it("passes undefined description when description is missing", async () => {
    createSessionTaskMock.mockResolvedValue({ ok: true, data: { id: "task-1" } });

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
    createSessionTaskMock.mockResolvedValue({ ok: true, data: { id: "task-1" } });

    const { dispatchFylloAction } = useFylloActionDispatcher();
    const result = await dispatchFylloAction("task.create", {
      title: "补齐错误处理",
    });

    expect(result).toEqual({
      outcome: "failed",
      error: "当前聊天会话缺少 sessionId，无法创建任务。",
    });
    expect(createSessionTaskMock).not.toHaveBeenCalled();
    expect(createTaskMock).not.toHaveBeenCalled();
    expect(setSessionOriginTaskRefMock).not.toHaveBeenCalled();
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
      outcome: "failed",
      error: "创建失败",
    });
    expect(setSessionOriginTaskRefMock).not.toHaveBeenCalled();
  });

  it("opens the plan slideover and returns succeeded when approved", async () => {
    openPlanReviewMock.mockResolvedValue({ status: "approved" });

    const { dispatchFylloAction } = useFylloActionDispatcher();
    const result = await dispatchFylloAction(
      "plan.create",
      {
        slug: "2026-06-29-plan-a",
        goal: "Need review",
      },
      { sessionId: "session-1" }
    );

    expect(openPlanReviewMock).toHaveBeenCalledWith({
      sessionId: "session-1",
      slug: "2026-06-29-plan-a",
      mode: "review",
    });
    expect(result).toEqual({ outcome: "succeeded" });
  });

  it("returns dismissed when the plan slideover closes without approval", async () => {
    openPlanReviewMock.mockResolvedValue({ status: "dismissed" });

    const { dispatchFylloAction } = useFylloActionDispatcher();
    const result = await dispatchFylloAction(
      "plan.create",
      {
        slug: "2026-06-29-plan-a",
        goal: "Need review",
      },
      { sessionId: "session-1" }
    );

    expect(result).toEqual({ outcome: "dismissed" });
  });

  it("returns failed when plan.create has no sessionId", async () => {
    const { dispatchFylloAction } = useFylloActionDispatcher();
    const result = await dispatchFylloAction("plan.create", {
      slug: "2026-06-29-plan-a",
      goal: "Need review",
    });

    expect(result).toEqual({
      outcome: "failed",
      error: "当前聊天会话缺少 sessionId，无法审阅规划。",
    });
    expect(openPlanReviewMock).not.toHaveBeenCalled();
  });
});
