import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, nextTick, reactive, ref } from "vue";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ChatSessionEventRail from "@renderer/components/chat/event/ChatSessionEventRail.vue";
import type { PlanEntry, Session } from "@shared/types/chat";
import type { FylloActionStateStatus } from "@shared/types/fyllo-action";

const activeSessionRef = ref<Session | null>(null);

vi.mock("@renderer/stores", () => ({
  useSessionStore: () =>
    reactive({
      activeSession: computed(() => activeSessionRef.value),
      getSessionProposals: () => [],
    }),
}));

function makeSession(plan: PlanEntry[] = []): Session {
  return {
    id: "session-1",
    projectId: "project-1",
    agentId: "claude-code",
    title: "Session",
    status: "ended",
    turnCount: 0,
    tokenUsage: { used: 128, size: 1024 },
    createdAt: new Date("2026-05-12T00:00:00.000Z"),
    updatedAt: new Date("2026-05-12T00:00:00.000Z"),
    messages: [],
    availableCommands: [],
    plan,
  };
}

function makeEntries(): PlanEntry[] {
  return [
    { content: "Analyze request", priority: "high", status: "completed" },
    { content: "Generate plan", priority: "medium", status: "in_progress" },
    { content: "Review output", priority: "low", status: "pending" },
  ];
}

function makePendingActionSession(): Session {
  const session = makeSession();
  session.messages = [
    {
      id: "message-1",
      role: "assistant",
      metadata: { sessionId: session.id, createdAt: new Date("2026-05-12T00:00:00.000Z") },
      parts: [
        {
          type: "text",
          text: '<fyllo-action type="task.create">{"title":"补齐错误处理"}</fyllo-action>',
        },
      ],
    } as Session["messages"][number],
  ];
  return session;
}

function actionState(status: FylloActionStateStatus): NonNullable<Session["actionStates"]>[string] {
  return {
    type: "task.create",
    status,
    updatedAt: "2026-05-12T00:00:00.000Z",
  };
}

describe("ChatSessionEventRail", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    activeSessionRef.value = null;
  });

  it("renders the plan panel when plan entries are provided", () => {
    activeSessionRef.value = makeSession(makeEntries());

    const wrapper = mount(ChatSessionEventRail);

    expect(wrapper.find('[data-test="event-rail"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("执行计划");
    expect(wrapper.text()).toContain("Analyze request");
    expect(wrapper.text()).toContain("Generate plan");
    expect(wrapper.text()).toContain("Review output");
  });

  it("renders the rail container even when plan entries are empty", () => {
    activeSessionRef.value = makeSession([]);

    const wrapper = mount(ChatSessionEventRail);

    expect(wrapper.find('[data-test="event-rail"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="collapse-rail"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("执行计划");
  });

  it("renders pending Fyllo action items from the active session", () => {
    activeSessionRef.value = makePendingActionSession();

    const wrapper = mount(ChatSessionEventRail);

    expect(wrapper.find('[data-test="fyllo-action-panel"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("待处理操作");
    expect(wrapper.text()).toContain("创建任务");
    expect(wrapper.text()).toContain("补齐错误处理");
  });

  it.each(["cancelled", "failed"] as const)(
    "removes pending Fyllo action items when action state becomes %s",
    async (status) => {
      const session = makePendingActionSession();
      const messageCount = session.messages.length;
      activeSessionRef.value = session;

      const wrapper = mount(ChatSessionEventRail);
      expect(wrapper.find('[data-test="fyllo-action-rail-item"]').exists()).toBe(true);

      activeSessionRef.value.actionStates = {
        "chat:session-1:0:0:0": actionState(status),
      };
      await nextTick();

      expect(wrapper.find('[data-test="fyllo-action-rail-item"]').exists()).toBe(false);
      expect(wrapper.text()).not.toContain("补齐错误处理");
      expect(activeSessionRef.value.messages).toHaveLength(messageCount);
    }
  );

  it("collapses and expands via the header and right-edge handle", async () => {
    activeSessionRef.value = makeSession(makeEntries());

    const wrapper = mount(ChatSessionEventRail);

    expect(wrapper.find('[data-test="collapse-rail"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("执行计划");

    await wrapper.get('[data-test="collapse-rail"]').trigger("click");
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="collapse-rail"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="expand-rail"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("执行计划");

    await wrapper.get('[data-test="expand-rail"]').trigger("click");
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="expand-rail"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="collapse-rail"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("执行计划");
  });
});
