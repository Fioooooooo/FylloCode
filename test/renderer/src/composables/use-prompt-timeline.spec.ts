import { mount } from "@vue/test-utils";
import { defineComponent, nextTick, ref, type Ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { usePromptTimeline } from "@renderer/composables/usePromptTimeline";
import type { MessageMeta, Session } from "@shared/types/chat";
import type { UIMessage } from "ai";

type TimelineApi = ReturnType<typeof usePromptTimeline>;

function message(
  id: string,
  role: UIMessage<MessageMeta>["role"],
  text: string
): UIMessage<MessageMeta> {
  return {
    id,
    role,
    parts: [{ type: "text", text }],
    metadata: { sessionId: "session-1", createdAt: new Date("2026-06-30T00:00:00.000Z") },
  };
}

function session(messages: UIMessage<MessageMeta>[]): Session {
  return {
    id: "session-1",
    projectId: "project-1",
    agentId: "agent-1",
    title: "Session",
    isPinned: false,
    status: "ended",
    turnCount: 1,
    tokenUsage: { used: 0, size: 1000 },
    createdAt: new Date("2026-06-30T00:00:00.000Z"),
    updatedAt: new Date("2026-06-30T00:00:00.000Z"),
    messages,
  };
}

function rect(top: number, height = 10): DOMRect {
  return {
    x: 0,
    y: top,
    width: 100,
    height,
    top,
    bottom: top + height,
    left: 0,
    right: 100,
    toJSON: () => ({}),
  } as DOMRect;
}

function makeContainer(anchors: Array<{ messageId: string; top: number }>): {
  container: HTMLElement;
  scrollMocks: Record<string, ReturnType<typeof vi.fn>>;
} {
  const container = document.createElement("div");
  const scrollMocks: Record<string, ReturnType<typeof vi.fn>> = {};
  Object.defineProperty(container, "getBoundingClientRect", {
    value: () => rect(0, 100),
  });

  anchors.forEach((anchorInput) => {
    const anchor = document.createElement("div");
    const scrollMock = vi.fn();
    anchor.setAttribute("data-chat-user-message-id", anchorInput.messageId);
    anchor.scrollIntoView = scrollMock;
    Object.defineProperty(anchor, "getBoundingClientRect", {
      value: () => rect(anchorInput.top),
    });
    container.appendChild(anchor);
    scrollMocks[anchorInput.messageId] = scrollMock;
  });

  return { container, scrollMocks };
}

function mountTimelineHost(initialSession: Session | null = null): {
  api: TimelineApi;
  activeSession: Ref<Session | null>;
  activeSessionId: Ref<string | null>;
  isLoadingMessages: Ref<boolean>;
  messageScrollContainerRef: Ref<HTMLElement | null>;
} {
  const activeSession = ref<Session | null>(initialSession);
  const activeSessionId = ref<string | null>(initialSession?.id ?? null);
  const isLoadingMessages = ref(false);
  const messageScrollContainerRef = ref<HTMLElement | null>(null);
  let api: TimelineApi | null = null;

  mount(
    defineComponent({
      setup() {
        api = usePromptTimeline({
          activeSession,
          activeSessionId,
          isLoadingMessages,
          messageScrollContainerRef,
        });
        return () => null;
      },
    })
  );

  if (!api) {
    throw new Error("Timeline composable was not initialized.");
  }

  return {
    api,
    activeSession,
    activeSessionId,
    isLoadingMessages,
    messageScrollContainerRef,
  };
}

describe("usePromptTimeline", () => {
  it("derives prompt timeline items and display state", () => {
    const { api, activeSessionId, isLoadingMessages } = mountTimelineHost(
      session([
        message("user-1", "user", "First prompt"),
        message("assistant-1", "assistant", "Ignored"),
        message("user-2", "user", "Second prompt"),
      ])
    );

    expect(api.promptTimelineItems.value.map((item) => item.id)).toEqual(["user-1", "user-2"]);
    expect(api.showPromptTimeline.value).toBe(true);

    activeSessionId.value = null;
    expect(api.showPromptTimeline.value).toBe(false);

    activeSessionId.value = "session-1";
    isLoadingMessages.value = true;
    expect(api.showPromptTimeline.value).toBe(false);
  });

  it("hides the timeline when there is only one prompt", () => {
    const { api } = mountTimelineHost(session([message("user-1", "user", "Only prompt")]));

    expect(api.promptTimelineItems.value).toHaveLength(1);
    expect(api.showPromptTimeline.value).toBe(false);
  });

  it("tracks the prompt closest to the activation line", async () => {
    const { api, messageScrollContainerRef } = mountTimelineHost(
      session([
        message("user-1", "user", "First prompt"),
        message("user-2", "user", "Second prompt"),
      ])
    );
    const { container } = makeContainer([
      { messageId: "user-1", top: 10 },
      { messageId: "user-2", top: 35 },
    ]);

    messageScrollContainerRef.value = container;
    await nextTick();
    await nextTick();

    expect(api.activePromptTimelineItemId.value).toBe("user-2");
  });

  it("scrolls to a user prompt anchor", async () => {
    const { api, messageScrollContainerRef } = mountTimelineHost(
      session([
        message("user-1", "user", "First prompt"),
        message("user-2", "user", "Second prompt"),
      ])
    );
    const { container, scrollMocks } = makeContainer([
      { messageId: "user-1", top: 10 },
      { messageId: "user-2", top: 35 },
    ]);

    messageScrollContainerRef.value = container;
    await api.locateUserPrompt("user-2");

    expect(scrollMocks["user-2"]).toHaveBeenCalledWith({
      block: "center",
      behavior: "smooth",
    });
    expect(api.activePromptTimelineItemId.value).toBe("user-2");
  });

  it("ignores missing containers and anchors", async () => {
    const { api, messageScrollContainerRef } = mountTimelineHost(
      session([message("user-1", "user", "First prompt")])
    );
    const { container, scrollMocks } = makeContainer([{ messageId: "user-1", top: 10 }]);

    await nextTick();
    await nextTick();
    api.activePromptTimelineItemId.value = "existing";
    await expect(api.locateUserPrompt("user-1")).resolves.toBeUndefined();
    expect(api.activePromptTimelineItemId.value).toBe("existing");

    messageScrollContainerRef.value = container;
    await nextTick();
    await nextTick();
    api.activePromptTimelineItemId.value = "existing";

    await expect(api.locateUserPrompt("missing")).resolves.toBeUndefined();
    expect(scrollMocks["user-1"]).not.toHaveBeenCalled();
    expect(api.activePromptTimelineItemId.value).toBe("existing");
  });
});
