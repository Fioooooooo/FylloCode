import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, nextTick } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { useChatStore } from "@renderer/stores/session/chat";
import { useSessionStore } from "@renderer/stores/session/session";
import ConfigOptionsBar from "@renderer/components/chat/prompt/ConfigOptionsBar.vue";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import type { Session } from "@shared/types/chat";

interface TestMenuItem {
  type?: string;
  slot?: string;
  label: string;
  description?: string;
  active?: boolean;
  checked?: boolean;
  disabled?: boolean;
  loading?: boolean;
  children?: TestMenuItem[];
  onSelect?: () => void;
  onUpdateChecked?: (checked: boolean) => void;
}

const DropdownMenuStub = defineComponent({
  name: "DropdownMenuStub",
  props: {
    items: {
      type: Array,
      default: () => [],
    },
  },
  template: `
    <div data-test="config-dropdown">
      <slot />
      <template v-for="item in items" :key="item.label">
        <template v-for="child in item.children || []" :key="child.label">
          <div v-if="child.slot" :data-test="\`menu-description-\${child.label}\`">
            <slot :name="\`\${child.slot}-description\`" :item="child" />
          </div>
        </template>
      </template>
    </div>
  `,
});

const TransitionStub = {
  template: "<div><slot /></div>",
};

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    workspaceId: "project-1",
    agentId: "claude-code",
    sessionMode: "fyllocode",
    title: "Session",
    status: "running",
    turnCount: 1,
    tokenUsage: { used: 0, size: 0 },
    createdAt: new Date(),
    updatedAt: new Date(),
    messages: [],
    ...overrides,
    isPinned: overrides.isPinned ?? false,
  };
}

function mountBar(): ReturnType<typeof mount> {
  return mount(ConfigOptionsBar, {
    global: {
      stubs: {
        Transition: TransitionStub,
        UDropdownMenu: DropdownMenuStub,
        DropdownMenu: DropdownMenuStub,
      },
    },
  });
}

function mountBarWithTooltipContent(): ReturnType<typeof mount> {
  const TooltipWithContent = {
    template:
      '<span data-test="tooltip"><slot /><span data-test="tooltip-content"><slot name="content" /></span></span>',
  };

  return mount(ConfigOptionsBar, {
    global: {
      stubs: {
        Transition: TransitionStub,
        UDropdownMenu: DropdownMenuStub,
        DropdownMenu: DropdownMenuStub,
        UTooltip: TooltipWithContent,
        Tooltip: TooltipWithContent,
      },
    },
  });
}

function setSessionOptions(options: AcpSessionConfigOption[]): void {
  const sessionStore = useSessionStore();
  sessionStore.sessions = [makeSession({ configOptions: options })];
  sessionStore.activeSessionId = "session-1";
}

function getMenuItems(wrapper: ReturnType<typeof mount>): TestMenuItem[] {
  return wrapper.getComponent(DropdownMenuStub).props("items") as TestMenuItem[];
}

function modelOption(
  id: string,
  currentValue: string,
  values: Array<{ value: string; name: string; description?: string }>
): AcpSessionConfigOption {
  return {
    type: "select",
    id,
    name: `Model ${id}`,
    category: "model",
    currentValue,
    options: values,
  };
}

function thoughtOption(id: string, currentValue: string, name: string): AcpSessionConfigOption {
  return {
    type: "select",
    id,
    name: `Thought ${id}`,
    category: "thought_level",
    currentValue,
    options: [{ value: currentValue, name }],
  };
}

describe("ConfigOptionsBar", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("renders one trigger for any number of visible options", () => {
    setSessionOptions([
      modelOption("model", "gpt", [{ value: "gpt", name: "GPT-5.5" }]),
      thoughtOption("thought", "high", "High"),
      {
        type: "boolean",
        id: "stream",
        name: "Stream",
        category: "_custom",
        currentValue: true,
      },
    ]);

    const wrapper = mountBar();

    expect(wrapper.findAll('[data-test="config-options-trigger"]')).toHaveLength(1);
    expect(wrapper.findAllComponents(DropdownMenuStub)).toHaveLength(1);
    expect(getMenuItems(wrapper).map((item) => item.label)).toEqual([
      "Model model",
      "Thought thought",
      "Stream",
    ]);
  });

  it("shows the complete summary without a maximum width or truncation", () => {
    setSessionOptions([
      modelOption("model", "long", [
        { value: "long", name: "A model name that should remain fully visible" },
      ]),
      thoughtOption("thought", "high", "High"),
    ]);

    const wrapper = mountBar();
    const trigger = wrapper.get('[data-test="config-options-trigger"]');

    expect(trigger.text()).toBe("A model name that should remain fully visible · High");
    expect(trigger.classes()).not.toContain("max-w-56");
    expect(trigger.get("span").classes()).not.toContain("truncate");
  });

  it.each([
    ["empty", []],
    [
      "mode only",
      [
        {
          type: "select" as const,
          id: "mode",
          name: "Mode",
          category: "mode",
          currentValue: "plan",
          options: [{ value: "plan", name: "Plan" }],
        },
      ],
    ],
  ])("hides the trigger when options are %s", (_label, options) => {
    setSessionOptions(options);

    const wrapper = mountBar();

    expect(wrapper.find('[data-test="config-options-trigger"]').exists()).toBe(false);
    expect(wrapper.findComponent(DropdownMenuStub).exists()).toBe(false);
  });

  it("keeps Agent order while filtering mode", () => {
    setSessionOptions([
      thoughtOption("thought", "high", "High"),
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
      modelOption("model", "gpt", [{ value: "gpt", name: "GPT-5.5" }]),
    ]);

    const wrapper = mountBar();

    expect(getMenuItems(wrapper).map((item) => item.label)).toEqual([
      "Thought thought",
      "Extra",
      "Model model",
    ]);
  });

  it.each([
    [
      "model and thought level",
      [
        thoughtOption("thought", "high", "High"),
        modelOption("model", "gpt", [{ value: "gpt", name: "GPT-5.5" }]),
      ],
      "GPT-5.5 · High",
    ],
    ["one summary category", [thoughtOption("thought", "high", "High")], "High"],
    [
      "no summary category",
      [
        {
          type: "boolean" as const,
          id: "stream",
          name: "Stream",
          category: "_custom",
          currentValue: true,
        },
      ],
      "Config",
    ],
    [
      "duplicate categories",
      [
        modelOption("model-first", "first", [{ value: "first", name: "First" }]),
        modelOption("model-second", "second", [{ value: "second", name: "Second" }]),
        thoughtOption("thought-first", "low", "Low"),
        thoughtOption("thought-second", "high", "High"),
      ],
      "First · Low",
    ],
    [
      "unmatched raw values",
      [
        modelOption("model", "raw-model", [{ value: "known", name: "Known" }]),
        {
          type: "select" as const,
          id: "thought",
          name: "Thought",
          category: "thought_level",
          currentValue: "raw-thought",
          options: [{ value: "known", name: "Known" }],
        },
      ],
      "raw-model · raw-thought",
    ],
  ])("builds the trigger summary for %s", (_label, options, expected) => {
    setSessionOptions(options);

    const wrapper = mountBar();
    const trigger = wrapper.get('[data-test="config-options-trigger"]');

    expect(trigger.text()).toBe(expected);
    expect(trigger.attributes("aria-label")).toBe(`Config: ${expected}`);
  });

  it("projects flat and grouped selects plus boolean into one menu", () => {
    setSessionOptions([
      {
        ...modelOption("model", "sonnet", [
          { value: "sonnet", name: "Sonnet", description: "Fast and capable" },
          { value: "haiku", name: "Haiku" },
        ]),
        description: "Choose a model",
      },
      {
        type: "select",
        id: "profile",
        name: "Profile",
        category: "_custom",
        currentValue: "balanced",
        options: [
          {
            group: "built-in",
            name: "Built in",
            options: [
              { value: "fast", name: "Fast" },
              { value: "balanced", name: "Balanced", description: "Default profile" },
            ],
          },
        ],
      },
      {
        type: "boolean",
        id: "stream",
        name: "Stream",
        description: "Stream intermediate output",
        currentValue: false,
      },
    ]);

    const wrapper = mountBar();
    const [model, profile, stream] = getMenuItems(wrapper);

    expect(model).toMatchObject({
      label: "Model model",
      description: "Sonnet",
    });
    expect(model.children).toMatchObject([
      { label: "Sonnet", description: "Fast and capable", active: true },
      { label: "Haiku", active: false },
    ]);
    expect(profile.children).toMatchObject([
      { label: "Built in", type: "label" },
      { label: "Fast", active: false },
      { label: "Balanced", description: "Default profile", active: true },
    ]);
    expect(stream).toMatchObject({
      type: "checkbox",
      label: "Stream",
      description: "Stream intermediate output",
      checked: false,
    });
    expect(stream.children).toBeUndefined();
  });

  it("keeps value descriptions on one line and reveals the full text in a tooltip", () => {
    const fullDescription =
      "A long description that remains available in full when the value description is hovered";
    setSessionOptions([
      modelOption("model", "sonnet", [
        { value: "sonnet", name: "Sonnet", description: fullDescription },
      ]),
    ]);

    const wrapper = mountBarWithTooltipContent();
    const description = wrapper.get('[data-test="menu-description-Sonnet"]');

    expect(description.get("span.block.truncate").text()).toBe(fullDescription);
    const tooltipContent = description.get('[data-test="tooltip-content"] span');
    expect(tooltipContent.text()).toBe(fullDescription);
    expect(tooltipContent.classes()).toEqual(
      expect.arrayContaining(["whitespace-normal", "break-words"])
    );
    expect(getMenuItems(wrapper)[0].children?.[0].slot).toBe("config-value");
  });

  it("disables and loads only the pending option", () => {
    setSessionOptions([
      modelOption("model", "gpt", [{ value: "gpt", name: "GPT-5.5" }]),
      thoughtOption("thought", "high", "High"),
    ]);
    useChatStore().markConfigOptionPending("model");

    const wrapper = mountBar();
    const [model, thought] = getMenuItems(wrapper);

    expect(model).toMatchObject({ disabled: true, loading: true });
    expect(thought.disabled).toBe(false);
    expect(thought.loading).toBe(false);
  });

  it("dispatches draft select changes to the session store", async () => {
    const sessionStore = useSessionStore();
    const chatStore = useChatStore();
    const setDraftConfigOption = vi.spyOn(sessionStore, "setDraftConfigOption").mockResolvedValue();
    const setConfigOption = vi.spyOn(chatStore, "setConfigOption").mockResolvedValue();
    sessionStore.activeSessionId = null;
    sessionStore.draftAgentId = "claude-code";
    sessionStore.applyProbeUpdate("claude-code", {
      agentId: "claude-code",
      sessionMode: "fyllocode",
      status: "ready",
      fylloSessionId: "session-probe",
      acpSessionId: "acp-1",
      availableCommands: [],
      configOptions: [
        modelOption("model", "haiku", [
          { value: "haiku", name: "Haiku" },
          { value: "sonnet", name: "Sonnet" },
        ]),
      ],
    });

    const wrapper = mountBar();
    getMenuItems(wrapper)[0].children?.[1].onSelect?.();
    await flushPromises();

    expect(setDraftConfigOption).toHaveBeenCalledWith({
      agentId: "claude-code",
      configId: "model",
      type: "select",
      value: "sonnet",
    });
    expect(setConfigOption).not.toHaveBeenCalled();
  });

  it("dispatches established boolean changes to the chat store", async () => {
    const sessionStore = useSessionStore();
    const chatStore = useChatStore();
    const setConfigOption = vi.spyOn(chatStore, "setConfigOption").mockResolvedValue();
    const setDraftConfigOption = vi.spyOn(sessionStore, "setDraftConfigOption").mockResolvedValue();
    setSessionOptions([
      {
        type: "boolean",
        id: "stream",
        name: "Stream",
        currentValue: false,
      },
    ]);

    const wrapper = mountBar();
    getMenuItems(wrapper)[0].onUpdateChecked?.(true);
    await flushPromises();

    expect(setConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "stream",
      type: "boolean",
      value: true,
    });
    expect(setDraftConfigOption).not.toHaveBeenCalled();
  });

  it("keeps the menu through draft handoff and rebuilds it from the session snapshot", async () => {
    const sessionStore = useSessionStore();
    sessionStore.activeSessionId = null;
    sessionStore.draftAgentId = "claude-code";
    sessionStore.applyProbeUpdate("claude-code", {
      agentId: "claude-code",
      sessionMode: "fyllocode",
      status: "ready",
      fylloSessionId: "session-probe",
      acpSessionId: "acp-1",
      availableCommands: [],
      configOptions: [
        modelOption("model", "haiku", [{ value: "haiku", name: "Haiku" }]),
        thoughtOption("thought", "low", "Low"),
      ],
    });

    const wrapper = mountBar();
    expect(wrapper.get('[data-test="config-options-trigger"]').text()).toBe("Haiku · Low");

    sessionStore.sessions = [
      makeSession({
        configOptions: [
          modelOption("model", "sonnet", [{ value: "sonnet", name: "Sonnet" }]),
          {
            type: "select",
            id: "thought",
            name: "Thought",
            category: "thought_level",
            currentValue: "high",
            options: [
              { value: "medium", name: "Medium" },
              { value: "high", name: "High" },
            ],
          },
          {
            type: "boolean",
            id: "stream",
            name: "Stream",
            currentValue: true,
          },
        ],
      }),
    ];
    sessionStore.activeSessionId = "session-1";
    sessionStore.applyProbeUpdate("claude-code", null);
    await nextTick();

    expect(wrapper.get('[data-test="config-options-trigger"]').text()).toBe("Sonnet · High");
    expect(getMenuItems(wrapper).map((item) => item.label)).toEqual([
      "Model model",
      "Thought",
      "Stream",
    ]);
    expect(getMenuItems(wrapper)[1].children).toMatchObject([
      { label: "Medium", active: false },
      { label: "High", active: true },
    ]);
    expect(getMenuItems(wrapper)[2]).toMatchObject({ type: "checkbox", checked: true });
  });
});
