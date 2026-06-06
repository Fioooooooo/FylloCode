import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ChatPromptPanel from "@renderer/components/chat/prompt/ChatPromptPanel.vue";
import type { AcpAvailableCommand, Session } from "@shared/types/chat";
import type { DraftProbeState } from "@renderer/stores/session";

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
  props: ["status", "color", "size", "disabled"],
  emits: ["stop"],
  template:
    '<button data-test="stop-button" type="button" :disabled="disabled" @click="$emit(\'stop\')" />',
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
const createSession = vi.fn();
const refreshCapabilities = vi.fn(() => Promise.resolve());
const getPromptCapabilities = vi.fn();
const saveAttachment = vi.hoisted(() => vi.fn());
const activeSessionRef = ref<Session | null>(null);
const draftAgentIdRef = ref<string | null>("claude-code");
const activeDraftProbeRef = ref<DraftProbeState | null>(null);
const chatStatusRef = ref<"ready" | "submitted" | "streaming" | "error">("ready");
const promptCapabilitiesRef = ref({
  image: true,
  audio: false,
  embeddedContext: true,
});
const createObjectUrl = vi.fn((file: File) => `blob:${file.name}`);
const revokeObjectUrl = vi.fn();

vi.mock("@renderer/stores/chat", () => ({
  useChatStore: () => ({
    sendMessage,
    cancelStream,
  }),
}));

vi.mock("@renderer/api/chat", () => ({
  chatApi: {
    saveAttachment,
  },
}));

vi.mock("@renderer/stores/acp-agents", () => ({
  useAcpAgentsStore: () => ({
    refreshCapabilities,
    getPromptCapabilities,
  }),
}));

vi.mock("@renderer/stores/project", () => ({
  useProjectStore: () => ({
    currentProject: { id: "project-1" },
  }),
}));

vi.mock("@renderer/stores/session", () => ({
  useSessionStore: () => ({
    activeSession: computed(() => activeSessionRef.value),
    draftAgentId: computed(() => draftAgentIdRef.value),
    activeDraftProbe: computed(() => activeDraftProbeRef.value),
    createSession,
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
        activeDraftProbe: computed(() => activeDraftProbeRef.value),
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
          props: ["promptCapabilities"],
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
    activeDraftProbeRef.value = null;
    chatStatusRef.value = "ready";
    sendMessage.mockClear();
    cancelStream.mockClear();
    createSession.mockReset();
    setSessionAgent.mockClear();
    setDraftAgent.mockClear();
    refreshCapabilities.mockClear();
    getPromptCapabilities.mockImplementation(() => promptCapabilitiesRef.value);
    promptCapabilitiesRef.value = {
      image: true,
      audio: false,
      embeddedContext: true,
    };
    saveAttachment.mockReset();
    saveAttachment.mockResolvedValue({
      ok: true,
      data: { uri: "file:///tmp/attachment", name: "attachment", mimeType: "image/png" },
    });
    createSession.mockImplementation(async (input: { projectId: string; agentId: string }) => {
      const session = makeSession();
      session.projectId = input.projectId;
      session.agentId = input.agentId;
      activeSessionRef.value = session;
      return session;
    });
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
    class FileReaderStub {
      result: string | ArrayBuffer | null = null;
      error: Error | null = null;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;

      readAsDataURL(file: File): void {
        this.result = `data:${file.type};base64,ZmFrZQ==`;
        this.onload?.();
      }
    }
    Object.defineProperty(globalThis, "FileReader", {
      configurable: true,
      value: FileReaderStub,
    });
  });

  it("shows the slash button only when commands exist", async () => {
    const wrapper = mountPanel();

    expect(wrapper.find('[data-test="slash-button"]').exists()).toBe(false);

    activeSessionRef.value = makeSession([{ name: "review", description: "Review code" }]);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="slash-button"]').exists()).toBe(true);
  });

  it("shows the slash button in draft state when the ready probe has commands", async () => {
    activeSessionRef.value = null;
    activeDraftProbeRef.value = {
      agentId: "claude-code",
      status: "ready",
      acpSessionId: "acp-1",
      configOptions: [],
      availableCommands: [{ name: "init", description: "Initialize" }],
    };
    const wrapper = mountPanel();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="slash-button"]').exists()).toBe(true);
  });

  it("hides the slash button in draft state when the probe is not ready", async () => {
    activeSessionRef.value = null;
    activeDraftProbeRef.value = {
      agentId: "claude-code",
      status: "starting",
      acpSessionId: null,
      configOptions: [],
      availableCommands: [{ name: "init", description: "Initialize" }],
    };
    const wrapper = mountPanel();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="slash-button"]').exists()).toBe(false);
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
    expect(sendMessage).toHaveBeenCalledWith([{ type: "text", text: "hello world" }]);

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

  it("does not render ChatAgentSelect in footer", () => {
    const wrapper = mountPanel();
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

  it("blocks unsupported image attachments and keeps the prompt content", async () => {
    promptCapabilitiesRef.value = {
      image: false,
      audio: false,
      embeddedContext: true,
    };
    const wrapper = mountPanel();

    await wrapper.get('[data-test="prompt-action-upload-image"]').trigger("click");
    await vi.waitFor(() => {
      expect(saveAttachment).toHaveBeenCalled();
    });
    await wrapper.get("textarea").setValue("see image");
    await wrapper.get('[data-test="prompt-submit"]').trigger("click");

    expect(sendMessage).not.toHaveBeenCalled();
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("see image");
  });

  it("assembles text first and then attachment parts", async () => {
    activeSessionRef.value = makeSession();
    saveAttachment.mockResolvedValueOnce({
      ok: true,
      data: { uri: "file:///tmp/diagram.png", name: "diagram.png", mimeType: "image/png" },
    });
    saveAttachment.mockResolvedValueOnce({
      ok: true,
      data: { uri: "file:///tmp/notes.md", name: "notes.md", mimeType: "text/markdown" },
    });
    const wrapper = mountPanel();

    await wrapper.get('[data-test="prompt-action-upload-image"]').trigger("click");
    await wrapper.get('[data-test="prompt-action-upload-file"]').trigger("click");
    await vi.waitFor(() => {
      expect(saveAttachment).toHaveBeenCalledTimes(2);
    });
    await wrapper.get("textarea").setValue("");
    await wrapper.get('[data-test="prompt-submit"]').trigger("click");

    expect(sendMessage).toHaveBeenCalledWith([
      { type: "text", text: "" },
      {
        type: "image",
        mediaType: "image/png",
        uri: "file:///tmp/diagram.png",
        filename: "diagram.png",
      },
      {
        type: "resource_link",
        mediaType: "text/markdown",
        uri: "file:///tmp/notes.md",
        filename: "notes.md",
      },
    ]);
  });

  it("disables audio when unsupported and shows placeholder toast when enabled", async () => {
    const wrapper = mountPanel();
    expect(wrapper.get('button[aria-label="语音输入"]').attributes("disabled")).toBeDefined();

    promptCapabilitiesRef.value = {
      image: true,
      audio: true,
      embeddedContext: true,
    };
    await wrapper.vm.$nextTick();
    await wrapper.get('button[aria-label="语音输入"]').trigger("click");

    const { useToast } = await import("@nuxt/ui/composables");
    expect(useToast().add).toHaveBeenCalledWith({ title: "即将开放", color: "info" });
  });
});
