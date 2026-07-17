import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AssistantStreamIndicator from "@renderer/components/chat/message/AssistantStreamIndicator.vue";

let nextFrameId = 0;
let animationFrames = new Map<number, FrameRequestCallback>();

function flushAnimationFrames(): void {
  while (animationFrames.size > 0) {
    const pendingFrames = animationFrames;
    animationFrames = new Map();
    pendingFrames.forEach((callback) => callback(0));
  }
}

describe("AssistantStreamIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T08:00:12.000Z"));
    nextFrameId = 0;
    animationFrames = new Map();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      nextFrameId += 1;
      animationFrames.set(nextFrameId, callback);
      return nextFrameId;
    });
    vi.stubGlobal("cancelAnimationFrame", (frameId: number) => {
      animationFrames.delete(frameId);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("animates preset status, dots, and elapsed time while mounted", async () => {
    const wrapper = mount(AssistantStreamIndicator, {
      props: { startedAt: new Date("2026-07-17T08:00:00.000Z").getTime() },
      global: {
        stubs: {
          UChatShimmer: {
            props: ["text"],
            template: '<span data-test="assistant-stream-status">{{ text }}</span>',
          },
        },
      },
    });

    await nextTick();

    expect(wrapper.get('[data-test="assistant-stream-elapsed"]').text()).toBe("工作中 · 12 秒");
    expect(wrapper.text()).toContain("正在思考…");
    expect(
      wrapper.findAll('[data-test="assistant-stream-indicator-dot"][data-active="true"]')
    ).toHaveLength(16);

    vi.advanceTimersByTime(120);
    await nextTick();
    expect(
      wrapper.findAll('[data-test="assistant-stream-indicator-dot"][data-active="true"]')
    ).toHaveLength(4);

    vi.advanceTimersByTime(880);
    await nextTick();
    expect(wrapper.get('[data-test="assistant-stream-elapsed"]').text()).toBe("工作中 · 13 秒");

    vi.advanceTimersByTime(2000);
    flushAnimationFrames();
    await nextTick();
    expect(wrapper.text()).toContain("正在分析…");

    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(animationFrames).toHaveLength(0);
  });

  it("formats longer work durations with natural Chinese units", async () => {
    const now = new Date("2026-07-17T08:00:00.000Z").getTime();
    const cases = [
      { seconds: 60, expected: "工作中 · 1 分 00 秒" },
      { seconds: 12 * 60 + 8, expected: "工作中 · 12 分 08 秒" },
      { seconds: 60 * 60, expected: "工作中 · 1 小时" },
      { seconds: 60 * 60 + 12 * 60, expected: "工作中 · 1 小时 12 分" },
      { seconds: 24 * 60 * 60 + 3 * 60 * 60, expected: "工作中 · 1 天 3 小时" },
    ];

    for (const testCase of cases) {
      vi.setSystemTime(now);
      const wrapper = mount(AssistantStreamIndicator, {
        props: { startedAt: now - testCase.seconds * 1000 },
      });

      await nextTick();
      expect(wrapper.get('[data-test="assistant-stream-elapsed"]').text()).toBe(testCase.expected);
      wrapper.unmount();
    }
  });
});
