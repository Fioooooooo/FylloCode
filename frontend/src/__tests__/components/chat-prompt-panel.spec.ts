import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ChatPromptPanel from "@renderer/components/chat/prompt/ChatPromptPanel.vue";
import type { AcpAvailableCommand, Session } from "@shared/types/chat";

const buttonStub = {
  inheritAttrs: false,
  props: ["loading", "icon", "color", "variant", "size", "disabled"],
  emits: ["click"],
  template:
    '<button v-bind="$attrs" :data-color="color || \'neutral\'" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
};

const chatPromptStub = {
  props: ["modelValue", "placeholder", "variant", "ui"],
  emits: ["submit", "update:modelValue"],
  template: `
    <div>
      <slot name="header" />
      <textarea
        :value="modelValue"
        :placeholder="placeholder"
        @input="$emit('update:modelValue', $event.target.value)"
      />
      <button data-test="prompt-submit" type="button" @click="$emit('submit')" />
      <slot name="footer" />
    </div>
  `,
};

const promptSubmitStub = {
  props: ["status", "color", "size"],
  emits: ["stop"],
  template: '<button data-test="stop-button" type="button" @click="$emit(\'stop\')" />',
};

const slashCommandStub = {
  props: ["commands", "open", "searchTerm"],
  emits: ["button-trigger", "select", "update:open", "update:searchTerm"],
  template: `
    <div>
      <button
        v-if="commands.length > 0"
        data-test="slash-button"
        type="button"
        @click="$emit('button-trigger')"
      />
      <div v-if="open" data-test="slash-menu">
        <button
          v-for="command in commands"
          :key="command.name"
          type="button"
          @click="$emit('select', command)"
        >
          /{{ command.name }}
        </button>
      </div>
    </div>
  `,
};

const sendMessage = vi.fn(async () => undefined);
const cancelStream = vi.fn();
const setSessionAgent = vi.fn(() => Promise.resolve());
const setDraftAgent = vi.fn();
const activeSessionRef = ref<Session | null>(null);
const draftAgentIdRef = ref<string | null>("claude-code");
const chatStatusRef = ref<"ready" | "submitted" | "streaming" | "error">("ready");
const createObjectUrl = vi.fn((file: File) => `blob:${file.name}`);
const revokeObjectUrl = vi.fn();

vi.mock("@renderer/stores/chat", () => ({
  useChatStore: () => ({
    sendMessage,
    cancelStream,
  }),
}));

vi.mock("@renderer/stores/session", () => ({
  useSessionStore: () => ({
    activeSession: computed(() => activeSessionRef.value),
    draftAgentId: computed(() => draftAgentIdRef.value),
    setSessionAgent,
    setDraftAgent,
  }),
}));

vi.mock("pinia", async (importOriginal) => {
  const actual = await importOriginal<typeof import("pinia")>();
  return {
    ...actual,
    storeToRefs: (store: Record<string, unknown>) => {
      void store;
      return {
        chatStatus: computed(() => chatStatusRef.value),
        activeSession: computed(() => activeSessionRef.value),
        draftAgentId: computed(() => draftAgentIdRef.value),
      };
    },
  };
});

function makeSession(commands: AcpAvailableCommand[] = []): Session {
  return {
    id: "session-1",
    projectId: "project-1",
    agentId: "claude-code",
    title: "Session",
    status: "ended",
    turnCount: 0,
    tokenUsage: { used: 128, size: 1024 },
    createdAt: new Date("2026-05-12T00:00:00.000Z"),
    updatedAt: new Date("2026-05-12T00:00:00.000Z"),
    messages: [],
    availableCommands: commands,
  };
}

function mountPanel(): VueWrapper {
  return mount(ChatPromptPanel, {
    global: {
      plugins: [createPinia()],
      stubs: {
        UButton: buttonStub,
        UChatPrompt: chatPromptStub,
        ChatPrompt: chatPromptStub,
        UChatPromptSubmit: promptSubmitStub,
        ChatPromptSubmit: promptSubmitStub,
        SlashCommand: slashCommandStub,
        ChatAgentSelect: {
          props: ["modelValue"],
          emits: ["update:modelValue"],
          template: '<div data-test="agent-select">{{ modelValue ?? "none" }}</div>',
        },
        AttachmentList: {
          props: ["attachments"],
          emits: ["remove"],
          template: `
            <div data-test="attachments">
              <span data-test="attachment-count">{{ attachments.length }}</span>
              <button
                v-if="attachments.length > 0"
                data-test="attachment-remove"
                type="button"
                @click="$emit('remove', attachments[0].id)"
              />
            </div>
          `,
        },
        PromptActionMenu: {
          emits: ["select-files"],
          template: `
            <div>
              <button data-test="prompt-action-menu" type="button" />
              <button
                data-test="prompt-action-upload-image"
                type="button"
                @click="$emit('select-files', [{ name: 'diagram.png', type: 'image/png', size: 24576 }])"
              />
              <button
                data-test="prompt-action-upload-file"
                type="button"
                @click="$emit('select-files', [{ name: 'notes.md', type: 'text/markdown', size: 2048 }])"
              />
            </div>
          `,
        },
        ContextUsageRing: { template: '<div data-test="usage-ring"></div>' },
      },
    },
  });
}

describe("ChatPromptPanel", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    activeSessionRef.value = null;
    draftAgentIdRef.value = "claude-code";
    chatStatusRef.value = "ready";
    sendMessage.mockClear();
    cancelStream.mockClear();
    setSessionAgent.mockClear();
    setDraftAgent.mockClear();
    createObjectUrl.mockClear();
    revokeObjectUrl.mockClear();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });
  });

  it("shows the slash button only when commands exist", async () => {
    const wrapper = mountPanel();

    expect(wrapper.find('[data-test="slash-button"]').exists()).toBe(false);

    activeSessionRef.value = makeSession([{ name: "review", description: "Review code" }]);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="slash-button"]').exists()).toBe(true);
  });

  it("updates menu items when available commands change in the active session", async () => {
    activeSessionRef.value = makeSession([{ name: "review", description: "Review code" }]);
    const wrapper = mountPanel();

    await wrapper.get('[data-test="slash-button"]').trigger("click");
    expect(wrapper.text()).toContain("/review");

    activeSessionRef.value = makeSession([{ name: "plan", description: "Create a plan" }]);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain("/plan");
    expect(wrapper.text()).not.toContain("/review");
  });

  it("emits submit and stop through the prompt shell", async () => {
    const wrapper = mountPanel();
    const textarea = wrapper.get("textarea");

    await textarea.setValue("hello world");
    await wrapper.get('[data-test="prompt-submit"]').trigger("click");
    await wrapper.vm.$nextTick();
    expect(sendMessage).toHaveBeenCalledWith("hello world");

    await wrapper.get('[data-test="stop-button"]').trigger("click");
    expect(cancelStream).toHaveBeenCalledTimes(1);
  });

  it("opens the menu on slash only at line start and never calls preventDefault", async () => {
    const cases = [
      { value: "", cursor: 0, shouldOpen: true },
      { value: "hello", cursor: 5, shouldOpen: false },
      { value: "hello\n", cursor: 6, shouldOpen: true },
      { value: "hello", cursor: 0, shouldOpen: true },
    ];

    for (const testCase of cases) {
      activeSessionRef.value = makeSession([{ name: "review", description: "Review code" }]);
      const wrapper = mountPanel();
      const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;

      textarea.value = testCase.value;
      textarea.setSelectionRange(testCase.cursor, testCase.cursor);

      const preventDefault = vi.fn();
      const keydown = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true });
      Object.defineProperty(keydown, "target", { value: textarea });
      keydown.preventDefault = preventDefault;
      textarea.dispatchEvent(keydown);
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      expect(preventDefault).not.toHaveBeenCalled();
      expect(wrapper.find('[data-test="slash-menu"]').exists()).toBe(testCase.shouldOpen);
    }
  });

  it("shows context usage only when token usage is provided", async () => {
    const wrapper = mountPanel();
    expect(wrapper.find('[data-test="usage-ring"]').exists()).toBe(false);

    activeSessionRef.value = makeSession();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="usage-ring"]').exists()).toBe(true);
  });

  it("hides the agent selector when the agent is locked", async () => {
    const wrapper = mountPanel();
    expect(wrapper.find('[data-test="agent-select"]').exists()).toBe(true);
    expect(wrapper.get('[data-test="agent-select"]').text()).toContain("claude-code");

    const session = makeSession();
    session.messages = [{} as Session["messages"][number]];
    activeSessionRef.value = session;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="agent-select"]').exists()).toBe(false);
  });

  it("adds image and file attachments from separate prompt action entries", async () => {
    const wrapper = mountPanel();

    expect(wrapper.find('[data-test="attachment-count"]').exists()).toBe(false);

    await wrapper.get('[data-test="prompt-action-upload-image"]').trigger("click");
    await wrapper.vm.$nextTick();

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(createObjectUrl).toHaveBeenCalledWith(expect.objectContaining({ name: "diagram.png" }));
    expect(wrapper.get('[data-test="attachment-count"]').text()).toBe("1");

    await wrapper.get('[data-test="prompt-action-upload-file"]').trigger("click");
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[data-test="attachment-count"]').text()).toBe("2");
  });

  it("removes attachments and revokes image previews", async () => {
    const wrapper = mountPanel();

    await wrapper.get('[data-test="prompt-action-upload-image"]').trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-test="attachment-count"]').text()).toBe("1");

    await wrapper.get('[data-test="attachment-remove"]').trigger("click");
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="attachment-count"]').exists()).toBe(false);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:diagram.png");
  });
});
