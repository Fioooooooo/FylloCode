import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { specsApi } from "@renderer/api/insight/specs";
import SpecsPage from "@renderer/pages/specs.vue";
import { useWorkspaceStore } from "@renderer/stores/workspace/workspace";
import type { WorkspaceInfo } from "@shared/types/workspace";
import { workspaceInfo } from "../fixtures/workspace";
import type { SpecsBrowserOverview } from "@shared/types/specs";

vi.mock("@renderer/api/insight/specs", () => ({
  specsApi: {
    getSpecsBrowser: vi.fn(),
  },
}));

const markStreamStub = {
  props: ["content"],
  template: '<div data-test="markstream">{{ content }}</div>',
};

const alertStub = {
  props: ["title", "description"],
  template: '<div data-test="specs-error-alert">{{ title }} {{ description }}</div>',
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

function specsOverview(): SpecsBrowserOverview {
  const primary = {
    id: "project-overview",
    ref: { folderId: "folder-a", specId: "project-overview" },
    folderName: "Repository A",
    purpose: "定义主仓库项目概览页的数据聚合。",
    sourcePath: "openspec/specs/project-overview/spec.md",
    updatedAt: "2026-06-20T10:00:00.000Z",
    requirementsCount: 2,
    scenariosCount: 3,
    requirementGroups: [
      {
        title: "概览数据聚合通道",
        body: "系统 SHALL 提供 `insight:overview:getProjectOverview` IPC 通道。",
        scenarios: [
          {
            title: "成功返回完整概览",
            body: "- **WHEN** renderer 调用 IPC\n- **THEN** 返回完整概览",
          },
          {
            title: "workspaceId 无法解析",
            body: "- **WHEN** workspaceId 无效\n- **THEN** 返回错误",
          },
        ],
      },
      {
        title: "仓库统计取数口径",
        body: "系统 SHALL 通过文件系统扫描计算 stats。",
        scenarios: [
          {
            title: "标准项目结构",
            body: "- **WHEN** openspec/specs 存在\n- **THEN** 返回计数",
          },
        ],
      },
    ],
  };
  const secondary = {
    id: "project-overview",
    ref: { folderId: "folder-b", specId: "project-overview" },
    folderName: "Repository B",
    purpose: "定义次仓库的同名项目概览。",
    sourcePath: "openspec/specs/project-overview/spec.md",
    updatedAt: "2026-06-21T11:00:00.000Z",
    requirementsCount: 1,
    scenariosCount: 1,
    requirementGroups: [
      {
        title: "次仓库同名能力",
        body: "系统 SHALL 保留 owner identity。",
        scenarios: [
          {
            title: "同名能力选择",
            body: "- **WHEN** 用户选择次仓库\n- **THEN** 显示次仓库详情",
          },
        ],
      },
    ],
  };

  return {
    folders: [
      {
        folderId: "folder-a",
        folderName: "Repository A",
        folderPath: "/repos/a",
        isPrimary: true,
        status: "ready",
        items: [primary],
        warnings: [],
      },
      {
        folderId: "folder-b",
        folderName: "Repository B",
        folderPath: "/repos/b",
        isPrimary: false,
        status: "ready",
        items: [secondary],
        warnings: [],
      },
    ],
    items: [primary, secondary],
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

  return mount(SpecsPage, {
    attachTo: target,
    global: {
      plugins: [pinia],
      stubs: {
        MarkStream: markStreamStub,
        UAlert: alertStub,
      },
    },
  });
}

describe("specs page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders loading state while specs data is pending", async () => {
    vi.mocked(specsApi.getSpecsBrowser).mockReturnValue(new Promise(() => undefined));

    const wrapper = mountPage();
    await wrapper.vm.$nextTick();

    expect(specsApi.getSpecsBrowser).toHaveBeenCalledWith("project-1");
    expect(wrapper.text()).toContain("Specs");
    expect(wrapper.text()).toContain("当前项目的 OpenSpec 能力规约。");
    expect(wrapper.find('[data-test="specs-loading-skeleton"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="specs-detail-loading"]').exists()).toBe(true);
  });

  it("renders capability list, selected detail, requirement index, and scenario timeline", async () => {
    vi.mocked(specsApi.getSpecsBrowser).mockResolvedValue({
      ok: true,
      data: specsOverview(),
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.findAll('[data-test="specs-list-item"]')).toHaveLength(2);
    expect(wrapper.text()).toContain("project-overview");
    expect(wrapper.text()).toContain("定义主仓库项目概览页的数据聚合。");
    expect(wrapper.text()).toContain("openspec/specs/project-overview/spec.md");
    expect(wrapper.text()).toContain("需求");
    expect(wrapper.text()).toContain("2");
    expect(wrapper.text()).toContain("场景");
    expect(wrapper.text()).toContain("3");
    expect(wrapper.findAll('[data-test="specs-requirement-index-item"]')).toHaveLength(2);
    expect(wrapper.text()).toContain("概览数据聚合通道");
    expect(wrapper.text()).toContain(
      "系统 SHALL 提供 `insight:overview:getProjectOverview` IPC 通道。"
    );
    expect(wrapper.findAll('[data-test="specs-scenario"]')).toHaveLength(3);
    expect(wrapper.text()).toContain("成功返回完整概览");
    expect(wrapper.text()).toContain("- **WHEN** renderer 调用 IPC");

    const firstScenarioHeader = wrapper.get('[data-test="specs-scenario"] > div');
    expect(firstScenarioHeader.element.children[0]?.textContent).toBe("#1");
    expect(firstScenarioHeader.element.children[1]?.textContent).toBe("成功返回完整概览");
  });

  it("uses the complete SpecRef to select a same-name capability from another Folder", async () => {
    vi.mocked(specsApi.getSpecsBrowser).mockResolvedValue({
      ok: true,
      data: specsOverview(),
    });

    const wrapper = mountPage();
    await flushPromises();

    await wrapper.findAll('[data-test="specs-list-item"]')[1].trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("定义次仓库的同名项目概览。");
    expect(wrapper.text()).toContain("次仓库同名能力");
    expect(wrapper.text()).toContain("Repository B");
    expect(wrapper.findAll('[data-test="specs-requirement-index-item"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-test="specs-scenario"]')).toHaveLength(1);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("filters by Folder and distinguishes partial error state from ready data", async () => {
    const overview = specsOverview();
    const failedFolder = overview.folders[1];
    failedFolder.status = "error";
    failedFolder.items = [];
    failedFolder.error = "permission denied";
    overview.items = [overview.items[0]];
    overview.completeness = "partial";
    overview.excludedFolderIds = ["folder-b"];
    vi.mocked(specsApi.getSpecsBrowser).mockResolvedValue({ ok: true, data: overview });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('[data-test="specs-partial-alert"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("部分 Folder 未计入");
    expect(wrapper.get('[aria-label="Repository B：错误"]').attributes("aria-label")).toBe(
      "Repository B：错误"
    );
    expect(wrapper.findAll('[data-test="specs-list-item"]')).toHaveLength(1);

    await wrapper.get('[data-test="specs-folder-filter"]').setValue("folder-b");
    await flushPromises();

    expect(wrapper.find('[data-test="specs-list"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Folder 读取失败");
    expect(wrapper.text()).toContain("permission denied");
  });

  it("rejects a late response from the previous Workspace and clears its filter", async () => {
    let resolveFirst!: (value: Awaited<ReturnType<typeof specsApi.getSpecsBrowser>>) => void;
    let resolveSecond!: (value: Awaited<ReturnType<typeof specsApi.getSpecsBrowser>>) => void;
    vi.mocked(specsApi.getSpecsBrowser)
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

    const current = specsOverview();
    current.items[0].purpose = "当前 Workspace 数据";
    current.folders[0].items[0].purpose = "当前 Workspace 数据";
    resolveSecond({ ok: true, data: current });
    await flushPromises();

    const stale = specsOverview();
    stale.items[0].purpose = "旧 Workspace 迟到数据";
    stale.folders[0].items[0].purpose = "旧 Workspace 迟到数据";
    resolveFirst({ ok: true, data: stale });
    await flushPromises();

    expect(wrapper.text()).toContain("当前 Workspace 数据");
    expect(wrapper.text()).not.toContain("旧 Workspace 迟到数据");
    expect(specsApi.getSpecsBrowser).toHaveBeenNthCalledWith(2, "project-2");
  });

  it("renders empty state when the project has no specs", async () => {
    vi.mocked(specsApi.getSpecsBrowser).mockResolvedValue({
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

    expect(wrapper.find('[data-test="specs-empty-state"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("暂无能力规约");
  });

  it("renders error state when loading fails", async () => {
    vi.mocked(specsApi.getSpecsBrowser).mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN_ERROR", message: "specs failed" },
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('[data-test="specs-error-alert"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("能力规约加载失败");
    expect(wrapper.text()).toContain("specs failed");
  });
});
