import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guidelinesApi } from "@renderer/api/guidelines";
import GuidelinesPage from "@renderer/pages/guidelines.vue";
import { useProjectStore } from "@renderer/stores/project";
import type { GuidelinesBrowserOverview } from "@shared/types/guidelines";
import type { ProjectInfo } from "@shared/types/project";

vi.mock("@renderer/api/guidelines", () => ({
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

function guidelinesOverview(): GuidelinesBrowserOverview {
  return {
    items: [
      {
        path: "guidelines/Architecture.md",
        name: "Architecture",
        description: "Top-level process boundaries.",
        keywords: ["architecture", "electron"],
        updatedAt: "2026-06-20T10:00:00.000Z",
        content: "# Architecture\n\nKeep process boundaries explicit.",
      },
      {
        path: "guidelines/frontend/Routing.md",
        name: "Routing",
        description: null,
        keywords: ["frontend"],
        updatedAt: "2026-06-21T11:00:00.000Z",
        content: "# Routing\n\nPages live under `src/renderer/src/pages`.",
        parseError: "bad frontmatter",
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

  it("selects another guideline from the left list and surfaces parse error", async () => {
    vi.mocked(guidelinesApi.getBrowser).mockResolvedValue({
      ok: true,
      data: guidelinesOverview(),
    });

    const wrapper = mountPage();
    await flushPromises();

    await wrapper.findAll('[data-test="guidelines-list-item"]')[1].trigger("click");
    await flushPromises();

    const selectedListItem = wrapper.findAll('[data-test="guidelines-list-item"]')[1];
    expect(selectedListItem.text()).toContain("Routing.md");
    expect(selectedListItem.text()).not.toContain("未声明 description");
    expect(selectedListItem.text()).not.toContain("guidelines/frontend/Routing.md");
    expect(wrapper.text()).toContain("Routing");
    expect(wrapper.text()).toContain("未声明 description");
    expect(wrapper.text()).toContain("guidelines/frontend/Routing.md");
    expect(wrapper.find('[data-test="guidelines-parse-error"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("bad frontmatter");
    expect(wrapper.find('[data-test="guidelines-markdown"]').text()).toContain(
      "Pages live under `src/renderer/src/pages`."
    );
  });

  it("renders empty state when the project has no guidelines", async () => {
    vi.mocked(guidelinesApi.getBrowser).mockResolvedValue({
      ok: true,
      data: { items: [] },
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
    vi.mocked(guidelinesApi.getBrowser).mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            path: "guidelines/Empty.md",
            name: "Empty",
            description: null,
            keywords: null,
            updatedAt: "2026-06-20T10:00:00.000Z",
            content: "",
          },
        ],
      },
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('[data-test="guidelines-content-empty-state"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("暂无正文");
  });
});
