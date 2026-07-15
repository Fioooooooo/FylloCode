import { createPinia, setActivePinia } from "pinia";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectInfo } from "@shared/types/project";

const mocks = vi.hoisted(() => ({
  getBrowser: vi.fn(),
  readEntry: vi.fn(),
  saveEntry: vi.fn(),
  deleteEntry: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("@renderer/api/insight/knowledge", () => ({
  knowledgeApi: {
    getBrowser: mocks.getBrowser,
    readEntry: mocks.readEntry,
    saveEntry: mocks.saveEntry,
    deleteEntry: mocks.deleteEntry,
  },
}));

vi.mock("@renderer/composables/useConfirmDialog", () => ({
  useConfirmDialog: () => mocks.confirm,
}));

vi.mock("@renderer/components/shared/MarkStream.vue", () => ({
  default: {
    name: "MarkStream",
    props: ["content", "enableActions"],
    template: '<div data-test="markstream-stub">{{ content }}</div>',
  },
}));

import KnowledgePage from "@renderer/pages/knowledge.vue";
import { useProjectStore } from "@renderer/stores/workspace/project";

const project = {
  id: "project-1",
  name: "Project",
  path: "/tmp/project",
  metaPath: "/tmp/project.json",
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  lastOpenedAt: new Date("2026-07-01T00:00:00.000Z"),
  pathMissing: false,
} satisfies ProjectInfo;

const firstEntry = {
  name: "first-entry",
  description: "First",
  type: "project" as const,
  updatedAt: "2026-07-03T00:00:00.000Z",
  status: "suspect" as const,
};

const secondEntry = {
  name: "second-entry",
  description: "Second",
  type: "project" as const,
  updatedAt: "2026-07-02T00:00:00.000Z",
  status: "active" as const,
};

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const projectStore = useProjectStore();
  projectStore.$patch({ currentProject: project });
  return mount(KnowledgePage, { global: { plugins: [pinia] } });
}

describe("knowledge page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBrowser.mockResolvedValue({
      ok: true,
      data: { entries: [firstEntry, secondEntry], errors: [] },
    });
    mocks.readEntry.mockImplementation((_projectId: string, input: { name: string }) =>
      Promise.resolve({
        ok: true,
        data: { name: input.name, content: `---\nname: ${input.name}\n---\n\nBody` },
      })
    );
    mocks.deleteEntry.mockResolvedValue({ ok: true, data: { name: "first-entry" } });
    mocks.confirm.mockResolvedValue(false);
  });

  it("loads the index, selects the first item and renders wrapped frontmatter", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(mocks.getBrowser).toHaveBeenCalledWith("project-1");
    expect(mocks.readEntry).toHaveBeenCalledWith("project-1", { name: "first-entry" });
    expect(wrapper.text()).toContain("浏览、核查当前项目已沉淀的知识。");
    expect(wrapper.get('[data-test="markstream-stub"]').text()).toContain("```yaml");
    expect(wrapper.get('[data-test="markstream-stub"]').text()).toContain("name: first-entry");
  });

  it("does not delete when destructive confirmation is cancelled", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('[data-test="knowledge-delete-button"]').trigger("click");
    await flushPromises();

    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ confirmLabel: "删除知识", confirmColor: "error" })
    );
    expect(mocks.deleteEntry).not.toHaveBeenCalled();
  });

  it("ignores a stale detail response after selecting another item", async () => {
    const firstResponse = deferred<{
      ok: true;
      data: { name: string; content: string };
    }>();
    mocks.readEntry.mockImplementation((_projectId: string, input: { name: string }) => {
      if (input.name === "first-entry") {
        return firstResponse.promise;
      }
      return Promise.resolve({
        ok: true,
        data: { name: input.name, content: `---\nname: ${input.name}\n---\n\nSecond body` },
      });
    });
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('[data-name="second-entry"]').trigger("click");
    await flushPromises();
    firstResponse.resolve({
      ok: true,
      data: { name: "first-entry", content: "---\nname: first-entry\n---\n\nStale body" },
    });
    await flushPromises();

    expect(wrapper.get('[data-test="markstream-stub"]').text()).toContain("Second body");
    expect(wrapper.get('[data-test="markstream-stub"]').text()).not.toContain("Stale body");
  });

  it("refreshes and selects the next item after confirmed deletion", async () => {
    mocks.confirm.mockResolvedValue(true);
    mocks.getBrowser
      .mockResolvedValueOnce({
        ok: true,
        data: { entries: [firstEntry, secondEntry], errors: [] },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { entries: [secondEntry], errors: [] },
      });
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('[data-test="knowledge-delete-button"]').trigger("click");
    await flushPromises();

    expect(mocks.deleteEntry).toHaveBeenCalledWith("project-1", { name: "first-entry" });
    expect(mocks.readEntry).toHaveBeenLastCalledWith("project-1", { name: "second-entry" });
    expect(wrapper.text()).toContain("second-entry");
  });

  it("keeps the current selection and shows a retryable deletion error", async () => {
    mocks.confirm.mockResolvedValue(true);
    mocks.deleteEntry.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN_ERROR", message: "Delete failed" },
    });
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('[data-test="knowledge-delete-button"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("first-entry");
    expect(wrapper.text()).toContain("Delete failed，请重试。");
  });

  it("shows a page-level browser error without selecting stale content", async () => {
    mocks.getBrowser.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN_ERROR", message: "Scanner unavailable" },
    });
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.get('[data-test="knowledge-browser-error"]').text()).toContain(
      "Scanner unavailable"
    );
    expect(mocks.readEntry).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="knowledge-page-empty"]').exists()).toBe(true);
  });
});
