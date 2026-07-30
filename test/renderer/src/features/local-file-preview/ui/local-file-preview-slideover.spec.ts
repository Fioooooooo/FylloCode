import { flushPromises, mount } from "@vue/test-utils";
import { shallowRef } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMonaco } from "stream-monaco";
import LocalFilePreviewSlideover from "@renderer/features/local-file-preview/ui/LocalFilePreviewSlideover.vue";
import type {
  LocalFilePreviewController,
  LocalFilePreviewState,
} from "@renderer/features/local-file-preview";

const monacoMocks = vi.hoisted(() => ({
  createEditor: vi.fn(),
  cleanupEditor: vi.fn(),
  setTheme: vi.fn(),
  editor: {
    dispose: vi.fn(),
    updateOptions: vi.fn(),
    setPosition: vi.fn(),
    revealLineInCenter: vi.fn(),
    revealLineNearTop: vi.fn(),
  },
}));

vi.mock("@renderer/components/shared/MarkStream.vue", () => ({
  default: {
    name: "MarkStream",
    props: ["id", "content", "isStreaming", "isDark"],
    template: '<div data-test="markstream-stub">{{ content }}</div>',
  },
}));

vi.mock("stream-monaco", () => ({
  useMonaco: vi.fn(() => ({
    createEditor: monacoMocks.createEditor,
    cleanupEditor: monacoMocks.cleanupEditor,
    setTheme: monacoMocks.setTheme,
  })),
}));

const tabsStub = {
  name: "UTabs",
  props: ["modelValue", "items", "valueKey", "content"],
  emits: ["update:modelValue"],
  template:
    '<div role="tablist" data-test="tabs-stub"><button v-for="item in items" :key="item[valueKey]" type="button" role="tab" :aria-label="item.label" :aria-selected="item[valueKey] === modelValue" :disabled="item.disabled" @click="$emit(\'update:modelValue\', item[valueKey])"><slot name="leading" :item="item" /><span>{{ item.label }}</span></button><template v-if="content !== false" v-for="item in items" :key="`content-${item[valueKey]}`"><slot v-if="item[valueKey] === modelValue" name="content" :item="item" /></template></div>',
};
const tooltipStub = {
  name: "UTooltip",
  props: ["text", "ui"],
  template: '<div data-test="tooltip-stub" :data-content-class="ui?.content"><slot /></div>',
};

function controller(initial: LocalFilePreviewState): LocalFilePreviewController {
  return {
    state: shallowRef(initial),
    open: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("LocalFilePreviewSlideover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    monacoMocks.createEditor.mockResolvedValue(monacoMocks.editor);
  });

  it("does not create Monaco for loading, confirmation, or error states", async () => {
    const preview = controller({ status: "loading", requestedPath: "/file.ts" });
    const wrapper = mount(LocalFilePreviewSlideover, { props: { controller: preview } });

    expect(wrapper.find('[data-test="preview-loading"]').exists()).toBe(true);
    expect(monacoMocks.setTheme).toHaveBeenCalledWith("vitesse-light");
    preview.state.value = {
      status: "confirmation-required",
      authorizationId: "auth-1",
      requestedPath: "/outside/file.ts",
      canonicalPath: "/outside/file.ts",
      size: 4,
      mtimeMs: 10,
    };
    await flushPromises();
    expect(wrapper.text()).toContain("/outside/file.ts");
    preview.state.value = {
      status: "error",
      code: "INVALID_UTF8",
      message: "文件不是有效的 UTF-8 文本",
    };
    await flushPromises();

    expect(monacoMocks.createEditor).not.toHaveBeenCalled();
  });

  it("offers one-time and window-trust confirmation choices", async () => {
    const preview = controller({
      status: "confirmation-required",
      authorizationId: "auth-1",
      requestedPath: "/outside/file.ts",
      canonicalPath: "/outside/file.ts",
      size: 4,
      mtimeMs: 10,
    });
    const wrapper = mount(LocalFilePreviewSlideover, { props: { controller: preview } });
    const buttons = wrapper.findAll("button");

    await buttons.find((button) => button.text() === "仅打开一次")!.trigger("click");
    await buttons.find((button) => button.text() === "打开并在此窗口中信任")!.trigger("click");

    expect(preview.confirm).toHaveBeenNthCalledWith(1, { rememberForWindow: false });
    expect(preview.confirm).toHaveBeenNthCalledWith(2, { rememberForWindow: true });
  });

  it("creates a read-only editor only for ready content and reveals location", async () => {
    const preview = controller({
      status: "ready",
      document: {
        requestedPath: "/project/file.ts:12:3",
        canonicalPath: "/project/file.ts",
        content: "const value = 1;",
        language: "typescript",
        size: 16,
        mtimeMs: 10,
        line: 12,
        column: 3,
      },
    });

    mount(LocalFilePreviewSlideover, { props: { controller: preview } });
    await flushPromises();

    expect(vi.mocked(useMonaco)).toHaveBeenCalledWith(
      expect.objectContaining({
        autoScrollInitial: false,
        autoScrollOnUpdate: false,
      })
    );
    expect(monacoMocks.createEditor).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      "const value = 1;",
      "typescript"
    );
    expect(monacoMocks.editor.updateOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        readOnly: true,
        domReadOnly: true,
        minimap: { enabled: false },
        wordWrap: "off",
      })
    );
    expect(monacoMocks.editor.setPosition).toHaveBeenCalledWith({
      lineNumber: 12,
      column: 3,
    });
    expect(monacoMocks.editor.revealLineInCenter).toHaveBeenCalledWith(12);
  });

  it("positions links without a location at the start of the file", async () => {
    const preview = controller({
      status: "ready",
      document: {
        requestedPath: "/project/file.ts",
        canonicalPath: "/project/file.ts",
        content: "first\nsecond\nthird",
        language: "typescript",
        size: 18,
        mtimeMs: 10,
      },
    });

    mount(LocalFilePreviewSlideover, { props: { controller: preview } });
    await flushPromises();

    expect(monacoMocks.editor.setPosition).toHaveBeenCalledWith({
      lineNumber: 1,
      column: 1,
    });
    expect(monacoMocks.editor.revealLineNearTop).toHaveBeenCalledWith(1);
    expect(monacoMocks.editor.revealLineInCenter).not.toHaveBeenCalled();
  });

  it("switches source wrapping without recreating the file preview and resets on reopen", async () => {
    const preview = controller({
      status: "ready",
      document: {
        requestedPath: "/project/file.ts",
        canonicalPath: "/project/file.ts",
        content: "a very long source line",
        language: "typescript",
        size: 23,
        mtimeMs: 10,
      },
    });
    const wrapper = mount(LocalFilePreviewSlideover, {
      props: { controller: preview },
      global: { stubs: { UTabs: tabsStub, Tabs: tabsStub } },
    });
    await flushPromises();

    expect(wrapper.get('[role="tab"][aria-label="内容溢出"]').attributes("aria-selected")).toBe(
      "true"
    );
    await wrapper.get('[aria-label="自动换行"]').trigger("click");

    expect(monacoMocks.createEditor).toHaveBeenCalledTimes(1);
    expect(monacoMocks.editor.updateOptions).toHaveBeenLastCalledWith({ wordWrap: "on" });

    wrapper.unmount();
    monacoMocks.createEditor.mockClear();
    monacoMocks.editor.updateOptions.mockClear();

    mount(LocalFilePreviewSlideover, {
      props: { controller: preview },
      global: { stubs: { UTabs: tabsStub, Tabs: tabsStub } },
    });
    await flushPromises();

    expect(monacoMocks.createEditor).toHaveBeenCalledTimes(1);
    expect(monacoMocks.editor.updateOptions).toHaveBeenCalledWith(
      expect.objectContaining({ wordWrap: "off" })
    );
  });

  it("switches Markdown content between source and MarkStream while retaining source state", async () => {
    const preview = controller({
      status: "ready",
      document: {
        requestedPath: "/project/guide.markdown:8:2",
        canonicalPath: "/project/guide.markdown",
        content: "# Guide\n\n[Other](/project/other.md)",
        language: "markdown",
        size: 38,
        mtimeMs: 10,
        line: 8,
        column: 2,
      },
    });
    const wrapper = mount(LocalFilePreviewSlideover, {
      props: { controller: preview },
      global: { stubs: { UTabs: tabsStub, Tabs: tabsStub } },
    });
    await flushPromises();

    expect(wrapper.getComponent(tabsStub).props("content")).toBe(false);
    const toolbar = wrapper.get('[data-test="preview-toolbar"]');
    expect(toolbar.find('[data-test="preview-mode-tabs"]').exists()).toBe(true);
    expect(toolbar.text()).toContain("原文");
    expect(toolbar.text()).toContain("预览");
    expect(toolbar.text()).toContain("内容溢出");
    expect(toolbar.text()).toContain("自动换行");
    expect(toolbar.find('[aria-label="自动换行"]').exists()).toBe(true);
    expect(toolbar.findAll('[role="tab"]').map((tab) => tab.attributes("aria-label"))).toEqual([
      "内容溢出",
      "自动换行",
      "原文",
      "预览",
    ]);
    const header = wrapper.get("header");
    expect(header.find('[data-test="preview-mode-tabs"]').exists()).toBe(false);
    expect(header.find('[aria-label="自动换行"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="preview-markstream"]').exists()).toBe(false);
    await wrapper.get('[aria-label="自动换行"]').trigger("click");
    await wrapper.get('[role="tab"][aria-label="预览"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-test="preview-editor"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="preview-markstream"]').text()).toContain("# Guide");
    const disabledWrapTabs = wrapper.get('[data-test="word-wrap-tabs"]').findAll('[role="tab"]');
    expect(disabledWrapTabs).toHaveLength(2);
    expect(disabledWrapTabs.every((tab) => tab.attributes("disabled") !== undefined)).toBe(true);

    await wrapper.get('[role="tab"][aria-label="原文"]').trigger("click");
    await flushPromises();

    expect(monacoMocks.createEditor).toHaveBeenCalledTimes(2);
    expect(monacoMocks.editor.updateOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ wordWrap: "on" })
    );
    expect(monacoMocks.editor.setPosition).toHaveBeenLastCalledWith({
      lineNumber: 8,
      column: 2,
    });
  });

  it("renders Slideover tooltips above the overlay content layer", async () => {
    const preview = controller({
      status: "ready",
      document: {
        requestedPath: "/project/guide.md",
        canonicalPath: "/project/guide.md",
        content: "# Guide",
        language: "markdown",
        size: 7,
        mtimeMs: 10,
      },
    });
    const wrapper = mount(LocalFilePreviewSlideover, {
      props: { controller: preview },
      global: {
        stubs: {
          UTabs: tabsStub,
          Tabs: tabsStub,
          UTooltip: tooltipStub,
          Tooltip: tooltipStub,
        },
      },
    });
    await flushPromises();

    const tooltips = wrapper.findAll('[data-test="tooltip-stub"]');
    expect(tooltips).toHaveLength(1);
    expect(tooltips.every((tooltip) => tooltip.attributes("data-content-class") === "z-[60]")).toBe(
      true
    );
  });

  it("ignores a superseded Monaco creation when switching to rendered Markdown", async () => {
    const preview = controller({
      status: "ready",
      document: {
        requestedPath: "/project/guide.md",
        canonicalPath: "/project/guide.md",
        content: "# Guide",
        language: "markdown",
        size: 7,
        mtimeMs: 10,
      },
    });
    let rejectEditorCreation: ((error: Error) => void) | undefined;
    monacoMocks.createEditor.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectEditorCreation = reject;
      })
    );
    const wrapper = mount(LocalFilePreviewSlideover, {
      props: { controller: preview },
      global: { stubs: { UTabs: tabsStub, Tabs: tabsStub } },
    });
    await flushPromises();

    await wrapper.get('[role="tab"][aria-label="预览"]').trigger("click");
    const supersededError = new Error("Editor creation was superseded");
    supersededError.name = "AbortError";
    rejectEditorCreation?.(supersededError);
    await flushPromises();

    expect(wrapper.get('[data-test="preview-markstream"]').text()).toContain("# Guide");
    expect(wrapper.find('[data-test="preview-editor"]').exists()).toBe(false);
  });

  it("does not offer MarkStream preview for non-Markdown files", async () => {
    const preview = controller({
      status: "ready",
      document: {
        requestedPath: "/project/file.ts",
        canonicalPath: "/project/file.ts",
        content: "const value = 1;",
        language: "typescript",
        size: 16,
        mtimeMs: 10,
      },
    });
    const wrapper = mount(LocalFilePreviewSlideover, {
      props: { controller: preview },
      global: { stubs: { UTabs: tabsStub, Tabs: tabsStub } },
    });
    await flushPromises();

    expect(wrapper.find('[aria-label="自动换行"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="preview-toolbar"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="preview-markstream"]').exists()).toBe(false);
  });

  it("cleans up Monaco and controller on unmount", () => {
    const preview = controller({ status: "loading", requestedPath: "/file.ts" });
    const wrapper = mount(LocalFilePreviewSlideover, { props: { controller: preview } });

    wrapper.unmount();

    expect(monacoMocks.cleanupEditor).toHaveBeenCalled();
    expect(preview.dispose).toHaveBeenCalled();
  });
});
