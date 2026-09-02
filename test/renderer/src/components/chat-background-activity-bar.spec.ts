import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import ChatBackgroundActivityBar from "@renderer/components/chat/ChatBackgroundActivityBar.vue";
import { useSessionStore } from "@renderer/stores/session/session";

describe("ChatBackgroundActivityBar", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("mounts workflow and spawned activity entries as siblings", () => {
    const sessionStore = useSessionStore();
    sessionStore.sessions = [
      {
        id: "parent-1",
        workspaceId: "workspace-1",
        agentId: "agent-1",
        sessionMode: "fyllocode",
        title: "Parent",
        isPinned: false,
        status: "ended",
        turnCount: 0,
        tokenUsage: { used: 0, size: 0 },
        createdAt: new Date("2026-08-20T00:00:00.000Z"),
        updatedAt: new Date("2026-08-20T00:00:00.000Z"),
        messages: [],
      },
    ];
    sessionStore.activeSessionId = "parent-1";

    const wrapper = mount(ChatBackgroundActivityBar, {
      global: {
        stubs: {
          SpawnedSessionActivityEntry: {
            template: '<div data-test="spawned-entry" />',
            props: ["workspaceId", "parentSessionId"],
          },
          WorkflowRunActivityEntry: {
            template: '<div data-test="workflow-entry" />',
            props: ["workspaceId", "parentSessionId"],
          },
        },
      },
    });

    expect(wrapper.find('[data-test="spawned-entry"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="workflow-entry"]').exists()).toBe(true);
  });
});
