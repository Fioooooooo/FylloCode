import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFylloActionDispatcher } from "@renderer/features/fyllo-action/application/use-fyllo-action-dispatcher";

const createTaskMock = vi.hoisted(() => vi.fn());
const createSessionTaskMock = vi.hoisted(() => vi.fn());
const setSessionOriginTaskRefMock = vi.hoisted(() => vi.fn());
const openPlanReviewMock = vi.hoisted(() => vi.fn());
const openKnowledgeReviewMock = vi.hoisted(() => vi.fn());
const sendMessageAndAwaitDurableAppendMock = vi.hoisted(() => vi.fn());
const currentProject = vi.hoisted(() => ({
  value: { id: "project-1" } as { id: string } | null,
}));
const activeSession = vi.hoisted(() => ({
  value: null as import("@shared/types/chat").Session | null,
}));
const chatStatus = vi.hoisted(() => ({
  value: "ready" as import("@shared/types/chat").ChatStatus,
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

vi.mock("@renderer/composables/useKnowledgeReviewSlideover", () => ({
  useKnowledgeReviewSlideover: () => ({
    openKnowledgeReview: openKnowledgeReviewMock,
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
    get activeSession() {
      return activeSession.value;
    },
    setSessionOriginTaskRef: setSessionOriginTaskRefMock,
  }),
}));

vi.mock("@renderer/stores/session/chat", () => ({
  useChatStore: () => ({
    get chatStatus() {
      return chatStatus.value;
    },
    sendMessageAndAwaitDurableAppend: sendMessageAndAwaitDurableAppendMock,
  }),
}));

describe("useFylloActionDispatcher", () => {
  beforeEach(() => {
    createTaskMock.mockReset();
    createSessionTaskMock.mockReset();
    setSessionOriginTaskRefMock.mockReset();
    openPlanReviewMock.mockReset();
    openKnowledgeReviewMock.mockReset();
    sendMessageAndAwaitDurableAppendMock.mockReset();
    currentProject.value = { id: "project-1" };
    activeSession.value = null;
    chatStatus.value = "ready";
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
      { sessionId: "session-1", actionId: "action-1" }
    );

    expect(result).toEqual({ outcome: "succeeded" });
    expect(createSessionTaskMock).toHaveBeenCalledWith("project-1", {
      sessionId: "session-1",
      title: "补齐错误处理",
      description: "整理异常分支",
      actionId: "action-1",
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
      { sessionId: "session-1", actionId: "action-1" }
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
      { sessionId: "session-1", actionId: "action-1" }
    );

    expect(createSessionTaskMock).toHaveBeenCalledWith("project-1", {
      sessionId: "session-1",
      title: "补齐错误处理",
      description: undefined,
      actionId: "action-1",
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
      { sessionId: "session-1", actionId: "action-1" }
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

  it("routes knowledge.flag confirm to a hidden capture reminder and visible user request", async () => {
    activeSession.value = {
      id: "session-1",
      projectId: "project-1",
      agentId: "claude-code",
      title: "Session",
      status: "ended",
      turnCount: 0,
      tokenUsage: { used: 128, size: 1024 },
      createdAt: new Date("2026-05-12T00:00:00.000Z"),
      updatedAt: new Date("2026-05-12T00:00:00.000Z"),
      messages: [
        {
          id: "message-1",
          role: "assistant",
          parts: [
            {
              type: "text",
              text: [
                '<fyllo-action type="knowledge.flag">{"summary":"First candidate","contextPaths":["src/one.ts"]}</fyllo-action>',
                '<fyllo-action type="knowledge.flag">{"summary":"Second candidate"}</fyllo-action>',
              ].join("\n\n"),
            },
          ],
        },
      ],
    } as import("@shared/types/chat").Session;
    sendMessageAndAwaitDurableAppendMock.mockResolvedValue({ messageId: "msg-1" });

    const { dispatchFylloAction } = useFylloActionDispatcher();
    const result = await dispatchFylloAction(
      "knowledge.flag",
      {
        summary: "First candidate",
        contextPaths: ["src/one.ts"],
      },
      { sessionId: "session-1", actionId: "chat:session-1:0:0:0" }
    );

    expect(result).toEqual({
      outcome: "succeeded",
      completedActionIds: ["chat:session-1:0:0:0", "chat:session-1:0:0:1"],
    });
    expect(sendMessageAndAwaitDurableAppendMock).toHaveBeenCalledWith([
      {
        type: "text",
        text: expect.stringContaining("<system-reminder>"),
      },
      {
        type: "text",
        text: "请把刚才标记的 2 条可沉淀内容整理为项目知识，并在完成后让我审阅。",
      },
    ]);
    const parts = sendMessageAndAwaitDurableAppendMock.mock.calls[0]?.[0] ?? [];
    const reminder = parts[0]?.type === "text" ? parts[0].text : "";
    expect(reminder.trim()).toMatch(/^<system-reminder>[\s\S]*<\/system-reminder>$/);
    expect(reminder).toContain('mcp__fyllo_cortex__knowledge({ "mode": "capture" })');
    expect(reminder).toContain("summary: First candidate");
    expect(reminder).toContain("- src/one.ts");
    expect(reminder).toContain("summary: Second candidate");
    expect(reminder).not.toContain("actionId");
    expect(reminder).not.toContain("chat:session-1:0:0:0");
  });

  it("uses the current knowledge.flag payload when loaded pending flags are unavailable", async () => {
    sendMessageAndAwaitDurableAppendMock.mockResolvedValue({ messageId: "msg-1" });

    const { dispatchFylloAction } = useFylloActionDispatcher();
    const result = await dispatchFylloAction(
      "knowledge.flag",
      {
        summary: "Current payload candidate",
        contextPaths: ["src/current.ts"],
      },
      { sessionId: "session-1" }
    );

    expect(result).toEqual({ outcome: "succeeded" });
    const parts = sendMessageAndAwaitDurableAppendMock.mock.calls[0]?.[0] ?? [];
    expect(parts).toHaveLength(2);
    const reminder = parts[0]?.type === "text" ? parts[0].text : "";
    expect(reminder).toContain("summary: Current payload candidate");
    expect(reminder).toContain("- src/current.ts");
    expect(parts[1]).toEqual({
      type: "text",
      text: "请把刚才标记的可沉淀内容整理为项目知识，并在完成后让我审阅。",
    });
  });

  it("does not send knowledge capture while chat is responding", async () => {
    chatStatus.value = "streaming";

    const { dispatchFylloAction } = useFylloActionDispatcher();
    const result = await dispatchFylloAction(
      "knowledge.flag",
      {
        summary: "Current payload candidate",
      },
      { sessionId: "session-1" }
    );

    expect(result).toEqual({
      outcome: "failed",
      error: "请等待当前 assistant 回复结束后再沉淀知识。",
    });
    expect(sendMessageAndAwaitDurableAppendMock).not.toHaveBeenCalled();
  });

  it("routes knowledge.review confirm to the knowledge review slideover", async () => {
    openKnowledgeReviewMock.mockResolvedValue({ status: "approved" });

    const { dispatchFylloAction } = useFylloActionDispatcher();
    const result = await dispatchFylloAction(
      "knowledge.review",
      {
        name: "markstream-vue-theme-subscription",
        summary: "Review saved markdown.",
      },
      { sessionId: "session-1", actionId: "chat:session-1:9:0:0" }
    );

    expect(openKnowledgeReviewMock).toHaveBeenCalledWith({
      sessionId: "session-1",
      name: "markstream-vue-theme-subscription",
    });
    expect(result).toEqual({ outcome: "succeeded" });
  });

  it("maps dismissed knowledge.review slideover result to dismissed action outcome", async () => {
    openKnowledgeReviewMock.mockResolvedValue({ status: "dismissed" });

    const { dispatchFylloAction } = useFylloActionDispatcher();
    const result = await dispatchFylloAction(
      "knowledge.review",
      {
        name: "markstream-vue-theme-subscription",
      },
      { sessionId: "session-1" }
    );

    expect(result).toEqual({ outcome: "dismissed" });
  });
});
