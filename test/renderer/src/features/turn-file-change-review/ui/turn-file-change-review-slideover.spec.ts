import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref, type PropType, type Ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  editor: { dispose: vi.fn() },
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
    monacoMocks.createDiffEditor.mockResolvedValue(monacoMocks.editor);
    monacoMocks.detectLanguage.mockReturnValue("typescript");
  });

  it("matches the local file preview width and defaults every file to collapsed", async () => {
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
    expect(wrapper.findAll('[data-test="turn-file-change-diff-editor"]')).toHaveLength(2);
    for (const editor of wrapper.findAll('[data-test="turn-file-change-diff-editor"]')) {
      expect(editor.classes().some((className) => /^(h|max-h)-/.test(className))).toBe(false);
    }
    expect(vi.mocked(useMonaco)).toHaveBeenCalledTimes(2);
    expect(monacoMocks.createDiffEditor).toHaveBeenCalledTimes(2);
    expect(monacoMocks.createDiffEditor).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      "",
      "first",
      "typescript"
    );
    expect(monacoMocks.createDiffEditor).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      "second",
      "",
      "typescript"
    );
  });

  it("keeps hidden content and editors mounted across repeated collapse and reopen", async () => {
    const { wrapper } = mountReview([
      change("/first.ts", "modified", "first-before", "first-after"),
      change("/second.ts", "modified", "second-before", "second-after"),
    ]);
    await flushPromises();

    await wrapper.get('[data-test="accordion-trigger-/first.ts"]').trigger("click");
    await wrapper.get('[data-test="accordion-trigger-/second.ts"]').trigger("click");
    await flushPromises();

    expect(
      wrapper.get('[data-test="accordion-trigger-/first.ts"]').attributes("aria-expanded")
    ).toBe("true");
    expect(
      wrapper.get('[data-test="accordion-trigger-/second.ts"]').attributes("aria-expanded")
    ).toBe("true");

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
    expect(monacoMocks.createDiffEditor).toHaveBeenCalledTimes(2);

    await wrapper.get('[data-test="accordion-trigger-/first.ts"]').trigger("click");
    await flushPromises();

    expect(wrapper.findAll('[data-test="turn-file-change-diff-editor"]')).toHaveLength(2);
    expect(monacoMocks.createDiffEditor).toHaveBeenCalledTimes(2);
    expect(monacoMocks.cleanupEditor).not.toHaveBeenCalled();

    await wrapper.get('[data-test="accordion-trigger-/first.ts"]').trigger("click");
    await wrapper.get('[data-test="accordion-trigger-/first.ts"]').trigger("click");
    await flushPromises();

    expect(monacoMocks.createDiffEditor).toHaveBeenCalledTimes(2);
    expect(monacoMocks.cleanupEditor).not.toHaveBeenCalled();
    expect(
      wrapper.get('[data-test="turn-file-change-diff-editor"][data-path="/first.ts"]')
    ).toBeTruthy();
  });

  it("preserves open paths during streaming and keeps new paths collapsed", async () => {
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
    expect(monacoMocks.updateDiff).toHaveBeenCalledWith("a0", "a2", "typescript");
    expect(monacoMocks.updateDiff).toHaveBeenCalledWith("b0", "b2", "typescript");
    expect(monacoMocks.createDiffEditor).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      "",
      "c1",
      "typescript"
    );

    controller.setChanges([]);
    await flushPromises();
    expect(wrapper.get('[data-test="turn-file-change-empty"]').text()).toContain(
      "本轮没有净文件变更"
    );
  });

  it("follows theme changes in every file panel", async () => {
    mountReview([change("/a.ts"), change("/b.ts")]);
    await flushPromises();

    expect(monacoMocks.setTheme).toHaveBeenCalledTimes(2);
    expect(monacoMocks.setTheme).toHaveBeenCalledWith("vitesse-light");

    colorModeMock.current!.value = "dark";
    await flushPromises();

    expect(monacoMocks.setTheme).toHaveBeenCalledTimes(4);
    expect(monacoMocks.setTheme).toHaveBeenLastCalledWith("vitesse-dark");
  });

  it("cleans every file editor and the controller when closed", async () => {
    const { controller, wrapper } = mountReview([change("/a.ts"), change("/b.ts")]);
    await flushPromises();

    await wrapper.get('[aria-label="关闭本轮文件变更"]').trigger("click");
    await flushPromises();

    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(controller.changes.value).toEqual([]);
    expect(monacoMocks.cleanupEditor).toHaveBeenCalledTimes(2);

    wrapper.unmount();
    expect(monacoMocks.cleanupEditor).toHaveBeenCalledTimes(2);
  });

  it("detects language from modified content and creates a read-only editor", async () => {
    mountReview([change("/new.ts", "added", "", "export const value = 1;")]);
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
  });
});
