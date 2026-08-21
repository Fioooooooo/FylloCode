import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { useToast } from "@nuxt/ui/composables";
import ChatPromptPanel from "@renderer/components/chat/prompt/ChatPromptPanel.vue";
import type { AcpAvailableCommand, Session } from "@shared/types/chat";
import type { ChatSessionMode } from "@shared/types/chat";
import type { ChatPromptPart } from "@shared/types/chat-prompt";
import type { DraftProbeState } from "@renderer/stores/session/session";

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
      <div v-if="open" data-test="slash-menu" :data-search-term="searchTerm">
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

const sendMessage = vi.fn<
  (
    parts: ChatPromptPart[],
    options?: {
      materializeAttachments?: (target: {
        workspaceId: string;
        sessionId: string;
      }) => Promise<ChatPromptPart[]>;
    }
  ) => Promise<boolean>
>();
const cancelStream = vi.fn();
const setSessionAgent = vi.fn(() => Promise.resolve());
const setDraftAgent = vi.fn();
const setDraftSessionMode = vi.fn((sessionMode: ChatSessionMode) => {
  draftSessionModeRef.value = sessionMode;
});
const createSession = vi.fn();
const refreshCapabilities = vi.fn(() => Promise.resolve());
const getPromptCapabilities = vi.fn();
const saveAttachment = vi.hoisted(() => vi.fn());
const activeSessionRef = ref<Session | null>(null);
const draftAgentIdRef = ref<string | null>("claude-code");
const draftSessionModeRef = ref<ChatSessionMode>("fyllocode");
const activeDraftProbeRef = ref<DraftProbeState | null>(null);
const chatStatusRef = ref<"ready" | "submitted" | "streaming" | "error">("ready");
const promptCapabilitiesRef = ref({
  image: true,
  audio: false,
  embeddedContext: true,
});
const createObjectUrl = vi.fn((file: File) => `blob:${file.name}`);
const revokeObjectUrl = vi.fn();
const toast = useToast();
const toastAdd = vi.mocked(toast.add);

vi.mock("@renderer/stores/session/chat", () => ({
  useChatStore: () => ({
    sendMessage,
    cancelStream,
  }),
}));

vi.mock("@renderer/api/session/chat", () => ({
  chatApi: {
    saveAttachment,
  },
}));

vi.mock("@renderer/stores/platform/acp-agents", () => ({
  useAcpAgentsStore: () => ({
    refreshCapabilities,
    getPromptCapabilities,
  }),
}));

vi.mock("@renderer/stores/workspace/workspace", () => ({
  useWorkspaceStore: () => ({
    currentWorkspace: { id: "project-1" },
  }),
}));

vi.mock("@renderer/stores/session/session", () => ({
  useSessionStore: () => ({
    activeSession: computed(() => activeSessionRef.value),
    draftAgentId: computed(() => draftAgentIdRef.value),
    draftSessionMode: draftSessionModeRef,
    activeDraftProbe: computed(() => activeDraftProbeRef.value),
    createSession,
    setSessionAgent,
    setDraftAgent,
    setDraftSessionMode,
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
        draftSessionMode: draftSessionModeRef,
        activeDraftProbe: computed(() => activeDraftProbeRef.value),
      };
    },
  };
});

function makeSession(commands: AcpAvailableCommand[] = []): Session {
  return {
    id: "session-1",
    workspaceId: "project-1",
    agentId: "claude-code",
    sessionMode: "fyllocode",
    title: "Session",
    isPinned: false,
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
        SlashCommandMenu: slashCommandStub,
        SessionModeTabs: {
          props: ["modelValue"],
          emits: ["update:modelValue"],
          template:
            '<button data-test="session-mode-tabs" type="button" :data-mode="modelValue" @click="$emit(\'update:modelValue\', \'native\')">{{ modelValue }}</button>',
        },
        AttachmentList: {
          props: ["attachments"],
          emits: ["remove"],
          template: `
            <div data-test="attachments">
              <span data-test="attachment-count">{{ attachments.length }}</span>
              <span
                v-for="attachment in attachments"
                :key="attachment.id"
                data-test="attachment-name"
              >{{ attachment.name }}</span>
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
                @click="$emit('select-files', { files: [{ name: 'diagram.png', type: 'image/png', size: 24576 }] })"
              />
              <button
                data-test="prompt-action-upload-file"
                type="button"
                @click="$emit('select-files', { files: [{ name: 'notes.md', type: 'text/markdown', size: 2048 }] })"
              />
              <button
                data-test="prompt-action-upload-multiple"
                type="button"
                @click="$emit('select-files', { files: [
                  { name: 'diagram.png', type: 'image/png', size: 24576 },
                  { name: 'notes.md', type: 'text/markdown', size: 2048 }
                ] })"
              />
            </div>
          `,
        },
        ContextUsageRing: { template: '<div data-test="usage-ring"></div>' },
      },
    },
  });
}

type ClipboardDataItemStub = {
  kind: string;
  getAsFile: () => File | null;
};

type DataTransferItemStub = ClipboardDataItemStub & {
  webkitGetAsEntry?: () => { isDirectory?: boolean } | null;
};

function makeFile(name: string, type: string, size = 1024): File {
  return { name, type, size } as File;
}

function makeClipboardEvent(items: ClipboardDataItemStub[], text = ""): Event {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    configurable: true,
    value: {
      items,
      getData: (format: string) => (format === "text/plain" ? text : ""),
    },
  });
  return event;
}

function dispatchPaste(
  wrapper: VueWrapper,
  items: ClipboardDataItemStub[],
  text = ""
): { event: Event; preventDefault: ReturnType<typeof vi.fn> } {
  const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;
  const event = makeClipboardEvent(items, text);
  const originalPreventDefault = event.preventDefault.bind(event);
  const preventDefault = vi.fn(() => originalPreventDefault());
  event.preventDefault = preventDefault;
  textarea.dispatchEvent(event);

  if (!event.defaultPrevented && text.length > 0) {
    textarea.value += text;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  return { event, preventDefault };
}

function makeDataTransfer(items: DataTransferItemStub[]): DataTransfer {
  const hasFiles = items.some((item) => item.kind === "file");
  return {
    types: hasFiles ? ["Files"] : ["text/plain"],
    items,
  } as unknown as DataTransfer;
}

function dispatchSurfaceEvent(
  wrapper: VueWrapper,
  eventName: string,
  dataTransfer: DataTransfer
): { event: Event; preventDefault: ReturnType<typeof vi.fn> } {
  const event = new Event(eventName, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    configurable: true,
    value: dataTransfer,
  });
  const originalPreventDefault = event.preventDefault.bind(event);
  const preventDefault = vi.fn(() => originalPreventDefault());
  event.preventDefault = preventDefault;
  wrapper.get("textarea").element.dispatchEvent(event);
  return { event, preventDefault };
}

describe("ChatPromptPanel", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    activeSessionRef.value = null;
    draftAgentIdRef.value = "claude-code";
    draftSessionModeRef.value = "fyllocode";
    activeDraftProbeRef.value = null;
    chatStatusRef.value = "ready";
    sendMessage.mockClear();
    setDraftSessionMode.mockClear();
    sendMessage.mockResolvedValue(true);
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
    toastAdd.mockClear();
    saveAttachment.mockResolvedValue({
      ok: true,
      data: {
        attachmentId: "11111111-1111-4111-8111-111111111111",
        name: "attachment",
        mimeType: "image/png",
      },
    });
    createSession.mockImplementation(async (input: { workspaceId: string; agentId: string }) => {
      const session = makeSession();
      session.workspaceId = input.workspaceId;
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

  it("shows mode tabs only for drafts and forwards the selected mode", async () => {
    const wrapper = mountPanel();

    expect(wrapper.get('[data-test="session-mode-tabs"]').attributes("data-mode")).toBe(
      "fyllocode"
    );
    await wrapper.get('[data-test="session-mode-tabs"]').trigger("click");
    expect(setDraftSessionMode).toHaveBeenCalledWith("native");
    expect(draftSessionModeRef.value).toBe("native");

    activeSessionRef.value = makeSession();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="session-mode-tabs"]').exists()).toBe(false);
  });

  it("shows the slash button in draft state when the ready probe has commands", async () => {
    activeSessionRef.value = null;
    activeDraftProbeRef.value = {
      agentId: "claude-code",
      sessionMode: "fyllocode",
      status: "ready",
      fylloSessionId: "session-probe",
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
      sessionMode: "fyllocode",
      status: "starting",
      fylloSessionId: null,
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
    expect(sendMessage).toHaveBeenCalledWith(
      [{ type: "text", text: "hello world" }],
      expect.objectContaining({ materializeAttachments: expect.any(Function) })
    );

    await textarea.setValue("next message");
    await wrapper.get('[data-test="stop-button"]').trigger("click");
    expect(cancelStream).toHaveBeenCalledTimes(1);
  });

  it("opens the menu on slash input only at line start and never calls preventDefault", async () => {
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

      expect(preventDefault).not.toHaveBeenCalled();
      expect(wrapper.find('[data-test="slash-menu"]').exists()).toBe(false);

      textarea.value =
        testCase.value.slice(0, testCase.cursor) + "/" + testCase.value.slice(testCase.cursor);
      textarea.setSelectionRange(testCase.cursor + 1, testCase.cursor + 1);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-test="slash-menu"]').exists()).toBe(testCase.shouldOpen);
      if (testCase.shouldOpen) {
        expect(wrapper.get('[data-test="slash-menu"]').attributes("data-search-term")).toBe("");
      }

      const keyup = new KeyboardEvent("keyup", { key: "/", bubbles: true, cancelable: true });
      Object.defineProperty(keyup, "target", { value: textarea });
      textarea.dispatchEvent(keyup);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-test="slash-menu"]').exists()).toBe(testCase.shouldOpen);
      if (testCase.shouldOpen) {
        expect(wrapper.get('[data-test="slash-menu"]').attributes("data-search-term")).toBe("");
      }
    }
  });

  it("inserts a command from the slash trigger and preserves hint placeholder behavior", async () => {
    activeSessionRef.value = makeSession([
      { name: "review", description: "Review code", hint: "[path]" },
    ]);
    const wrapper = mountPanel();
    const textareaWrapper = wrapper.get("textarea");
    const textarea = textareaWrapper.element as HTMLTextAreaElement;

    textarea.value = "";
    textarea.setSelectionRange(0, 0);
    const keydown = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true });
    Object.defineProperty(keydown, "target", { value: textarea });
    textarea.dispatchEvent(keydown);
    textarea.value = "/";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.setSelectionRange(1, 1);
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[data-test="slash-menu"]').attributes("data-search-term")).toBe("");

    await wrapper.get('[data-test="slash-menu"] button').trigger("click");
    await wrapper.vm.$nextTick();

    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("/review ");
    expect(wrapper.get("textarea").attributes("placeholder")).toBe("[path]");

    await wrapper.get("textarea").setValue("/review now");
    expect(wrapper.get("textarea").attributes("placeholder")).toBeUndefined();
  });

  it("inserts a command from the slash button without changing spacing semantics", async () => {
    activeSessionRef.value = makeSession([{ name: "plan", description: "Create a plan" }]);
    const wrapper = mountPanel();
    const textareaWrapper = wrapper.get("textarea");
    const textarea = textareaWrapper.element as HTMLTextAreaElement;

    await textareaWrapper.setValue("hello");
    textarea.setSelectionRange(5, 5);
    await wrapper.get('[data-test="slash-button"]').trigger("click");
    await wrapper.get('[data-test="slash-menu"] button').trigger("click");
    await wrapper.vm.$nextTick();

    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("hello /plan ");
    expect(wrapper.find('[data-test="slash-menu"]').exists()).toBe(false);
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

  it("accepts a pure image paste without preventing the paste default", async () => {
    const wrapper = mountPanel();
    const image = makeFile("pasted.png", "image/png", 4096);

    const { event, preventDefault } = dispatchPaste(wrapper, [
      { kind: "file", getAsFile: () => image },
    ]);
    await wrapper.vm.$nextTick();

    expect(preventDefault).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.get('[data-test="attachment-count"]').text()).toBe("1");
    expect(wrapper.get('[data-test="attachment-name"]').text()).toBe("pasted.png");
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("");
  });

  it("keeps text when a supported image is pasted with text", async () => {
    const wrapper = mountPanel();
    const image = makeFile("mixed.png", "image/png");

    const { event, preventDefault } = dispatchPaste(
      wrapper,
      [
        { kind: "string", getAsFile: () => null },
        { kind: "file", getAsFile: () => image },
      ],
      "review this"
    );
    if (!event.defaultPrevented) {
      await wrapper.get("textarea").setValue("review this");
    }
    await wrapper.vm.$nextTick();

    expect(preventDefault).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("review this");
    expect(wrapper.get('[data-test="attachment-name"]').text()).toBe("mixed.png");
  });

  it("rejects an unsupported pasted image once while keeping mixed text", async () => {
    promptCapabilitiesRef.value = {
      image: false,
      audio: false,
      embeddedContext: true,
    };
    const wrapper = mountPanel();
    const image = makeFile("unsupported-paste.png", "image/png");

    const { event, preventDefault } = dispatchPaste(
      wrapper,
      [
        { kind: "string", getAsFile: () => null },
        { kind: "file", getAsFile: () => image },
      ],
      "keep this text"
    );
    if (!event.defaultPrevented) {
      await wrapper.get("textarea").setValue("keep this text");
    }
    await wrapper.vm.$nextTick();

    expect(preventDefault).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("keep this text");
    expect(wrapper.find('[data-test="attachment-count"]').exists()).toBe(false);
    expect(saveAttachment).not.toHaveBeenCalled();
    expect(toastAdd).toHaveBeenCalledTimes(1);
    expect(toastAdd.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ description: expect.stringContaining("图片 1 个") })
    );
  });

  it("keeps native behavior for text-only paste and text dragging", async () => {
    const wrapper = mountPanel();
    const paste = dispatchPaste(wrapper, [{ kind: "string", getAsFile: () => null }], "plain text");
    if (!paste.event.defaultPrevented) {
      await wrapper.get("textarea").setValue("plain text");
    }
    await wrapper.vm.$nextTick();

    expect(paste.preventDefault).not.toHaveBeenCalled();
    expect(paste.event.defaultPrevented).toBe(false);
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("plain text");

    const textTransfer = makeDataTransfer([{ kind: "string", getAsFile: () => null }]);
    const dragEnter = dispatchSurfaceEvent(wrapper, "dragenter", textTransfer);
    const dragOver = dispatchSurfaceEvent(wrapper, "dragover", textTransfer);
    const drop = dispatchSurfaceEvent(wrapper, "drop", textTransfer);

    expect(dragEnter.preventDefault).not.toHaveBeenCalled();
    expect(dragOver.preventDefault).not.toHaveBeenCalled();
    expect(drop.preventDefault).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="attachment-count"]').exists()).toBe(false);
    expect(toastAdd).not.toHaveBeenCalled();
  });

  it("accepts mixed image and file drops in DataTransferItem order", async () => {
    const wrapper = mountPanel();
    const image = makeFile("drop-image.png", "image/png");
    const file = makeFile("drop-notes.md", "text/markdown");
    const transfer = makeDataTransfer([
      { kind: "string", getAsFile: () => null },
      { kind: "file", getAsFile: () => image },
      { kind: "file", getAsFile: () => file },
    ]);

    const dragEnter = dispatchSurfaceEvent(wrapper, "dragenter", transfer);
    const dragOver = dispatchSurfaceEvent(wrapper, "dragover", transfer);
    const drop = dispatchSurfaceEvent(wrapper, "drop", transfer);
    await wrapper.vm.$nextTick();

    expect(dragEnter.preventDefault).toHaveBeenCalledTimes(1);
    expect(dragOver.preventDefault).toHaveBeenCalledTimes(1);
    expect(drop.preventDefault).toHaveBeenCalledTimes(1);
    expect(wrapper.findAll('[data-test="attachment-name"]').map((item) => item.text())).toEqual([
      "drop-image.png",
      "drop-notes.md",
    ]);
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
    expect(createSession).not.toHaveBeenCalled();
    expect(saveAttachment).not.toHaveBeenCalled();
  });

  it("keeps a ready-probe multi-file selection in the draft without creating a session", async () => {
    activeDraftProbeRef.value = {
      agentId: "claude-code",
      sessionMode: "fyllocode",
      status: "ready",
      fylloSessionId: "session-probe",
      acpSessionId: "acp-probe",
      configOptions: [],
      availableCommands: [],
    };
    const wrapper = mountPanel();

    await wrapper.get('[data-test="prompt-action-upload-multiple"]').trigger("click");
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[data-test="attachment-count"]').text()).toBe("2");
    expect(activeSessionRef.value).toBeNull();
    expect(createSession).not.toHaveBeenCalled();
    expect(saveAttachment).not.toHaveBeenCalled();
  });

  it("requires non-empty text even when attachments are selected", async () => {
    const wrapper = mountPanel();

    expect(wrapper.get('[data-test="stop-button"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[data-test="prompt-action-upload-image"]').trigger("click");
    await wrapper.get('[data-test="prompt-submit"]').trigger("click");
    expect(sendMessage).not.toHaveBeenCalled();

    await wrapper.get("textarea").setValue("   ");
    await wrapper.get('[data-test="prompt-submit"]').trigger("click");
    expect(sendMessage).not.toHaveBeenCalled();
    expect(wrapper.get('[data-test="attachment-count"]').text()).toBe("1");
  });

  it("keeps text and attachments when submission fails", async () => {
    sendMessage.mockResolvedValueOnce(false);
    const wrapper = mountPanel();

    await wrapper.get('[data-test="prompt-action-upload-image"]').trigger("click");
    await wrapper.get("textarea").setValue("retry this");
    await wrapper.get('[data-test="prompt-submit"]').trigger("click");
    await wrapper.vm.$nextTick();

    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("retry this");
    expect(wrapper.get('[data-test="attachment-count"]').text()).toBe("1");
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

  it("rejects unsupported image attachments before preview or save", async () => {
    promptCapabilitiesRef.value = {
      image: false,
      audio: false,
      embeddedContext: true,
    };
    activeSessionRef.value = makeSession();
    const wrapper = mountPanel();

    await wrapper.get('[data-test="prompt-action-upload-image"]').trigger("click");
    await wrapper.vm.$nextTick();
    expect(saveAttachment).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="attachment-count"]').exists()).toBe(false);
    expect(toastAdd).toHaveBeenCalledTimes(1);
    expect(toastAdd.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ description: expect.stringContaining("图片 1 个") })
    );
    await wrapper.get("textarea").setValue("see image");
    await wrapper.get('[data-test="prompt-submit"]').trigger("click");
    await wrapper.vm.$nextTick();

    expect(sendMessage).toHaveBeenCalledWith(
      [{ type: "text", text: "see image" }],
      expect.objectContaining({ materializeAttachments: expect.any(Function) })
    );
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("");
    expect(wrapper.find('[data-test="attachment-count"]').exists()).toBe(false);
  });

  it("rejects unsupported ordinary files before preview or save", async () => {
    promptCapabilitiesRef.value = {
      image: true,
      audio: false,
      embeddedContext: false,
    };
    activeSessionRef.value = makeSession();
    const wrapper = mountPanel();

    await wrapper.get('[data-test="prompt-action-upload-file"]').trigger("click");
    await wrapper.vm.$nextTick();

    expect(saveAttachment).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="attachment-count"]').exists()).toBe(false);
    expect(toastAdd).toHaveBeenCalledTimes(1);
    expect(toastAdd.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ description: expect.stringContaining("文件 1 个") })
    );
  });

  it("accepts supported items and reports all mixed-batch rejections once", async () => {
    promptCapabilitiesRef.value = {
      image: true,
      audio: false,
      embeddedContext: false,
    };
    const wrapper = mountPanel();
    const image = makeFile("accepted.png", "image/png");
    const unsupportedFile = makeFile("rejected.md", "text/markdown");
    const transfer = makeDataTransfer([
      { kind: "file", getAsFile: () => unsupportedFile },
      { kind: "file", getAsFile: () => image },
      {
        kind: "file",
        getAsFile: () => makeFile("directory-placeholder", "application/octet-stream"),
        webkitGetAsEntry: () => ({ isDirectory: true }),
      },
    ]);

    dispatchSurfaceEvent(wrapper, "drop", transfer);
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('[data-test="attachment-name"]').map((item) => item.text())).toEqual([
      "accepted.png",
    ]);
    expect(toastAdd).toHaveBeenCalledTimes(1);
    expect(toastAdd.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        description: expect.stringContaining("文件 1 个"),
      })
    );
    expect(toastAdd.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ description: expect.stringContaining("目录 1 个") })
    );
  });

  it("rejects directories, ignores null files, and does not recurse", async () => {
    const wrapper = mountPanel();
    const directoryGetAsFile = vi.fn(() => makeFile("should-not-read", "text/plain"));
    const nullGetAsFile = vi.fn(() => null);
    const image = makeFile("kept.png", "image/png");
    const transfer = makeDataTransfer([
      {
        kind: "file",
        getAsFile: directoryGetAsFile,
        webkitGetAsEntry: () => ({ isDirectory: true }),
      },
      { kind: "file", getAsFile: () => image },
      { kind: "file", getAsFile: nullGetAsFile },
    ]);

    dispatchSurfaceEvent(wrapper, "drop", transfer);
    await wrapper.vm.$nextTick();

    expect(directoryGetAsFile).not.toHaveBeenCalled();
    expect(nullGetAsFile).toHaveBeenCalledTimes(1);
    expect(wrapper.findAll('[data-test="attachment-name"]').map((item) => item.text())).toEqual([
      "kept.png",
    ]);
    expect(toastAdd).toHaveBeenCalledTimes(1);
    expect(toastAdd.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ description: expect.stringContaining("目录 1 个") })
    );
  });

  it("clears the local drag visual state on leave, drop, cancel, and unmount", async () => {
    const wrapper = mountPanel();
    const transfer = makeDataTransfer([
      { kind: "file", getAsFile: () => makeFile("drag.png", "image/png") },
    ]);
    const surface = () => wrapper.find('[class*="transition-colors"]');

    dispatchSurfaceEvent(wrapper, "dragenter", transfer);
    await wrapper.vm.$nextTick();
    expect(surface().attributes("class")).toContain("border-primary/40");
    expect(surface().attributes("class")).toContain("bg-primary/5");

    dispatchSurfaceEvent(wrapper, "dragleave", transfer);
    await wrapper.vm.$nextTick();
    expect(surface().attributes("class")).not.toContain("border-primary/40");

    dispatchSurfaceEvent(wrapper, "dragenter", transfer);
    dispatchSurfaceEvent(wrapper, "drop", transfer);
    await wrapper.vm.$nextTick();
    expect(surface().attributes("class")).not.toContain("border-primary/40");

    dispatchSurfaceEvent(wrapper, "dragenter", transfer);
    dispatchSurfaceEvent(wrapper, "dragend", transfer);
    await wrapper.vm.$nextTick();
    expect(surface().attributes("class")).not.toContain("border-primary/40");
    expect(wrapper.find('[class*="shadow"]').exists()).toBe(false);
    expect(wrapper.find('[class*="transform"]').exists()).toBe(false);

    wrapper.unmount();
    const freshWrapper = mountPanel();
    expect(freshWrapper.find('[class*="transition-colors"]').attributes("class")).not.toContain(
      "border-primary/40"
    );
    freshWrapper.unmount();
  });

  it("keeps paste and drop attachments local in draft state and preserves retry data", async () => {
    sendMessage.mockResolvedValueOnce(false);
    const wrapper = mountPanel();
    const image = makeFile("draft-paste.png", "image/png");
    const file = makeFile("draft-drop.md", "text/markdown");

    dispatchPaste(wrapper, [{ kind: "file", getAsFile: () => image }]);
    dispatchSurfaceEvent(
      wrapper,
      "drop",
      makeDataTransfer([{ kind: "file", getAsFile: () => file }])
    );
    await wrapper.vm.$nextTick();

    expect(activeSessionRef.value).toBeNull();
    expect(createSession).not.toHaveBeenCalled();
    expect(saveAttachment).not.toHaveBeenCalled();
    expect(wrapper.get('[data-test="attachment-count"]').text()).toBe("2");

    await wrapper.get("textarea").setValue("retry draft");
    await wrapper.get('[data-test="prompt-submit"]').trigger("click");
    await wrapper.vm.$nextTick();

    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("retry draft");
    expect(wrapper.get('[data-test="attachment-count"]').text()).toBe("2");
  });

  it("keeps paste and drop saves on the active Session target", async () => {
    activeSessionRef.value = makeSession();
    const wrapper = mountPanel();
    const image = makeFile("session-paste.png", "image/png");
    const file = makeFile("session-drop.md", "text/markdown");

    dispatchPaste(wrapper, [{ kind: "file", getAsFile: () => image }]);
    dispatchSurfaceEvent(
      wrapper,
      "drop",
      makeDataTransfer([{ kind: "file", getAsFile: () => file }])
    );
    await vi.waitFor(() => {
      expect(saveAttachment).toHaveBeenCalledTimes(2);
    });

    expect(saveAttachment.mock.calls.map((call) => call.slice(0, 2))).toEqual([
      ["project-1", "session-1"],
      ["project-1", "session-1"],
    ]);
    expect(activeSessionRef.value?.id).toBe("session-1");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("does not submit when paste and drop provide attachments without text", async () => {
    const wrapper = mountPanel();
    dispatchPaste(wrapper, [{ kind: "file", getAsFile: () => makeFile("only.png", "image/png") }]);
    dispatchSurfaceEvent(
      wrapper,
      "drop",
      makeDataTransfer([{ kind: "file", getAsFile: () => makeFile("only.md", "text/markdown") }])
    );
    await wrapper.vm.$nextTick();

    await wrapper.get('[data-test="prompt-submit"]').trigger("click");
    await wrapper.get("textarea").setValue("   ");
    await wrapper.get('[data-test="prompt-submit"]').trigger("click");

    expect(sendMessage).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
    expect(wrapper.get('[data-test="attachment-count"]').text()).toBe("2");
  });

  it("assembles text first and then attachment parts", async () => {
    activeSessionRef.value = makeSession();
    saveAttachment.mockResolvedValueOnce({
      ok: true,
      data: {
        attachmentId: "22222222-2222-4222-8222-222222222222",
        name: "diagram.png",
        mimeType: "image/png",
      },
    });
    saveAttachment.mockResolvedValueOnce({
      ok: true,
      data: {
        attachmentId: "33333333-3333-4333-8333-333333333333",
        name: "notes.md",
        mimeType: "text/markdown",
      },
    });
    let submittedParts: unknown[] = [];
    sendMessage.mockImplementationOnce(async (parts, options) => {
      const attachmentParts = await options?.materializeAttachments?.({
        workspaceId: "project-1",
        sessionId: "session-1",
      });
      submittedParts = [...parts, ...(attachmentParts ?? [])];
      return true;
    });
    const wrapper = mountPanel();

    await wrapper.get('[data-test="prompt-action-upload-image"]').trigger("click");
    await wrapper.get('[data-test="prompt-action-upload-file"]').trigger("click");
    await vi.waitFor(() => {
      expect(saveAttachment).toHaveBeenCalledTimes(2);
    });
    await wrapper.get("textarea").setValue("review files");
    await wrapper.get('[data-test="prompt-submit"]').trigger("click");

    expect(submittedParts).toEqual([
      { type: "text", text: "review files" },
      {
        type: "attachment",
        attachmentId: "22222222-2222-4222-8222-222222222222",
        mediaType: "image/png",
        filename: "diagram.png",
      },
      {
        type: "attachment",
        attachmentId: "33333333-3333-4333-8333-333333333333",
        mediaType: "text/markdown",
        filename: "notes.md",
      },
    ]);
  });
});
