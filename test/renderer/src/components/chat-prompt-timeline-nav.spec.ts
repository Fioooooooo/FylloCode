import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ChatPromptTimelineNav from "@renderer/components/chat/timeline/ChatPromptTimelineNav.vue";
import type { ChatPromptTimelineItem } from "@renderer/utils/chat-prompt-timeline";

const items: ChatPromptTimelineItem[] = [
  {
    id: "user-1",
    messageId: "user-1",
    index: 1,
    label: "1",
    preview: "First prompt",
  },
  {
    id: "user-2",
    messageId: "user-2",
    index: 2,
    label: "2",
    preview: "Second prompt",
  },
  {
    id: "user-3",
    messageId: "user-3",
    index: 3,
    label: "3",
    preview: "Third prompt",
  },
  {
    id: "user-4",
    messageId: "user-4",
    index: 4,
    label: "4",
    preview: "Fourth prompt",
  },
  {
    id: "user-5",
    messageId: "user-5",
    index: 5,
    label: "5",
    preview: "Last prompt",
  },
];

function mountTimeline(activeItemId: string | null = "user-2") {
  const wrapper = mount(ChatPromptTimelineNav, {
    props: { items, activeItemId },
  });
  const rail = wrapper.get('[data-test="chat-prompt-timeline"]');
  Object.defineProperty(rail.element, "getBoundingClientRect", {
    value: () => ({ top: 100, height: 30 }),
  });
  Object.defineProperty(rail.element, "clientHeight", { value: 30 });
  return { wrapper, rail };
}

function pointer(clientY: number, pointerId = 1): PointerEvent {
  return { clientY, pointerId, preventDefault: vi.fn() } as unknown as PointerEvent;
}

describe("ChatPromptTimelineNav", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders compact, equally spaced, left-aligned lines with distinct active state", () => {
    const { wrapper } = mountTimeline();

    const lines = wrapper.findAll('[data-test="chat-prompt-timeline-item"]');
    expect(lines).toHaveLength(5);
    expect(lines.map((line) => line.attributes("data-offset"))).toEqual([
      "0",
      "6",
      "12",
      "18",
      "24",
    ]);
    expect(lines[0]?.attributes("data-state")).toBe("inactive");
    expect(lines[1]?.attributes("data-state")).toBe("active");
    expect(lines[1]?.attributes("aria-current")).toBe("true");
    expect(lines[0]?.classes()).toContain("w-[14px]");
    expect(lines[1]?.classes()).toContain("w-[22px]");
    expect(lines[1]?.classes()).toContain("bg-primary");
  });

  it("maps every rail position to the nearest line and previews without changing its color", async () => {
    const { wrapper, rail } = mountTimeline();

    await rail.trigger("pointermove", pointer(112));

    const lines = wrapper.findAll('[data-test="chat-prompt-timeline-item"]');
    expect(lines[2]?.attributes("data-preview")).toBe("true");
    expect(lines[2]?.classes()).toContain("w-[22px]");
    expect(lines[2]?.classes()).toContain("bg-accented");
    expect(lines[2]?.classes()).not.toContain("bg-primary");
  });

  it("uses one popover with at most three nearby summaries and no ordinal metadata", async () => {
    const { wrapper, rail } = mountTimeline();

    await rail.trigger("pointermove", pointer(100));

    expect(wrapper.findAll('[data-test="popover-content"]')).toHaveLength(1);
    const previews = wrapper.findAll('[data-test="chat-prompt-timeline-preview"]');
    expect(previews.map((preview) => preview.text())).toEqual([
      "First prompt",
      "Second prompt",
      "Third prompt",
    ]);
    expect(wrapper.get('[data-test="popover-content"]').text()).not.toMatch(
      /第\s*\d+\s*轮|轮次|时间/
    );

    await rail.trigger("pointermove", pointer(124));
    expect(
      wrapper.findAll('[data-test="chat-prompt-timeline-preview"]').map((preview) => preview.text())
    ).toEqual(["Third prompt", "Fourth prompt", "Last prompt"]);
  });

  it("emits smooth navigation for a click and immediate navigation while dragging", async () => {
    const { wrapper, rail } = mountTimeline(null);

    await rail.trigger("pointerdown", pointer(106));
    await rail.trigger("pointerup", pointer(106));
    expect(wrapper.emitted("locate-prompt")).toEqual([["user-2", "smooth"]]);

    await rail.trigger("pointerdown", pointer(100, 2));
    await rail.trigger("pointermove", pointer(112, 2));
    await rail.trigger("pointermove", pointer(118, 2));
    await rail.trigger("pointerup", pointer(118, 2));

    expect(wrapper.emitted("locate-prompt")).toEqual([
      ["user-2", "smooth"],
      ["user-3", "immediate"],
      ["user-4", "immediate"],
    ]);
  });

  it("navigates from one keyboard stop with arrows, boundaries, Enter, and Escape", async () => {
    const { wrapper, rail } = mountTimeline("user-3");

    expect(rail.attributes("tabindex")).toBe("0");
    expect(wrapper.findAll('[data-test="chat-prompt-timeline-item"][tabindex]')).toHaveLength(0);

    await rail.trigger("focus");
    await rail.trigger("keydown", { key: "ArrowDown" });
    expect(wrapper.find('[data-preview="true"]').attributes("data-item-id")).toBe("user-4");

    await rail.trigger("keydown", { key: "Home" });
    expect(wrapper.find('[data-preview="true"]').attributes("data-item-id")).toBe("user-1");

    await rail.trigger("keydown", { key: "End" });
    expect(wrapper.find('[data-preview="true"]').attributes("data-item-id")).toBe("user-5");

    await rail.trigger("keydown", { key: "ArrowUp" });
    await rail.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("locate-prompt")?.at(-1)).toEqual(["user-4", "smooth"]);

    await rail.trigger("keydown", { key: "Escape" });
    expect(wrapper.find('[data-test="popover-content"]').exists()).toBe(false);
    expect(wrapper.get('[data-state="active"]').attributes("data-item-id")).toBe("user-3");
  });

  it("keeps the popover open between the rail and its content, then closes after a delay", async () => {
    vi.useFakeTimers();
    const { wrapper, rail } = mountTimeline();
    await rail.trigger("pointermove", pointer(106));
    await rail.trigger("pointerleave");

    const content = wrapper.get('[data-test="chat-prompt-timeline-popover"]');
    await content.trigger("pointerenter");
    vi.advanceTimersByTime(200);
    expect(wrapper.find('[data-test="popover-content"]').exists()).toBe(true);

    await content.trigger("pointerleave");
    vi.advanceTimersByTime(200);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="popover-content"]').exists()).toBe(false);
  });

  it("reuses smooth navigation when a nearby summary is clicked", async () => {
    const { wrapper, rail } = mountTimeline();
    await rail.trigger("pointermove", pointer(112));

    const previews = wrapper.findAll('[data-test="chat-prompt-timeline-preview"]');
    await previews[0]?.trigger("click");

    expect(wrapper.emitted("locate-prompt")?.at(-1)).toEqual(["user-2", "smooth"]);
  });
});
