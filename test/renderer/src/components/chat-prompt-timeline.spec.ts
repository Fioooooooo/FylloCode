import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ChatPromptTimeline from "@renderer/components/chat/ChatPromptTimeline.vue";
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
];

describe("ChatPromptTimeline", () => {
  it("marks active and inactive prompt items", () => {
    const wrapper = mount(ChatPromptTimeline, {
      props: {
        items,
        activeItemId: "user-2",
      },
    });

    const buttons = wrapper.findAll('[data-test="chat-prompt-timeline-item"]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.attributes("data-state")).toBe("inactive");
    expect(buttons[1]?.attributes("data-state")).toBe("active");
    expect(buttons[1]?.attributes("aria-current")).toBe("true");
  });

  it("emits locate-prompt when an item is clicked", async () => {
    const wrapper = mount(ChatPromptTimeline, {
      props: {
        items,
        activeItemId: null,
      },
    });

    await wrapper.findAll('[data-test="chat-prompt-timeline-item"]')[1]?.trigger("click");

    expect(wrapper.emitted("locate-prompt")).toEqual([["user-2"]]);
  });

  it("shows the prompt preview on hover", async () => {
    const wrapper = mount(ChatPromptTimeline, {
      props: {
        items,
        activeItemId: null,
      },
    });

    await wrapper.findAll('[data-test="chat-prompt-timeline-item"]')[0]?.trigger("mouseenter");

    expect(wrapper.get('[data-test="chat-prompt-timeline-preview"]').text()).toBe("First prompt");
  });
});
