import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ChatPromptTimelineNav from "@renderer/components/chat/timeline/ChatPromptTimelineNav.vue";
import type { ChatPromptTimelineItem } from "@renderer/utils/chat-prompt-timeline";

function makeItems(count: number): ChatPromptTimelineItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `user-${index + 1}`,
    messageId: `user-${index + 1}`,
    index: index + 1,
    label: String(index + 1),
    preview:
      index === 0
        ? "A very long first prompt that should remain on one line and be truncated"
        : `Prompt ${index + 1}`,
  }));
}

function mountTimeline(
  options: {
    count?: number;
    activeIndex?: number | null;
    rect?: { top: number; height: number };
  } = {}
) {
  const count = options.count ?? 5;
  const items = makeItems(count);
  const activeIndex = options.activeIndex === undefined ? 1 : options.activeIndex;
  const wrapper = mount(ChatPromptTimelineNav, {
    props: {
      items,
      activeItemId: activeIndex === null ? null : (items[activeIndex]?.id ?? null),
    },
  });
  const rail = wrapper.get('[data-test="chat-prompt-timeline"]');
  const rect = options.rect ?? { top: 100, height: Number(rail.attributes("data-rail-height")) };
  Object.defineProperty(rail.element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ top: rect.top, height: rect.height }),
  });
  return { items, rail, wrapper };
}

function pointer(clientY: number, pointerId = 1): PointerEvent {
  return {
    button: 0,
    clientY,
    pointerId,
    preventDefault: vi.fn(),
  } as unknown as PointerEvent;
}

function selectedPreviewId(
  wrapper: ReturnType<typeof mountTimeline>["wrapper"]
): string | undefined {
  return wrapper
    .find('[data-test="chat-prompt-timeline-preview"][data-selected="true"]')
    .attributes("data-item-id");
}

describe("ChatPromptTimelineNav", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("bounds guide count and long-rail height without a nested scrollbar", () => {
    const short = mountTimeline({ count: 8 });
    const long = mountTimeline({ count: 24 });
    const longest = mountTimeline({ count: 61 });

    expect(short.wrapper.findAll('[data-test="chat-prompt-timeline-guide"]')).toHaveLength(8);
    expect(long.wrapper.findAll('[data-test="chat-prompt-timeline-guide"]')).toHaveLength(10);
    expect(longest.wrapper.findAll('[data-test="chat-prompt-timeline-guide"]')).toHaveLength(10);
    expect(long.rail.attributes("data-rail-height")).toBe("164");
    expect(longest.rail.attributes("data-rail-height")).toBe("164");
    expect(long.rail.classes()).not.toContain("overflow-y-auto");
    expect(longest.rail.classes()).not.toContain("overflow-y-auto");
  });

  it("maps the complete rail continuously while hover only updates preview", async () => {
    const { rail, wrapper } = mountTimeline({
      count: 61,
      activeIndex: 0,
      rect: { top: 100, height: 164 },
    });

    await rail.trigger("pointermove", pointer(100));
    expect(selectedPreviewId(wrapper)).toBe("user-1");
    expect(wrapper.emitted("locate-prompt")).toBeUndefined();

    await rail.trigger("pointermove", pointer(127.33));
    expect(selectedPreviewId(wrapper)).toBe("user-11");

    await rail.trigger("pointermove", pointer(182));
    expect(selectedPreviewId(wrapper)).toBe("user-31");

    await rail.trigger("pointermove", pointer(264));
    expect(selectedPreviewId(wrapper)).toBe("user-61");
    expect(wrapper.emitted("locate-prompt")).toBeUndefined();
  });

  it("uses smooth navigation for a click and immediate navigation only while dragging", async () => {
    const clicked = mountTimeline({
      count: 61,
      activeIndex: null,
      rect: { top: 100, height: 164 },
    });
    await clicked.rail.trigger("pointerdown", pointer(182));
    await clicked.rail.trigger("pointerup", pointer(182));
    expect(clicked.wrapper.emitted("locate-prompt")).toEqual([["user-31", "smooth"]]);

    const dragged = mountTimeline({
      count: 61,
      activeIndex: null,
      rect: { top: 100, height: 164 },
    });
    await dragged.rail.trigger("pointerdown", pointer(100, 2));
    await dragged.rail.trigger("pointermove", pointer(182, 2));
    await dragged.rail.trigger("pointermove", pointer(264, 2));
    await dragged.rail.trigger("pointerup", pointer(264, 2));
    expect(dragged.wrapper.emitted("locate-prompt")).toEqual([
      ["user-31", "immediate"],
      ["user-61", "immediate"],
    ]);
  });

  it("keeps every guide neutral while the active thumb moves independently", async () => {
    const { items, rail, wrapper } = mountTimeline({ count: 61, activeIndex: 0 });
    const guideClasses = wrapper
      .findAll('[data-test="chat-prompt-timeline-guide"]')
      .map((guide) => guide.classes().join(" "));
    expect(
      wrapper.get('[data-test="chat-prompt-timeline-thumb"]').attributes("data-active-ratio")
    ).toBe("0");

    await wrapper.setProps({ activeItemId: items[30]?.id ?? null });
    expect(
      wrapper.get('[data-test="chat-prompt-timeline-thumb"]').attributes("data-active-ratio")
    ).toBe("0.5");
    await rail.trigger("pointermove", pointer(264));
    await rail.trigger("keydown", { key: "Home" });
    await rail.trigger("keydown", { key: "Enter" });

    expect(
      wrapper
        .findAll('[data-test="chat-prompt-timeline-guide"]')
        .map((guide) => guide.classes().join(" "))
    ).toEqual(guideClasses);
    expect(wrapper.get('[data-test="chat-prompt-timeline-thumb"]').classes()).toContain(
      "bg-primary"
    );
  });

  it("uses a transparent floating surface and only color transitions", async () => {
    const { rail, wrapper } = mountTimeline({ count: 24, rect: { top: 100, height: 164 } });
    const surface = wrapper.get('[data-test="chat-prompt-timeline-surface"]');

    expect(surface.classes()).toEqual(
      expect.arrayContaining([
        "w-11",
        "bg-transparent",
        "border-transparent",
        "shadow-none",
        "transition-colors",
        "duration-150",
        "hover:bg-default/80",
        "focus-within:bg-default/80",
      ])
    );
    expect(surface.classes()).not.toContain("transition-all");

    await rail.trigger("pointerdown", pointer(100));
    await rail.trigger("pointermove", pointer(182));
    expect(surface.classes()).toContain("bg-default/80");
    expect(surface.classes()).toContain("border-default/50");
  });

  it("shows five nearby prompts and fills the transient window at both boundaries", async () => {
    const { rail, wrapper } = mountTimeline({ count: 61, rect: { top: 100, height: 164 } });

    await rail.trigger("pointermove", pointer(100));
    expect(
      wrapper
        .findAll('[data-test="chat-prompt-timeline-preview"]')
        .map((preview) => preview.attributes("data-item-id"))
    ).toEqual(["user-1", "user-2", "user-3", "user-4", "user-5"]);
    expect(wrapper.get('[data-test="chat-prompt-timeline-popover"]').text()).toContain(
      "附近 prompts"
    );
    expect(wrapper.get('[data-test="chat-prompt-timeline-popover-action"]').classes()).toEqual(
      expect.arrayContaining(["border", "border-default/50", "bg-transparent"])
    );

    await rail.trigger("pointermove", pointer(264));
    expect(
      wrapper
        .findAll('[data-test="chat-prompt-timeline-preview"]')
        .map((preview) => preview.attributes("data-item-id"))
    ).toEqual(["user-57", "user-58", "user-59", "user-60", "user-61"]);
  });

  it("pins the complete list with single-line summaries and no selected left border", async () => {
    const { rail, wrapper } = mountTimeline({ count: 61, rect: { top: 100, height: 164 } });
    await rail.trigger("pointermove", pointer(100));

    const firstRow = wrapper.findAll('[data-test="chat-prompt-timeline-preview"]')[0];
    await firstRow?.trigger("click");

    const list = wrapper.get('[data-test="chat-prompt-timeline-preview-list"]');
    const selected = wrapper.get(
      '[data-test="chat-prompt-timeline-preview"][data-selected="true"]'
    );
    const summary = selected.get('[data-test="chat-prompt-timeline-preview-text"]');
    expect(list.attributes("data-mode")).toBe("pinned");
    expect(list.classes()).toEqual(expect.arrayContaining(["max-h-72", "overflow-y-auto"]));
    expect(wrapper.findAll('[data-test="chat-prompt-timeline-preview"]')).toHaveLength(61);
    expect(wrapper.get('[data-test="chat-prompt-timeline-popover"]').text()).toContain(
      "全部 user prompts"
    );
    expect(summary.classes()).toContain("truncate");
    expect(selected.classes()).toEqual(expect.arrayContaining(["bg-primary/10", "text-default"]));
    expect(selected.classes().some((name) => name.startsWith("border-l"))).toBe(false);
    expect(selected.classes()).not.toContain("border-primary");
    expect(wrapper.emitted("locate-prompt")?.at(-1)).toEqual(["user-1", "smooth"]);

    const lastRow = wrapper.findAll('[data-test="chat-prompt-timeline-preview"]')[60];
    await lastRow?.trigger("click");
    expect(wrapper.find('[data-test="popover-content"]').exists()).toBe(true);
    expect(selectedPreviewId(wrapper)).toBe("user-61");
    expect(wrapper.emitted("locate-prompt")?.at(-1)).toEqual(["user-61", "smooth"]);
  });

  it("keeps transient content open across the portal gap but never timer-closes pinned content", async () => {
    vi.useFakeTimers();
    const { rail, wrapper } = mountTimeline({ count: 24, rect: { top: 100, height: 164 } });
    await rail.trigger("pointermove", pointer(100));
    await rail.trigger("pointerleave");

    const content = wrapper.get('[data-test="chat-prompt-timeline-popover"]');
    await content.trigger("pointerenter");
    vi.advanceTimersByTime(200);
    expect(wrapper.find('[data-test="popover-content"]').exists()).toBe(true);

    await wrapper.get('[data-test="chat-prompt-timeline-popover-action"]').trigger("click");
    await content.trigger("pointerleave");
    vi.advanceTimersByTime(200);
    expect(wrapper.find('[data-test="popover-content"]').exists()).toBe(true);
  });

  it("moves by one prompt with the wheel and keeps pinned selection visible", async () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    try {
      const { rail, wrapper } = mountTimeline({
        count: 61,
        activeIndex: 30,
        rect: { top: 100, height: 164 },
      });
      await rail.trigger("focus");
      await rail.trigger("keydown", { key: "Enter" });
      await wrapper.vm.$nextTick();
      scrollIntoView.mockClear();

      await rail.trigger("wheel", { deltaY: 10 });
      await wrapper.vm.$nextTick();
      expect(selectedPreviewId(wrapper)).toBe("user-32");
      expect(wrapper.emitted("locate-prompt")?.at(-1)).toEqual(["user-32", "immediate"]);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    } finally {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView,
      });
    }
  });

  it("exposes one slider stop and navigates the complete item range from the keyboard", async () => {
    const { rail, wrapper } = mountTimeline({ count: 61, activeIndex: 30 });

    expect(rail.attributes()).toMatchObject({
      role: "slider",
      tabindex: "0",
      "aria-valuemin": "1",
      "aria-valuemax": "61",
      "aria-valuenow": "31",
      "aria-valuetext": "第 31 条 prompt，共 61 条",
    });
    expect(wrapper.findAll('[tabindex="0"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-test="chat-prompt-timeline-guide"][tabindex]')).toHaveLength(0);

    await rail.trigger("focus");
    await rail.trigger("keydown", { key: "ArrowDown" });
    expect(rail.attributes("aria-valuenow")).toBe("32");
    expect(selectedPreviewId(wrapper)).toBe("user-32");

    await rail.trigger("keydown", { key: "Home" });
    expect(rail.attributes("aria-valuenow")).toBe("1");
    await rail.trigger("keydown", { key: "End" });
    expect(rail.attributes("aria-valuenow")).toBe("61");
    await rail.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("locate-prompt")?.at(-1)).toEqual(["user-61", "smooth"]);
    expect(
      wrapper.get('[data-test="chat-prompt-timeline-preview-list"]').attributes("data-mode")
    ).toBe("pinned");

    await rail.trigger("keydown", { key: "Escape" });
    expect(wrapper.find('[data-test="popover-content"]').exists()).toBe(false);
    expect(rail.attributes("aria-valuenow")).toBe("31");
    expect(
      wrapper.get('[data-test="chat-prompt-timeline-thumb"]').attributes("data-active-ratio")
    ).toBe("0.5");
  });

  it("prevents popover autofocus and releases pointer capture on cancel and unmount", async () => {
    const canceled = mountTimeline({ count: 24, rect: { top: 100, height: 164 } });
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.assign(canceled.rail.element, {
      hasPointerCapture: () => true,
      releasePointerCapture,
      setPointerCapture,
    });

    await canceled.rail.trigger("pointerdown", pointer(100));
    expect(setPointerCapture).toHaveBeenCalledWith(1);
    await canceled.rail.trigger("pointercancel", pointer(100));
    expect(releasePointerCapture).toHaveBeenCalledWith(1);
    expect(
      canceled.wrapper
        .get('[data-test="popover-stub"]')
        .attributes("data-open-auto-focus-prevented")
    ).toBe("true");
    expect(
      canceled.wrapper
        .get('[data-test="popover-stub"]')
        .attributes("data-close-auto-focus-prevented")
    ).toBe("true");

    const unmounted = mountTimeline({ count: 24, rect: { top: 100, height: 164 } });
    const releaseOnUnmount = vi.fn();
    Object.assign(unmounted.rail.element, {
      hasPointerCapture: () => true,
      releasePointerCapture: releaseOnUnmount,
      setPointerCapture: vi.fn(),
    });
    await unmounted.rail.trigger("pointerdown", pointer(100, 2));
    unmounted.wrapper.unmount();
    expect(releaseOnUnmount).toHaveBeenCalledWith(2);
  });

  it("closes a stale preview when the session replaces items at the same index", async () => {
    const { items, rail, wrapper } = mountTimeline({ count: 24, rect: { top: 100, height: 164 } });
    await rail.trigger("focus");
    await rail.trigger("keydown", { key: "Enter" });
    expect(wrapper.find('[data-test="popover-content"]').exists()).toBe(true);

    await wrapper.setProps({
      items: items.map((item) => ({
        ...item,
        id: `replacement-${item.id}`,
        messageId: `replacement-${item.messageId}`,
      })),
    });

    expect(wrapper.find('[data-test="popover-content"]').exists()).toBe(false);
  });
});
