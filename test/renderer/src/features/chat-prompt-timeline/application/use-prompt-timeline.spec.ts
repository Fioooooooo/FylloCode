import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, nextTick, ref, type Ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { usePromptTimeline } from "@renderer/features/chat-prompt-timeline/application/use-prompt-timeline";
import type { ChatPromptTimelineItem } from "@renderer/features/chat-prompt-timeline/model/chat-prompt-timeline";

type TimelineApi = ReturnType<typeof usePromptTimeline>;

interface AnchorInput {
  messageId: string;
  offset: number;
}

interface ResizeObserverHarness {
  callback: ResizeObserverCallback;
  disconnect: Mock<() => void>;
  observe: Mock<(target: Element) => void>;
}

let animationFrameCallbacks = new Map<number, FrameRequestCallback>();
let nextAnimationFrameId = 0;
let resizeObservers: ResizeObserverHarness[] = [];

function timelineItems(...ids: string[]): ChatPromptTimelineItem[] {
  return ids.map((id, index) => ({
    id,
    messageId: id,
    index: index + 1,
    label: String(index + 1),
    preview: `Prompt ${index + 1}`,
  }));
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

function makeContainer(anchorInputs: AnchorInput[]): {
  anchors: Map<string, HTMLElement>;
  container: HTMLElement;
  content: HTMLElement;
  offsets: Map<string, number>;
  scrollToMock: ReturnType<typeof vi.fn>;
} {
  const container = document.createElement("div");
  const content = document.createElement("div");
  const anchors = new Map<string, HTMLElement>();
  const offsets = new Map(anchorInputs.map(({ messageId, offset }) => [messageId, offset]));

  Object.defineProperties(container, {
    clientHeight: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: 1000 },
    scrollTop: { configurable: true, value: 0, writable: true },
    getBoundingClientRect: {
      configurable: true,
      value: vi.fn(() => rect(0, 100)),
    },
  });

  for (const { messageId } of anchorInputs) {
    const anchor = document.createElement("div");
    anchor.setAttribute("data-chat-user-message-id", messageId);
    Object.defineProperty(anchor, "getBoundingClientRect", {
      configurable: true,
      value: vi.fn(() => rect((offsets.get(messageId) ?? 0) - container.scrollTop)),
    });
    anchors.set(messageId, anchor);
    content.appendChild(anchor);
  }

  container.appendChild(content);
  const scrollToMock = vi.fn((options: ScrollToOptions) => {
    if (options.behavior === "auto") {
      container.scrollTop = options.top ?? 0;
      container.dispatchEvent(new Event("scroll"));
    }
  });
  container.scrollTo = scrollToMock as typeof container.scrollTo;

  return { anchors, container, content, offsets, scrollToMock };
}

function mountTimelineHost(initialItems: ChatPromptTimelineItem[] = []): {
  api: TimelineApi;
  activeSessionId: Ref<string | null>;
  isLoadingMessages: Ref<boolean>;
  messageContentRef: Ref<HTMLElement | null>;
  messageScrollContainerRef: Ref<HTMLElement | null>;
  wrapper: VueWrapper;
} {
  const promptTimelineItems = ref(initialItems);
  const activeSessionId = ref<string | null>(initialItems.length > 0 ? "session-1" : null);
  const isLoadingMessages = ref(false);
  const messageContentRef = ref<HTMLElement | null>(null);
  const messageScrollContainerRef = ref<HTMLElement | null>(null);
  let api: TimelineApi | null = null;

  const wrapper = mount(
    defineComponent({
      setup() {
        api = usePromptTimeline({
          promptTimelineItems,
          activeSessionId,
          isLoadingMessages,
          messageContentRef,
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
    activeSessionId,
    isLoadingMessages,
    messageContentRef,
    messageScrollContainerRef,
    wrapper,
  };
}

async function bindContainer(
  host: ReturnType<typeof mountTimelineHost>,
  fixture: ReturnType<typeof makeContainer>
): Promise<void> {
  host.messageScrollContainerRef.value = fixture.container;
  host.messageContentRef.value = fixture.content;
  await nextTick();
  await nextTick();
  flushAnimationFrames();
}

function flushAnimationFrames(): void {
  let pass = 0;
  while (animationFrameCallbacks.size > 0 && pass < 10) {
    const callbacks = [...animationFrameCallbacks.values()];
    animationFrameCallbacks.clear();
    callbacks.forEach((callback) => callback(performance.now()));
    pass += 1;
  }
}

describe("usePromptTimeline", () => {
  beforeEach(() => {
    animationFrameCallbacks = new Map();
    nextAnimationFrameId = 0;
    resizeObservers = [];
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(
      vi.fn((callback: FrameRequestCallback) => {
        nextAnimationFrameId += 1;
        animationFrameCallbacks.set(nextAnimationFrameId, callback);
        return nextAnimationFrameId;
      })
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(
      vi.fn((id: number) => {
        animationFrameCallbacks.delete(id);
      })
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        readonly harness: ResizeObserverHarness;

        constructor(callback: ResizeObserverCallback) {
          this.harness = {
            callback,
            disconnect: vi.fn<() => void>(),
            observe: vi.fn<(target: Element) => void>(),
          };
          resizeObservers.push(this.harness);
        }

        observe(target: Element): void {
          this.harness.observe(target);
        }

        disconnect(): void {
          this.harness.disconnect();
        }
      }
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false }))
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses injected prompt timeline items and derives display state", () => {
    const { api, activeSessionId, isLoadingMessages } = mountTimelineHost(
      timelineItems("user-1", "user-2")
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
    const { api } = mountTimelineHost(timelineItems("user-1"));

    expect(api.promptTimelineItems.value).toHaveLength(1);
    expect(api.showPromptTimeline.value).toBe(false);
  });

  it("activates the last prompt that has crossed the 35% reading line", async () => {
    const host = mountTimelineHost(timelineItems("user-1", "user-2"));
    const fixture = makeContainer([
      { messageId: "user-1", offset: 10 },
      { messageId: "user-2", offset: 36 },
    ]);
    await bindContainer(host, fixture);

    expect(host.api.activePromptTimelineItemId.value).toBe("user-1");

    fixture.container.scrollTop = 2;
    fixture.container.dispatchEvent(new Event("scroll"));
    flushAnimationFrames();
    expect(host.api.activePromptTimelineItemId.value).toBe("user-2");
  });

  it("coalesces scroll updates and does not read anchor layout on the scroll path", async () => {
    const host = mountTimelineHost(timelineItems("user-1", "user-2"));
    const fixture = makeContainer([
      { messageId: "user-1", offset: 10 },
      { messageId: "user-2", offset: 80 },
    ]);
    await bindContainer(host, fixture);
    const rectCallsBeforeScroll = [...fixture.anchors.values()].map(
      (anchor) => vi.mocked(anchor.getBoundingClientRect).mock.calls.length
    );
    const requestCallsBeforeScroll = vi.mocked(window.requestAnimationFrame).mock.calls.length;

    fixture.container.dispatchEvent(new Event("scroll"));
    fixture.container.dispatchEvent(new Event("scroll"));
    fixture.container.dispatchEvent(new Event("scroll"));

    expect(
      vi.mocked(window.requestAnimationFrame).mock.calls.length - requestCallsBeforeScroll
    ).toBe(1);
    flushAnimationFrames();
    expect(
      [...fixture.anchors.values()].map(
        (anchor) => vi.mocked(anchor.getBoundingClientRect).mock.calls.length
      )
    ).toEqual(rectCallsBeforeScroll);
  });

  it("remeasures anchors when observed message content changes size", async () => {
    const host = mountTimelineHost(timelineItems("user-1", "user-2"));
    const fixture = makeContainer([
      { messageId: "user-1", offset: 10 },
      { messageId: "user-2", offset: 90 },
    ]);
    await bindContainer(host, fixture);
    expect(host.api.activePromptTimelineItemId.value).toBe("user-1");

    fixture.offsets.set("user-2", 30);
    resizeObservers.at(-1)?.callback([], {} as ResizeObserver);
    flushAnimationFrames();

    expect(host.api.activePromptTimelineItemId.value).toBe("user-2");
  });

  it("positions smooth navigation at the reading line and locks active during travel", async () => {
    vi.useFakeTimers();
    const host = mountTimelineHost(timelineItems("user-1", "user-2", "user-3"));
    const fixture = makeContainer([
      { messageId: "user-1", offset: 10 },
      { messageId: "user-2", offset: 100 },
      { messageId: "user-3", offset: 200 },
    ]);
    await bindContainer(host, fixture);

    await host.api.locateUserPrompt("user-3", "smooth");
    expect(fixture.scrollToMock).toHaveBeenCalledWith({ top: 165, behavior: "smooth" });
    expect(host.api.activePromptTimelineItemId.value).toBe("user-3");

    fixture.container.scrollTop = 80;
    fixture.container.dispatchEvent(new Event("scroll"));
    flushAnimationFrames();
    expect(host.api.activePromptTimelineItemId.value).toBe("user-3");

    fixture.container.scrollTop = 165;
    fixture.container.dispatchEvent(new Event("scroll"));
    flushAnimationFrames();
    expect(host.api.activePromptTimelineItemId.value).toBe("user-3");
  });

  it("uses immediate positioning for drag intent and reduced motion", async () => {
    const host = mountTimelineHost(timelineItems("user-1", "user-2"));
    const fixture = makeContainer([
      { messageId: "user-1", offset: 10 },
      { messageId: "user-2", offset: 100 },
    ]);
    await bindContainer(host, fixture);

    await host.api.locateUserPrompt("user-2", "immediate");
    expect(fixture.scrollToMock).toHaveBeenLastCalledWith({ top: 65, behavior: "auto" });

    vi.mocked(matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    await host.api.locateUserPrompt("user-1", "smooth");
    expect(fixture.scrollToMock).toHaveBeenLastCalledWith({ top: 0, behavior: "auto" });
  });

  it("cleans listeners, observers, frames, and navigation timers on replacement and unmount", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const host = mountTimelineHost(timelineItems("user-1", "user-2"));
    const first = makeContainer([
      { messageId: "user-1", offset: 10 },
      { messageId: "user-2", offset: 100 },
    ]);
    const second = makeContainer([
      { messageId: "user-1", offset: 20 },
      { messageId: "user-2", offset: 120 },
    ]);
    const firstRemoveListener = vi.spyOn(first.container, "removeEventListener");
    await bindContainer(host, first);
    await host.api.locateUserPrompt("user-2", "smooth");

    await bindContainer(host, second);
    expect(firstRemoveListener).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(resizeObservers[0]?.disconnect).toHaveBeenCalled();

    second.container.dispatchEvent(new Event("scroll"));
    host.wrapper.unmount();
    expect(resizeObservers.at(-1)?.disconnect).toHaveBeenCalled();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores missing containers and anchors", async () => {
    const host = mountTimelineHost(timelineItems("user-1"));
    await expect(host.api.locateUserPrompt("user-1")).resolves.toBeUndefined();

    const fixture = makeContainer([{ messageId: "user-1", offset: 10 }]);
    await bindContainer(host, fixture);
    await expect(host.api.locateUserPrompt("missing")).resolves.toBeUndefined();
    expect(fixture.scrollToMock).not.toHaveBeenCalled();
  });
});
