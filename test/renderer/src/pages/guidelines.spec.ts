import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guidelinesApi } from "@renderer/api/insight/guidelines";
import GuidelinesPage from "@renderer/pages/guidelines.vue";
import { useWorkspaceStore } from "@renderer/stores/workspace/workspace";
import type { GuidelinesBrowserOverview } from "@shared/types/guidelines";
import type { WorkspaceInfo } from "@shared/types/workspace";
import { workspaceInfo } from "../fixtures/workspace";

vi.mock("@renderer/api/insight/guidelines", () => ({
  guidelinesApi: {
    getBrowser: vi.fn(),
  },
}));

const markStreamStub = {
  props: ["content"],
  template: '<div data-test="markstream">{{ content }}</div>',
};

const alertStub = {
  props: ["title", "description"],
  template: '<div data-test="alert">{{ title }} {{ description }}</div>',
};

const badgeStub = {
  template: '<span data-test="badge"><slot /></span>',
};

function project(): WorkspaceInfo {
  return workspaceInfo({
    id: "project-1",
    name: "Project 1",
    folderPath: "/tmp/project-1",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    lastOpenedAt: new Date("2026-06-10T00:00:00.000Z"),
  });
}

function guidelinesOverview(): GuidelinesBrowserOverview {
  const architectureA = {
    ref: { folderId: "folder-a", path: "guidelines/Architecture.md" },
    folderName: "Repository A",
    path: "guidelines/Architecture.md",
    name: "Architecture A",
    description: "Top-level process boundaries.",
    keywords: ["architecture", "electron"],
    updatedAt: "2026-06-20T10:00:00.000Z",
    content: "# Architecture A\n\nKeep process boundaries explicit.",
  };
  const architectureB = {
    ref: { folderId: "folder-b", path: "guidelines/Architecture.md" },
    folderName: "Repository B",
    path: "guidelines/Architecture.md",
    name: "Architecture B",
    description: null,
    keywords: ["frontend"],
    updatedAt: "2026-06-21T11:00:00.000Z",
    content: "# Architecture B\n\nSecondary repository guidance.",
    parseError: "bad frontmatter",
  };

  return {
    folders: [
      {
        folderId: "folder-a",
        folderName: "Repository A",
        folderPath: "/repos/a",
        isPrimary: true,
        status: "ready",
        items: [architectureA],
        warnings: [],
      },
      {
        folderId: "folder-b",
        folderName: "Repository B",
        folderPath: "/repos/b",
        isPrimary: false,
        status: "ready",
        items: [architectureB],
        warnings: [{ message: "bad frontmatter", itemPath: "guidelines/Architecture.md" }],
      },
    ],
    items: [architectureA, architectureB],
    completeness: "complete",
    excludedFolderIds: [],
  };
}

function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  useWorkspaceStore().currentWorkspace = project();
  const target = document.createElement("div");
  document.body.appendChild(target);

  return mount(GuidelinesPage, {
    attachTo: target,
    global: {
      plugins: [pinia],
      stubs: {
        MarkStream: markStreamStub,
        UAlert: alertStub,
        UBadge: badgeStub,
      },
    },
  });
}

describe("guidelines page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders loading state while guidelines data is pending", async () => {
    vi.mocked(guidelinesApi.getBrowser).mockReturnValue(new Promise(() => undefined));

    const wrapper = mountPage();
    await wrapper.vm.$nextTick();

    expect(guidelinesApi.getBrowser).toHaveBeenCalledWith("project-1");
    expect(wrapper.find('[data-test="guidelines-loading-skeleton"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="guidelines-detail-loading"]').exists()).toBe(true);
  });

  it("renders guideline list, default detail, keywords, and markdown content", async () => {
    vi.mocked(guidelinesApi.getBrowser).mockResolvedValue({
      ok: true,
      data: guidelinesOverview(),
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.findAll('[data-test="guidelines-list-item"]')).toHaveLength(2);
    const firstListItem = wrapper.findAll('[data-test="guidelines-list-item"]')[0];
    expect(firstListItem.text()).toContain("Architecture.md");
    expect(firstListItem.text()).not.toContain("Top-level process boundaries.");
    expect(firstListItem.text()).not.toContain("guidelines/Architecture.md");
    expect(wrapper.text()).toContain("Top-level process boundaries.");
    expect(wrapper.text()).toContain("guidelines/Architecture.md");
    expect(wrapper.text()).toContain("architecture");
    expect(wrapper.text()).toContain("electron");
    expect(wrapper.find('[data-test="guidelines-markdown"]').text()).toContain(
      "Keep process boundaries explicit."
    );
    expect(wrapper.text()).not.toContain("创建");
    expect(wrapper.text()).not.toContain("删除");
  });

  it("uses the complete GuidelineRef to select a same-path guideline from another Folder", async () => {
    vi.mocked(guidelinesApi.getBrowser).mockResolvedValue({
      ok: true,
      data: guidelinesOverview(),
    });

    const wrapper = mountPage();
    await flushPromises();

    await wrapper.findAll('[data-test="guidelines-list-item"]')[1].trigger("click");
    await flushPromises();

    const selectedListItem = wrapper.findAll('[data-test="guidelines-list-item"]')[1];
    expect(selectedListItem.text()).toContain("Architecture.md");
    expect(selectedListItem.text()).not.toContain("未声明 description");
    expect(wrapper.text()).toContain("Architecture B");
    expect(wrapper.text()).toContain("Repository B");
    expect(wrapper.text()).toContain("未声明 description");
    expect(wrapper.text()).toContain("guidelines/Architecture.md");
    expect(wrapper.find('[data-test="guidelines-parse-error"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("bad frontmatter");
    expect(wrapper.find('[data-test="guidelines-markdown"]').text()).toContain(
      "Secondary repository guidance."
    );
  });

  it("filters by Folder and distinguishes partial missing state from ready data", async () => {
    const overview = guidelinesOverview();
    const missingFolder = overview.folders[1];
    missingFolder.status = "missing";
    missingFolder.items = [];
    overview.items = [overview.items[0]];
    overview.completeness = "partial";
    overview.excludedFolderIds = ["folder-b"];
    vi.mocked(guidelinesApi.getBrowser).mockResolvedValue({ ok: true, data: overview });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('[data-test="guidelines-partial-alert"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("部分 Folder 未计入");
    expect(wrapper.get('[aria-label="Repository B：缺失"]').attributes("aria-label")).toBe(
      "Repository B：缺失"
    );
    expect(wrapper.findAll('[data-test="guidelines-list-item"]')).toHaveLength(1);

    await wrapper.get('[data-test="guidelines-folder-filter"]').setValue("folder-b");
    await flushPromises();

    expect(wrapper.find('[data-test="guidelines-list"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Folder 不可用");
    expect(wrapper.text()).toContain("Repository B 当前不存在");
  });

  it("rejects a late response from the previous Workspace and clears its filter", async () => {
    let resolveFirst!: (value: Awaited<ReturnType<typeof guidelinesApi.getBrowser>>) => void;
    let resolveSecond!: (value: Awaited<ReturnType<typeof guidelinesApi.getBrowser>>) => void;
    vi.mocked(guidelinesApi.getBrowser)
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockReturnValueOnce(new Promise((resolve) => (resolveSecond = resolve)));

    const wrapper = mountPage();
    await wrapper.vm.$nextTick();
    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = workspaceInfo({
      id: "project-2",
      name: "Project 2",
      folderPath: "/tmp/project-2",
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      lastOpenedAt: new Date("2026-06-10T00:00:00.000Z"),
    });
    await wrapper.vm.$nextTick();

    const current = guidelinesOverview();
    current.items[0].content = "当前 Workspace 准则";
    current.folders[0].items[0].content = "当前 Workspace 准则";
    resolveSecond({ ok: true, data: current });
    await flushPromises();

    const stale = guidelinesOverview();
    stale.items[0].content = "旧 Workspace 迟到准则";
    stale.folders[0].items[0].content = "旧 Workspace 迟到准则";
    resolveFirst({ ok: true, data: stale });
    await flushPromises();

    expect(wrapper.text()).toContain("当前 Workspace 准则");
    expect(wrapper.text()).not.toContain("旧 Workspace 迟到准则");
    expect(guidelinesApi.getBrowser).toHaveBeenNthCalledWith(2, "project-2");
  });

  it("renders empty state when the project has no guidelines", async () => {
    vi.mocked(guidelinesApi.getBrowser).mockResolvedValue({
      ok: true,
      data: {
        folders: [
          {
            folderId: "folder-a",
            folderName: "Repository A",
            folderPath: "/repos/a",
            isPrimary: true,
            status: "ready",
            items: [],
            warnings: [],
          },
        ],
        items: [],
        completeness: "complete",
        excludedFolderIds: [],
      },
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('[data-test="guidelines-empty-state"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("暂无项目准则");
  });

  it("renders error state when loading fails", async () => {
    vi.mocked(guidelinesApi.getBrowser).mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN_ERROR", message: "guidelines failed" },
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('[data-test="guidelines-error-alert"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("项目准则加载失败");
    expect(wrapper.text()).toContain("guidelines failed");
  });

  it("renders content empty state when selected guideline has no body", async () => {
    const emptyGuideline = {
      ref: { folderId: "folder-a", path: "guidelines/Empty.md" },
      folderName: "Repository A",
      path: "guidelines/Empty.md",
      name: "Empty",
      description: null,
      keywords: null,
      updatedAt: "2026-06-20T10:00:00.000Z",
      content: "",
    };
    vi.mocked(guidelinesApi.getBrowser).mockResolvedValue({
      ok: true,
      data: {
        folders: [
          {
            folderId: "folder-a",
            folderName: "Repository A",
            folderPath: "/repos/a",
            isPrimary: true,
            status: "ready",
            items: [emptyGuideline],
            warnings: [],
          },
        ],
        items: [emptyGuideline],
        completeness: "complete",
        excludedFolderIds: [],
      },
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('[data-test="guidelines-content-empty-state"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("暂无正文");
  });
});
