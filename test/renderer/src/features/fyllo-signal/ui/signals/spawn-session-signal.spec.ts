import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SpawnSessionSignal from "@renderer/features/fyllo-signal/ui/signals/SpawnSessionSignal.vue";

describe("SpawnSessionSignal", () => {
  it("stays non-interactive when trusted host context is absent", () => {
    const wrapper = mount(SpawnSessionSignal, {
      props: { payload: { sessionId: "spawn-1" } },
    });
    expect(wrapper.text()).toContain("Session 信息不可用");
    expect(wrapper.get("[data-fyllo-signal-spawn-session-unavailable]").classes()).toContain(
      "my-4"
    );
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("passes only the opaque payload identity plus host context to the inspector", () => {
    const wrapper = mount(SpawnSessionSignal, {
      props: {
        payload: { sessionId: "spawn-1" },
        hostContext: { workspaceId: "workspace-1", parentSessionId: "parent-1" },
      },
      global: {
        stubs: {
          SpawnedSessionInlineEntry: {
            props: ["workspaceId", "parentSessionId", "sessionId"],
            template:
              '<div data-test="inline" :data-workspace="workspaceId" :data-parent="parentSessionId" :data-session="sessionId" />',
          },
        },
      },
    });
    const inline = wrapper.get('[data-test="inline"]');
    expect(inline.attributes()).toMatchObject({
      "data-workspace": "workspace-1",
      "data-parent": "parent-1",
      "data-session": "spawn-1",
    });
  });
});
