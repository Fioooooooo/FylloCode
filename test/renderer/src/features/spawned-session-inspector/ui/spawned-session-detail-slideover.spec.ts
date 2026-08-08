import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SpawnedSessionDetailSlideover from "@renderer/features/spawned-session-inspector/ui/SpawnedSessionDetailSlideover.vue";

const result = {
  status: "ready" as const,
  summary: {
    sessionId: "spawn-1",
    agent: { agentId: "agent-1", name: "Agent One" },
    status: "interrupted" as const,
    mode: "background" as const,
    startedAt: "2026-08-08T00:00:00.000Z",
    lastActivityAt: "2026-08-08T00:00:01.000Z",
    updatedAt: "2026-08-08T00:00:02.000Z",
    promptPreview: "Inspect code",
    latestResponseId: "response-1",
    error: { code: "APP_RESTARTED", message: "App restarted" },
  },
  initialPrompt: { text: "Inspect *all* code" },
  currentPrompt: { text: "Inspect *all* code" },
  turns: [
    {
      turnId: "turn-1",
      ordinal: 1,
      mode: "background" as const,
      status: "interrupted" as const,
      startedAt: "2026-08-08T00:00:00.000Z",
      lastActivityAt: "2026-08-08T00:00:01.000Z",
      updatedAt: "2026-08-08T00:00:02.000Z",
      responseId: "response-1",
      error: { code: "APP_RESTARTED", message: "App restarted" },
      recentActivity: [],
    },
  ],
  messages: [
    {
      id: "assistant-1",
      role: "assistant" as const,
      durable: true as const,
      createdAt: "2026-08-08T00:00:01.000Z",
      parts: [
        { type: "reasoning" as const, text: "Thinking" },
        {
          type: "dynamic-tool" as const,
          toolCallId: "tool-1",
          toolName: "Read",
          state: "output-available" as const,
          output: "done",
        },
        { type: "text" as const, text: "Final *answer*" },
      ],
    },
  ],
};

describe("SpawnedSessionDetailSlideover", () => {
  it("renders trusted status, Prompt, activity and text-only transcript", () => {
    const wrapper = mount(SpawnedSessionDetailSlideover, {
      props: { open: true, loading: false, error: null, result },
      global: {
        stubs: {
          ChatActivityGroup: {
            props: ["activities"],
            template:
              '<div data-test="activity">{{ activities.map((x) => x.part.type).join(",") }}</div>',
          },
          MarkStream: {
            props: ["content", "enableActions", "enableSignals"],
            template:
              '<div data-test="transcript" :data-actions="String(enableActions)" :data-signals="String(enableSignals)">{{ content }}</div>',
          },
        },
      },
    });
    expect(wrapper.text()).toContain("已中断");
    expect(wrapper.text()).toContain("APP_RESTARTED");
    expect(wrapper.text()).toContain("Inspect *all* code");
    expect(wrapper.get('[data-test="activity"]').text()).toBe("reasoning,dynamic-tool");
    expect(wrapper.get('[data-test="transcript"]').text()).toBe("Final *answer*");
    expect(wrapper.get('[data-test="transcript"]').attributes("data-actions")).toBe("false");
    expect(wrapper.get('[data-test="transcript"]').attributes("data-signals")).toBe("false");
    expect(wrapper.html()).not.toContain("response.md");
    expect(wrapper.html()).not.toMatch(/em\s*\{/);
  });

  it("distinguishes loading, query error and not_found", async () => {
    const wrapper = mount(SpawnedSessionDetailSlideover, {
      props: { open: true, loading: true, error: null, result: null },
    });
    expect(wrapper.text()).toContain("正在加载子 Agent Session");
    await wrapper.setProps({ loading: false, error: "offline" });
    expect(wrapper.text()).toContain("offline");
    await wrapper.setProps({ error: null, result: { status: "not_found" } });
    expect(wrapper.text()).toContain("Session 信息不可用");
  });
});
