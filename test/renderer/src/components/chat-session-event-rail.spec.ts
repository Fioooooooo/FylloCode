import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, nextTick, reactive, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ChatSessionEventRail from "@renderer/components/chat/event/ChatSessionEventRail.vue";
import type { PlanEntry, Session } from "@shared/types/chat";
import type { FylloActionStateStatus } from "@shared/types/fyllo-action";

const activeSessionRef = ref<Session | null>(null);
const activeSessionIdRef = ref<string | null>(null);

vi.mock("@renderer/stores", () => ({
  useSessionStore: () =>
    reactive({
      activeSession: computed(() => activeSessionRef.value),
      activeSessionId: computed(() => activeSessionIdRef.value),
      getSessionProposals: () => [],
    }),
}));

function mountEventRail(scrollContainer: HTMLElement | null = null) {
  return mount(ChatSessionEventRail, {
    props: {
      scrollContainer,
    },
  });
}

function makeContainer(actionId: string): {
  container: HTMLElement;
  scrollMock: ReturnType<typeof vi.fn>;
} {
  const container = document.createElement("div");
  const anchor = document.createElement("div");
  const scrollMock = vi.fn();
  anchor.setAttribute("data-fyllo-action-id", actionId);
  anchor.scrollIntoView = scrollMock;
  container.appendChild(anchor);
  return { container, scrollMock };
}

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
    activeSessionIdRef.value = null;
    vi.stubGlobal("CSS", {
      escape: (value: string) => value,
    });
  });

  it("renders the plan panel when plan entries are provided", () => {
    activeSessionRef.value = makeSession(makeEntries());
    activeSessionIdRef.value = activeSessionRef.value.id;

    const wrapper = mountEventRail();

    expect(wrapper.find('[data-test="event-rail"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("执行计划");
    expect(wrapper.text()).toContain("Analyze request");
    expect(wrapper.text()).toContain("Generate plan");
    expect(wrapper.text()).toContain("Review output");
  });

  it("hides the rail container when there are no events", () => {
    activeSessionRef.value = makeSession([]);
    activeSessionIdRef.value = activeSessionRef.value.id;

    const wrapper = mountEventRail();

    expect(wrapper.find('[data-test="event-rail"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("执行计划");
  });

  it("renders pending Fyllo action items from the active session", () => {
    activeSessionRef.value = makePendingActionSession();
    activeSessionIdRef.value = activeSessionRef.value.id;

    const wrapper = mountEventRail();

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
      activeSessionIdRef.value = activeSessionRef.value.id;

      const wrapper = mountEventRail();
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
    activeSessionIdRef.value = activeSessionRef.value.id;

    const wrapper = mountEventRail();

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

  it("scrolls to a Fyllo action anchor when a rail item is located", async () => {
    activeSessionRef.value = makePendingActionSession();
    activeSessionIdRef.value = activeSessionRef.value.id;
    const actionId = "chat:session-1:0:0:0";
    const { container, scrollMock } = makeContainer(actionId);

    const wrapper = mountEventRail(container);
    await wrapper.get('[data-test="fyllo-action-rail-item"]').trigger("click");
    await flushPromises();

    expect(scrollMock).toHaveBeenCalledWith({
      block: "center",
      behavior: "smooth",
    });
  });
});
