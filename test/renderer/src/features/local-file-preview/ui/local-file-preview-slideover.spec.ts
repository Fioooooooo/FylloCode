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
    updateOptions: vi.fn(),
    setPosition: vi.fn(),
    revealLineInCenter: vi.fn(),
    revealLineNearTop: vi.fn(),
  },
}));

vi.mock("stream-monaco", () => ({
  useMonaco: vi.fn(() => ({
    createEditor: monacoMocks.createEditor,
    cleanupEditor: monacoMocks.cleanupEditor,
    setTheme: monacoMocks.setTheme,
  })),
}));

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

  it("cleans up Monaco and controller on unmount", () => {
    const preview = controller({ status: "loading", requestedPath: "/file.ts" });
    const wrapper = mount(LocalFilePreviewSlideover, { props: { controller: preview } });

    wrapper.unmount();

    expect(monacoMocks.cleanupEditor).toHaveBeenCalled();
    expect(preview.dispose).toHaveBeenCalled();
  });
});
