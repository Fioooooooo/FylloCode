import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref, type PropType, type Ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectLanguage, useMonaco } from "stream-monaco";
import { createTurnFileChangeReviewController } from "@renderer/features/turn-file-change-review/application/turn-file-change-review-controller";
import TurnFileChangeReviewSlideover from "@renderer/features/turn-file-change-review/ui/TurnFileChangeReviewSlideover.vue";
import type { TurnFileChange } from "@renderer/features/turn-file-change-review";

const colorModeMock = vi.hoisted(() => ({
  current: null as Ref<string> | null,
}));

const monacoMocks = vi.hoisted(() => ({
  createDiffEditor: vi.fn(),
  updateDiff: vi.fn(),
  cleanupEditor: vi.fn(),
  setTheme: vi.fn(),
  detectLanguage: vi.fn(() => "typescript"),
}));

vi.mock("@vueuse/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vueuse/core")>()),
  useColorMode: () => colorModeMock.current,
}));

vi.mock("stream-monaco", () => ({
  detectLanguage: monacoMocks.detectLanguage,
  useMonaco: vi.fn(() => ({
    createDiffEditor: monacoMocks.createDiffEditor,
    updateDiff: monacoMocks.updateDiff,
    cleanupEditor: monacoMocks.cleanupEditor,
    setTheme: monacoMocks.setTheme,
  })),
}));

const accordionStub = defineComponent({
  name: "UAccordion",
  props: {
    modelValue: { type: Array as PropType<string[]>, default: () => [] },
    items: { type: Array as PropType<Record<string, unknown>[]>, default: () => [] },
    valueKey: { type: String, default: "value" },
    labelKey: { type: String, default: "label" },
    type: { type: String, default: undefined },
    unmountOnHide: { type: Boolean, default: true },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    function isOpen(value: string): boolean {
      return props.modelValue.includes(value);
    }

    function toggle(value: string): void {
      const current = [...props.modelValue];
      emit(
        "update:modelValue",
        current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
      );
    }

    return { isOpen, toggle };
  },
  template:
    '<div data-test="accordion-stub" :data-type="type" :data-unmount-on-hide="String(unmountOnHide)"><div v-for="(item, index) in items" :key="item[valueKey]"><button type="button" :data-test="`accordion-trigger-${item[valueKey]}`" :aria-expanded="String(isOpen(item[valueKey]))" @click="toggle(item[valueKey])"><slot :item="item" :index="index" :open="isOpen(item[valueKey])">{{ item[labelKey] }}</slot></button><div v-if="isOpen(item[valueKey]) || !unmountOnHide" :hidden="!isOpen(item[valueKey])"><slot name="body" :item="item" :index="index" :open="isOpen(item[valueKey])" /></div></div></div>',
});

const slideoverStub = {
  name: "USlideover",
  props: ["ui"],
  template:
    '<div data-test="slideover-stub" :data-content-class="ui && ui.content"><slot name="body" /></div>',
};

type HeightEvent =
  "diff" | "originalContent" | "modifiedContent" | "originalHidden" | "modifiedHidden";

function createEditorHarness(originalHeight = 120, modifiedHeight = 120) {
  const listeners: Record<HeightEvent, (() => void)[]> = {
    diff: [],
    originalContent: [],
    modifiedContent: [],
    originalHidden: [],
    modifiedHidden: [],
  };
  const disposables: { dispose: ReturnType<typeof vi.fn> }[] = [];
  const subscribe = (event: HeightEvent) =>
    vi.fn((listener: () => void) => {
      listeners[event].push(listener);
      const disposable = { dispose: vi.fn() };
      disposables.push(disposable);
      return disposable;
    });
  const originalEditor = {
    getContentHeight: vi.fn(() => originalHeight),
    onDidContentSizeChange: subscribe("originalContent"),
    onDidChangeHiddenAreas: subscribe("originalHidden"),
  };
  const modifiedEditor = {
    getContentHeight: vi.fn(() => modifiedHeight),
    onDidContentSizeChange: subscribe("modifiedContent"),
    onDidChangeHiddenAreas: subscribe("modifiedHidden"),
  };
  const editor = {
    dispose: vi.fn(),
    getOriginalEditor: vi.fn(() => originalEditor),
    getModifiedEditor: vi.fn(() => modifiedEditor),
    onDidUpdateDiff: subscribe("diff"),
    layout: vi.fn(),
  };

  return { editor, originalEditor, modifiedEditor, listeners, disposables };
}

let editorHarnesses: ReturnType<typeof createEditorHarness>[] = [];
let animationFrames = new Map<number, FrameRequestCallback>();
let animationFrameId = 0;

function flushAnimationFrames(): void {
  while (animationFrames.size > 0) {
    const pendingFrames = [...animationFrames.values()];
    animationFrames.clear();
    for (const callback of pendingFrames) callback(performance.now());
  }
}

function change(
  path: string,
  kind: TurnFileChange["kind"] = "modified",
  original = "before",
  modified = "after"
): TurnFileChange {
  return { path, kind, original, modified };
}

function mountReview(changes: readonly TurnFileChange[], initialPath?: string) {
  const controller = createTurnFileChangeReviewController(changes, initialPath);
  const wrapper = mount(TurnFileChangeReviewSlideover, {
    props: { controller },
    global: {
      stubs: {
        UAccordion: accordionStub,
        Accordion: accordionStub,
        USlideover: slideoverStub,
        Slideover: slideoverStub,
      },
    },
  });
  return { controller, wrapper };
}

describe("TurnFileChangeReviewSlideover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    colorModeMock.current = ref("light");
    editorHarnesses = [createEditorHarness(), createEditorHarness(), createEditorHarness()];
    monacoMocks.createDiffEditor.mockImplementation(async () => {
      const callIndex = monacoMocks.createDiffEditor.mock.calls.length - 1;
      return editorHarnesses[callIndex]!.editor;
    });
    monacoMocks.detectLanguage.mockReturnValue("typescript");
    animationFrames = new Map();
    animationFrameId = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      const id = ++animationFrameId;
      animationFrames.set(id, callback);
      return id;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      animationFrames.delete(id);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults every file to collapsed without creating hidden editors", async () => {
    const { wrapper } = mountReview(
      [change("/first.ts", "added", "", "first"), change("/second.ts", "deleted", "second", "")],
      "/second.ts"
    );
    await flushPromises();

    expect(wrapper.get('[data-test="slideover-stub"]').attributes("data-content-class")).toBe(
      "w-[min(100vw,960px)] max-w-none"
    );
    expect(wrapper.get('[data-test="turn-file-change-accordion"]').attributes("data-type")).toBe(
      "multiple"
    );
    expect(
      wrapper.get('[data-test="turn-file-change-accordion"]').attributes("data-unmount-on-hide")
    ).toBe("false");
    expect(
      wrapper.get('[data-test="accordion-trigger-/first.ts"]').attributes("aria-expanded")
    ).toBe("false");
    expect(
      wrapper.get('[data-test="accordion-trigger-/second.ts"]').attributes("aria-expanded")
    ).toBe("false");
    expect(wrapper.findAll('[data-test="turn-file-change-diff-editor"]')).toHaveLength(0);
    expect(useMonaco).not.toHaveBeenCalled();
    expect(monacoMocks.createDiffEditor).not.toHaveBeenCalled();
  });

  it("creates editors on first expansion and preserves them across repeated reopen", async () => {
    const { wrapper } = mountReview([
      change("/first.ts", "modified", "first-before", "first-after"),
      change("/second.ts", "modified", "second-before", "second-after"),
    ]);
    await flushPromises();

    await wrapper.get('[data-test="accordion-trigger-/first.ts"]').trigger("click");
    await wrapper.get('[data-test="accordion-trigger-/second.ts"]').trigger("click");
    await flushPromises();

    expect(wrapper.findAll('[data-test="turn-file-change-diff-editor"]')).toHaveLength(2);
    expect(monacoMocks.createDiffEditor).toHaveBeenCalledTimes(2);

    await wrapper.get('[data-test="accordion-trigger-/first.ts"]').trigger("click");
    await flushPromises();

    expect(
      wrapper.get('[data-test="accordion-trigger-/first.ts"]').attributes("aria-expanded")
    ).toBe("false");
    expect(
      wrapper.get('[data-test="accordion-trigger-/second.ts"]').attributes("aria-expanded")
    ).toBe("true");
    expect(wrapper.findAll('[data-test="turn-file-change-diff-editor"]')).toHaveLength(2);
    expect(monacoMocks.cleanupEditor).not.toHaveBeenCalled();

    await wrapper.get('[data-test="accordion-trigger-/first.ts"]').trigger("click");
    await wrapper.get('[data-test="accordion-trigger-/first.ts"]').trigger("click");
    await wrapper.get('[data-test="accordion-trigger-/first.ts"]').trigger("click");
    await flushPromises();

    expect(monacoMocks.createDiffEditor).toHaveBeenCalledTimes(2);
    expect(monacoMocks.cleanupEditor).not.toHaveBeenCalled();
    expect(
      wrapper.get('[data-test="turn-file-change-diff-editor"][data-path="/first.ts"]')
    ).toBeTruthy();
  });

  it("preserves mounted paths during streaming and keeps new paths unmounted", async () => {
    const { controller, wrapper } = mountReview([change("/a.ts"), change("/b.ts")]);
    await flushPromises();

    await wrapper.get('[data-test="accordion-trigger-/b.ts"]').trigger("click");
    await flushPromises();

    controller.setChanges([
      change("/c.ts", "added", "", "c1"),
      change("/a.ts", "modified", "a0", "a2"),
      change("/b.ts", "modified", "b0", "b2"),
    ]);
    await flushPromises();

    expect(wrapper.get('[data-test="accordion-trigger-/c.ts"]').attributes("aria-expanded")).toBe(
      "false"
    );
    expect(wrapper.get('[data-test="accordion-trigger-/a.ts"]').attributes("aria-expanded")).toBe(
      "false"
    );
    expect(wrapper.get('[data-test="accordion-trigger-/b.ts"]').attributes("aria-expanded")).toBe(
      "true"
    );
    expect(wrapper.findAll('[data-test="turn-file-change-diff-editor"]')).toHaveLength(1);
    expect(monacoMocks.updateDiff).toHaveBeenCalledWith("b0", "b2", "typescript");
    expect(monacoMocks.createDiffEditor).toHaveBeenCalledTimes(1);

    controller.setChanges([]);
    await flushPromises();
    expect(wrapper.get('[data-test="turn-file-change-empty"]').text()).toContain(
      "本轮没有净文件变更"
    );
    expect(monacoMocks.cleanupEditor).toHaveBeenCalledTimes(1);
  });

  it("sizes an open diff from visible content and resumes after reopen", async () => {
    editorHarnesses = [createEditorHarness(148, 192)];
    const { wrapper } = mountReview([change("/a.ts")]);
    await flushPromises();

    await wrapper.get('[data-test="accordion-trigger-/a.ts"]').trigger("click");
    await flushPromises();

    const editorElement = wrapper.get('[data-test="turn-file-change-diff-editor"]');
    vi.spyOn(editorElement.element, "getBoundingClientRect").mockReturnValue({
      width: 900,
    } as DOMRect);
    flushAnimationFrames();

    expect(editorElement.attributes("style")).toContain("height: 192px");
    expect(editorHarnesses[0]!.editor.layout).toHaveBeenCalledWith({ width: 900, height: 192 });

    editorHarnesses[0]!.editor.layout.mockClear();
    editorHarnesses[0]!.listeners.diff[0]!();
    flushAnimationFrames();
    expect(editorHarnesses[0]!.editor.layout).not.toHaveBeenCalled();

    editorHarnesses[0]!.modifiedEditor.getContentHeight.mockReturnValue(224);
    editorHarnesses[0]!.listeners.modifiedHidden[0]!();
    flushAnimationFrames();
    expect(editorElement.attributes("style")).toContain("height: 224px");

    await wrapper.get('[data-test="accordion-trigger-/a.ts"]').trigger("click");
    editorHarnesses[0]!.modifiedEditor.getContentHeight.mockReturnValue(260);
    editorHarnesses[0]!.listeners.modifiedContent[0]!();
    flushAnimationFrames();
    expect(editorElement.attributes("style")).toContain("height: 224px");

    await wrapper.get('[data-test="accordion-trigger-/a.ts"]').trigger("click");
    await flushPromises();
    flushAnimationFrames();
    expect(editorElement.attributes("style")).toContain("height: 260px");
    expect(monacoMocks.createDiffEditor).toHaveBeenCalledTimes(1);
  });

  it("follows theme changes and cleans height listeners with every mounted editor", async () => {
    const { controller, wrapper } = mountReview([change("/a.ts"), change("/b.ts")]);
    await flushPromises();

    await wrapper.get('[data-test="accordion-trigger-/a.ts"]').trigger("click");
    await wrapper.get('[data-test="accordion-trigger-/b.ts"]').trigger("click");
    await flushPromises();

    expect(monacoMocks.setTheme).toHaveBeenCalledTimes(2);
    expect(monacoMocks.setTheme).toHaveBeenCalledWith("vitesse-light");

    colorModeMock.current!.value = "dark";
    await flushPromises();
    expect(monacoMocks.setTheme).toHaveBeenCalledTimes(4);
    expect(monacoMocks.setTheme).toHaveBeenLastCalledWith("vitesse-dark");

    await wrapper.get('[aria-label="关闭本轮文件变更"]').trigger("click");
    await flushPromises();

    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(controller.changes.value).toEqual([]);
    expect(monacoMocks.cleanupEditor).toHaveBeenCalledTimes(2);
    for (const harness of editorHarnesses.slice(0, 2)) {
      expect(harness.disposables).toHaveLength(5);
      for (const disposable of harness.disposables)
        expect(disposable.dispose).toHaveBeenCalledOnce();
    }
  });

  it("detects language and creates a read-only editor without fixed height or overview ruler", async () => {
    const { wrapper } = mountReview([change("/new.ts", "added", "", "export const value = 1;")]);
    await flushPromises();

    await wrapper.get('[data-test="accordion-trigger-/new.ts"]').trigger("click");
    await flushPromises();

    expect(vi.mocked(useMonaco)).toHaveBeenCalledWith(
      expect.objectContaining({
        readOnly: true,
        MAX_HEIGHT: Number.MAX_SAFE_INTEGER,
        minimap: { enabled: false },
        renderOverviewRuler: false,
        automaticLayout: true,
      })
    );
    expect(detectLanguage).toHaveBeenCalledWith("export const value = 1;");
    expect(monacoMocks.createDiffEditor).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      "",
      "export const value = 1;",
      "typescript"
    );
    const editorElement = wrapper.get('[data-test="turn-file-change-diff-editor"]');
    expect(editorElement.classes().some((className) => /^(h|max-h)-/.test(className))).toBe(false);
  });
});
