import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { specsApi } from "@renderer/api/specs";
import SpecsPage from "@renderer/pages/specs.vue";
import { useProjectStore } from "@renderer/stores/project";
import type { ProjectInfo } from "@shared/types/project";
import type { SpecsBrowserOverview } from "@shared/types/specs";

vi.mock("@renderer/api/specs", () => ({
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

function project(): ProjectInfo {
  return {
    id: "project-1",
    name: "Project 1",
    path: "/tmp/project-1",
    metaPath: "/tmp/project-1.json",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    lastOpenedAt: new Date("2026-06-10T00:00:00.000Z"),
  };
}

function specsOverview(): SpecsBrowserOverview {
  return {
    items: [
      {
        id: "project-overview",
        purpose: "定义项目概览页的数据聚合。",
        sourcePath: "openspec/specs/project-overview/spec.md",
        updatedAt: "2026-06-20T10:00:00.000Z",
        requirementsCount: 2,
        scenariosCount: 3,
        requirementGroups: [
          {
            title: "概览数据聚合通道",
            body: "系统 SHALL 提供 `overview:getProjectOverview` IPC 通道。",
            scenarios: [
              {
                title: "成功返回完整概览",
                body: "- **WHEN** renderer 调用 IPC\n- **THEN** 返回完整概览",
              },
              {
                title: "projectId 无法解析",
                body: "- **WHEN** projectId 无效\n- **THEN** 返回错误",
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
      },
      {
        id: "chat-interface",
        purpose: "定义消息流渲染。",
        sourcePath: "openspec/specs/chat-interface/spec.md",
        updatedAt: "2026-06-21T11:00:00.000Z",
        requirementsCount: 1,
        scenariosCount: 1,
        requirementGroups: [
          {
            title: "Chat 区域显示可滚动的消息流",
            body: "系统 SHALL 渲染垂直滚动的消息序列。",
            scenarios: [
              {
                title: "消息流渲染",
                body: "- **WHEN** session 活跃\n- **THEN** 显示消息流",
              },
            ],
          },
        ],
      },
    ],
  };
}

function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  useProjectStore().currentProject = project();
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
    expect(wrapper.text()).toContain("浏览当前项目的 OpenSpec 能力规约。");
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
    expect(wrapper.text()).toContain("定义项目概览页的数据聚合。");
    expect(wrapper.text()).toContain("openspec/specs/project-overview/spec.md");
    expect(wrapper.text()).toContain("需求");
    expect(wrapper.text()).toContain("2");
    expect(wrapper.text()).toContain("场景");
    expect(wrapper.text()).toContain("3");
    expect(wrapper.findAll('[data-test="specs-requirement-index-item"]')).toHaveLength(2);
    expect(wrapper.text()).toContain("概览数据聚合通道");
    expect(wrapper.text()).toContain("系统 SHALL 提供 `overview:getProjectOverview` IPC 通道。");
    expect(wrapper.findAll('[data-test="specs-scenario"]')).toHaveLength(3);
    expect(wrapper.text()).toContain("成功返回完整概览");
    expect(wrapper.text()).toContain("- **WHEN** renderer 调用 IPC");

    const firstScenarioHeader = wrapper.get('[data-test="specs-scenario"] > div');
    expect(firstScenarioHeader.element.children[0]?.textContent).toBe("#1");
    expect(firstScenarioHeader.element.children[1]?.textContent).toBe("成功返回完整概览");
  });

  it("selects another capability from the left list", async () => {
    vi.mocked(specsApi.getSpecsBrowser).mockResolvedValue({
      ok: true,
      data: specsOverview(),
    });

    const wrapper = mountPage();
    await flushPromises();

    await wrapper.findAll('[data-test="specs-list-item"]')[1].trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("chat-interface");
    expect(wrapper.text()).toContain("Chat 区域显示可滚动的消息流");
    expect(wrapper.findAll('[data-test="specs-requirement-index-item"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-test="specs-scenario"]')).toHaveLength(1);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("renders empty state when the project has no specs", async () => {
    vi.mocked(specsApi.getSpecsBrowser).mockResolvedValue({
      ok: true,
      data: { items: [] },
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
