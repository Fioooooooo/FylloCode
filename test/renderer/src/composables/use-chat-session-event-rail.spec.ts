import { mount } from "@vue/test-utils";
import { computed, defineComponent, ref, type Ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useChatEventRail } from "@renderer/composables/useChatEventRail";
import type { MessageMeta, Session } from "@shared/types/chat";
import type { ProposalMeta } from "@shared/types/proposal";
import type { UIMessage } from "ai";

type EventRailApi = ReturnType<typeof useChatEventRail>;

function message(
  id: string,
  role: UIMessage<MessageMeta>["role"],
  parts: UIMessage<MessageMeta>["parts"]
): UIMessage<MessageMeta> {
  return {
    id,
    role,
    parts,
    metadata: { sessionId: "session-1", createdAt: new Date("2026-06-30T00:00:00.000Z") },
  };
}

function session(messages: UIMessage<MessageMeta>[] = []): Session {
  return {
    id: "session-1",
    projectId: "project-1",
    agentId: "agent-1",
    title: "Session",
    status: "ended",
    turnCount: 1,
    tokenUsage: { used: 0, size: 1000 },
    createdAt: new Date("2026-06-30T00:00:00.000Z"),
    updatedAt: new Date("2026-06-30T00:00:00.000Z"),
    messages,
  };
}

function proposal(id: string): ProposalMeta {
  return {
    id,
    title: "Proposal",
    status: "draft",
    why: "Because",
    totalTasks: 1,
    doneTasks: 0,
    hasDesign: false,
    date: "2026-06-30",
  };
}

function pendingActionSession(): Session {
  return session([
    message("assistant-1", "assistant", [
      {
        type: "text",
        text: '<fyllo-action type="task.create">{"title":"补齐错误处理"}</fyllo-action>',
      },
    ]),
  ]);
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

function mountEventRailHost(initialSession: Session | null = null): {
  api: EventRailApi;
  activeSession: Ref<Session | null>;
  activeSessionId: Ref<string | null>;
  proposals: Ref<ProposalMeta[]>;
  messageScrollContainerRef: Ref<HTMLElement | null>;
} {
  const activeSession = ref<Session | null>(initialSession);
  const activeSessionId = ref<string | null>(initialSession?.id ?? null);
  const proposals = ref<ProposalMeta[]>([]);
  const messageScrollContainerRef = ref<HTMLElement | null>(null);
  let api: EventRailApi | null = null;

  mount(
    defineComponent({
      setup() {
        api = useChatEventRail({
          activeSession: computed(() => activeSession.value),
          activeSessionId: computed(() => activeSessionId.value),
          getSessionProposals: () => proposals.value,
          messageScrollContainerRef,
        });
        return () => null;
      },
    })
  );

  if (!api) {
    throw new Error("Event rail composable was not initialized.");
  }

  return {
    api,
    activeSession,
    activeSessionId,
    proposals,
    messageScrollContainerRef,
  };
}

describe("useChatEventRail", () => {
  it("shows the event rail for plan entries, proposals, or pending actions", () => {
    const { api, activeSession, proposals } = mountEventRailHost(session());

    expect(api.showEventRail.value).toBe(false);

    activeSession.value = {
      ...session(),
      plan: [{ content: "Step 1", priority: "high", status: "pending" }],
    };
    expect(api.showEventRail.value).toBe(true);

    activeSession.value = session();
    proposals.value = [proposal("proposal-1")];
    expect(api.showEventRail.value).toBe(true);

    proposals.value = [];
    activeSession.value = pendingActionSession();
    expect(api.pendingActionRailItems.value).toHaveLength(1);
    expect(api.showEventRail.value).toBe(true);
  });

  it("hides the event rail in draft mode", () => {
    const { api, activeSessionId } = mountEventRailHost(pendingActionSession());

    expect(api.showEventRail.value).toBe(true);
    activeSessionId.value = null;
    expect(api.showEventRail.value).toBe(false);
  });

  it("scrolls to a Fyllo action anchor", async () => {
    const { api, messageScrollContainerRef } = mountEventRailHost(pendingActionSession());
    const actionId = "chat:session-1:0:0:0";
    const { container, scrollMock } = makeContainer(actionId);

    messageScrollContainerRef.value = container;
    await api.locateFylloAction(actionId);

    expect(scrollMock).toHaveBeenCalledWith({
      block: "center",
      behavior: "smooth",
    });
  });

  it("ignores missing containers and anchors", async () => {
    const { api, messageScrollContainerRef } = mountEventRailHost(pendingActionSession());
    const { container, scrollMock } = makeContainer("chat:session-1:0:0:0");

    await expect(api.locateFylloAction("chat:session-1:0:0:0")).resolves.toBeUndefined();
    messageScrollContainerRef.value = container;
    await expect(api.locateFylloAction("missing:id")).resolves.toBeUndefined();
    expect(scrollMock).not.toHaveBeenCalled();
  });
});
