import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { useChatStore } from "@renderer/stores/chat";
import { useSessionStore } from "@renderer/stores/session";
import ConfigOptionsBar from "@renderer/components/chat/prompt/ConfigOptionsBar.vue";
import type { Session } from "@shared/types/chat";

const ConfigOptionItemStub = {
  name: "ConfigOptionItem",
  emits: ["change"],
  props: ["option", "isPending"],
  template:
    "<button type=\"button\" :data-test=\"`item-${option.id}`\" @click=\"$emit('change', option.type === 'boolean' ? !option.currentValue : 'sonnet')\">{{ option.id }}</button>",
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

  it("renders nothing in draft state when probe is missing", () => {
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

  it("hides mode options and sorts visible items by model, thought_level, then agent order", () => {
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
      "item-model",
      "item-thought",
      "item-extra",
    ]);
  });

  it("renders nothing when only mode options are available", () => {
    const sessionStore = useSessionStore();
    sessionStore.sessions = [
      makeSession({
        configOptions: [
          {
            type: "select",
            id: "mode",
            name: "Mode",
            category: "mode",
            currentValue: "plan",
            options: [{ value: "plan", name: "Plan" }],
          },
        ],
      }),
    ];
    sessionStore.activeSessionId = "session-1";

    const wrapper = mountBar();

    expect(wrapper.find('[data-test^="item-"]').exists()).toBe(false);
  });

  it("renders draft probe config options when ready", () => {
    const sessionStore = useSessionStore();
    sessionStore.activeSessionId = null;
    sessionStore.draftAgentId = "claude-code";
    sessionStore.applyProbeUpdate("claude-code", {
      agentId: "claude-code",
      status: "ready",
      acpSessionId: "acp-1",
      availableCommands: [],
      configOptions: [
        {
          type: "select",
          id: "model",
          name: "Model",
          currentValue: "haiku",
          options: [{ value: "haiku", name: "Haiku" }],
        },
      ],
    });

    const wrapper = mountBar();

    expect(wrapper.find('[data-test="item-model"]').exists()).toBe(true);
  });

  it("renders nothing while draft probe is starting or failed", async () => {
    const sessionStore = useSessionStore();
    sessionStore.activeSessionId = null;
    sessionStore.draftAgentId = "claude-code";
    sessionStore.applyProbeUpdate("claude-code", {
      agentId: "claude-code",
      status: "starting",
      acpSessionId: null,
      availableCommands: [],
      configOptions: [
        {
          type: "select",
          id: "model",
          name: "Model",
          currentValue: "haiku",
          options: [{ value: "haiku", name: "Haiku" }],
        },
      ],
    });

    const wrapper = mountBar();
    expect(wrapper.find('[data-test="item-model"]').exists()).toBe(false);

    sessionStore.applyProbeUpdate("claude-code", {
      agentId: "claude-code",
      status: "failed",
      acpSessionId: null,
      availableCommands: [],
      configOptions: [
        {
          type: "select",
          id: "model",
          name: "Model",
          currentValue: "haiku",
          options: [{ value: "haiku", name: "Haiku" }],
        },
      ],
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="item-model"]').exists()).toBe(false);
  });

  it("clears draft config options immediately after switching agent", async () => {
    const sessionStore = useSessionStore();
    sessionStore.activeSessionId = null;
    sessionStore.draftAgentId = "claude-code";
    sessionStore.applyProbeUpdate("claude-code", {
      agentId: "claude-code",
      status: "ready",
      acpSessionId: "acp-1",
      availableCommands: [],
      configOptions: [
        {
          type: "select",
          id: "model",
          name: "Model",
          currentValue: "haiku",
          options: [{ value: "haiku", name: "Haiku" }],
        },
      ],
    });
    const wrapper = mountBar();

    expect(wrapper.find('[data-test="item-model"]').exists()).toBe(true);

    sessionStore.draftAgentId = "codex";
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="item-model"]').exists()).toBe(false);
  });

  it("dispatches draft config changes to sessionStore", async () => {
    const sessionStore = useSessionStore();
    const setDraftConfigOption = vi.spyOn(sessionStore, "setDraftConfigOption").mockResolvedValue();
    const chatStore = useChatStore();
    const setConfigOption = vi.spyOn(chatStore, "setConfigOption").mockResolvedValue();
    sessionStore.activeSessionId = null;
    sessionStore.draftAgentId = "claude-code";
    sessionStore.applyProbeUpdate("claude-code", {
      agentId: "claude-code",
      status: "ready",
      acpSessionId: "acp-1",
      availableCommands: [],
      configOptions: [
        {
          type: "select",
          id: "model",
          name: "Model",
          currentValue: "haiku",
          options: [{ value: "sonnet", name: "Sonnet" }],
        },
      ],
    });

    const wrapper = mountBar();
    await wrapper.find('[data-test="item-model"]').trigger("click");

    expect(setDraftConfigOption).toHaveBeenCalledWith({
      agentId: "claude-code",
      configId: "model",
      type: "select",
      value: "sonnet",
    });
    expect(setConfigOption).not.toHaveBeenCalled();
  });

  it("dispatches established session config changes to chatStore", async () => {
    const sessionStore = useSessionStore();
    const chatStore = useChatStore();
    const setConfigOption = vi.spyOn(chatStore, "setConfigOption").mockResolvedValue();
    const setDraftConfigOption = vi.spyOn(sessionStore, "setDraftConfigOption").mockResolvedValue();
    sessionStore.sessions = [
      makeSession({
        configOptions: [
          {
            type: "select",
            id: "model",
            name: "Model",
            currentValue: "haiku",
            options: [{ value: "sonnet", name: "Sonnet" }],
          },
        ],
      }),
    ];
    sessionStore.activeSessionId = "session-1";

    const wrapper = mountBar();
    await wrapper.find('[data-test="item-model"]').trigger("click");

    expect(setConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "model",
      type: "select",
      value: "sonnet",
    });
    expect(setDraftConfigOption).not.toHaveBeenCalled();
  });

  it("does not blank options across the draft → session handoff", async () => {
    const sessionStore = useSessionStore();
    const configOptions = [
      {
        type: "select" as const,
        id: "model",
        name: "Model",
        currentValue: "haiku",
        options: [{ value: "haiku", name: "Haiku" }],
      },
    ];
    sessionStore.activeSessionId = null;
    sessionStore.draftAgentId = "claude-code";
    sessionStore.applyProbeUpdate("claude-code", {
      agentId: "claude-code",
      status: "ready",
      acpSessionId: "acp-1",
      availableCommands: [],
      configOptions,
    });

    const wrapper = mountBar();
    expect(wrapper.find('[data-test="item-model"]').exists()).toBe(true);

    sessionStore.sessions = [makeSession({ configOptions })];
    sessionStore.activeSessionId = "session-1";
    sessionStore.applyProbeUpdate("claude-code", null);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="item-model"]').exists()).toBe(true);
  });
});
