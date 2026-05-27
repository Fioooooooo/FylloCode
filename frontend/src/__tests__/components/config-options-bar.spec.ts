import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { useSessionStore } from "@renderer/stores/session";
import ConfigOptionsBar from "@renderer/components/chat/prompt/ConfigOptionsBar.vue";
import type { Session } from "@shared/types/chat";

const ConfigOptionItemStub = {
  name: "ConfigOptionItem",
  props: ["option", "isPending"],
  template: '<div :data-test="`item-${option.id}`">{{ option.id }}</div>',
};

const TransitionStub = {
  template: "<div><slot /></div>",
};

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    projectId: "project-1",
    agentId: "claude-code",
    title: "Session",
    status: "running",
    turnCount: 1,
    tokenUsage: { used: 0, size: 0 },
    createdAt: new Date(),
    updatedAt: new Date(),
    messages: [],
    ...overrides,
  };
}

function mountBar(): ReturnType<typeof mount> {
  return mount(ConfigOptionsBar, {
    global: {
      stubs: {
        ConfigOptionItem: ConfigOptionItemStub,
        Transition: TransitionStub,
      },
    },
  });
}

describe("ConfigOptionsBar", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("renders nothing in draft state", () => {
    const sessionStore = useSessionStore();
    sessionStore.sessions = [];
    sessionStore.activeSessionId = null;

    const wrapper = mountBar();
    expect(wrapper.find('[data-test^="item-"]').exists()).toBe(false);
  });

  it("renders nothing when configOptions is empty", () => {
    const sessionStore = useSessionStore();
    sessionStore.sessions = [makeSession({ configOptions: [] })];
    sessionStore.activeSessionId = "session-1";

    const wrapper = mountBar();
    expect(wrapper.find('[data-test^="item-"]').exists()).toBe(false);
  });

  it("renders sorted items by mode, model, thought_level, then agent order", () => {
    const sessionStore = useSessionStore();
    sessionStore.sessions = [
      makeSession({
        configOptions: [
          {
            type: "select",
            id: "thought",
            name: "Thought",
            category: "thought_level",
            currentValue: "high",
            options: [{ value: "high", name: "High" }],
          },
          {
            type: "select",
            id: "extra",
            name: "Extra",
            category: "_custom",
            currentValue: "x",
            options: [{ value: "x", name: "X" }],
          },
          {
            type: "select",
            id: "mode",
            name: "Mode",
            category: "mode",
            currentValue: "plan",
            options: [{ value: "plan", name: "Plan" }],
          },
          {
            type: "select",
            id: "model",
            name: "Model",
            category: "model",
            currentValue: "sonnet",
            options: [{ value: "sonnet", name: "Sonnet" }],
          },
        ],
      }),
    ];
    sessionStore.activeSessionId = "session-1";

    const wrapper = mountBar();
    const items = wrapper.findAll('[data-test^="item-"]');
    expect(items.map((node) => node.attributes("data-test"))).toEqual([
      "item-mode",
      "item-model",
      "item-thought",
      "item-extra",
    ]);
  });
});
