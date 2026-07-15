import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lineageApi } from "@renderer/api/insight/lineage";
import LineagePage from "@renderer/pages/lineage.vue";
import { useProjectStore } from "@renderer/stores";
import type { LineageBrowserData } from "@shared/types/lineage";
import type { ProjectInfo } from "@shared/types/project";

const routerMock = vi.hoisted(() => ({ push: vi.fn() }));
const sessionMock = vi.hoisted(() => ({ openChatSession: vi.fn() }));
const proposalMock = vi.hoisted(() => ({ openProposalDetail: vi.fn() }));
const toastMock = vi.hoisted(() => ({ add: vi.fn() }));

vi.mock("@renderer/api/insight/lineage", () => ({
  lineageApi: {
    getBrowser: vi.fn(),
    ensureTaskSubject: vi.fn(),
    linkTaskSession: vi.fn(),
    getByTask: vi.fn(),
    getBySession: vi.fn(),
    createSessionTask: vi.fn(),
    readPlan: vi.fn(),
    savePlanBody: vi.fn(),
    approvePlan: vi.fn(),
  },
}));

vi.mock("vue-router", () => ({
  useRouter: () => routerMock,
}));

vi.mock("@renderer/composables/useOpenChatSession", () => ({
  useOpenChatSession: () => sessionMock,
}));

vi.mock("@renderer/composables/useProposalDetailSlideover", () => ({
  useProposalDetailSlideover: () => proposalMock,
}));

vi.mock("@nuxt/ui/composables", () => ({
  useToast: () => toastMock,
}));

function project(id = "project-1"): ProjectInfo {
  return {
    id,
    name: id,
    path: `/tmp/${id}`,
    metaPath: `/tmp/${id}.json`,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    lastOpenedAt: new Date("2026-07-15T00:00:00.000Z"),
  };
}

function browserData(): LineageBrowserData {
  const taskSnapshot = {
    id: "task-1",
    projectId: "project-1",
    title: "实现 Lineage 浏览器",
    description: { format: "markdown" as const, content: "串联讨论、计划、提案与提交。" },
    status: "open" as const,
    source: "local" as const,
    sourceMeta: { source: "local" as const },
    labels: [],
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-15T00:00:00.000Z"),
  };

  return {
    entries: [
      {
        subjectId: "subject-applying",
        origin: "task",
        task: {
          ref: "local:task-1",
          snapshot: taskSnapshot,
          capturedAt: "2026-07-01T00:00:00.000Z",
        },
        status: "applying",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-15T00:00:00.000Z",
        sessions: [
          {
            sessionId: "session-1",
            title: "Lineage 页面讨论",
            agentId: "codex",
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-15T00:00:00.000Z",
            plans: [
              {
                slug: "2026-07-15-lineage-page",
                createdAt: "2026-07-10T00:00:00.000Z",
                goal: "实现工作脉络浏览页面",
                status: "approved",
              },
              {
                slug: "missing-plan",
                createdAt: "2026-07-10T00:00:00.000Z",
                goal: null,
                status: null,
              },
            ],
            proposals: [
              {
                changeId: "add-lineage-browser-page",
                createdAt: "2026-07-12T00:00:00.000Z",
                commitHash: "abcdef1234567890",
                title: "Add Lineage Browser Page",
                status: "applying",
              },
              {
                changeId: "missing-proposal",
                createdAt: "2026-07-12T00:00:00.000Z",
                commitHash: null,
                title: null,
                status: null,
              },
            ],
          },
          {
            sessionId: "session-discussion",
            title: "补充讨论",
            agentId: null,
            createdAt: "2026-07-02T00:00:00.000Z",
            updatedAt: "2026-07-02T00:00:00.000Z",
            plans: [],
            proposals: [],
          },
        ],
      },
      {
        subjectId: "subject-planned",
        origin: "task",
        task: {
          ref: "local:task-2",
          snapshot: { ...taskSnapshot, id: "task-2", title: "已规划工作" },
          capturedAt: "2026-07-02T00:00:00.000Z",
        },
        status: "planned",
        createdAt: "2026-07-02T00:00:00.000Z",
        updatedAt: "2026-07-14T00:00:00.000Z",
        sessions: [],
      },
      {
        subjectId: "subject-completed",
        origin: "task",
        task: {
          ref: "local:task-3",
          snapshot: { ...taskSnapshot, id: "task-3", title: "已归档工作" },
          capturedAt: "2026-07-03T00:00:00.000Z",
        },
        status: "completed",
        createdAt: "2026-07-03T00:00:00.000Z",
        updatedAt: "2026-07-13T00:00:00.000Z",
        sessions: [],
      },
      {
        subjectId: "subject-unlinked",
        origin: "chat",
        task: null,
        status: "discussion",
        createdAt: "2026-07-04T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z",
        sessions: [
          {
            sessionId: "session-unlinked",
            title: "自由讨论",
            agentId: null,
            createdAt: "2026-07-04T00:00:00.000Z",
            updatedAt: "2026-07-12T00:00:00.000Z",
            plans: [],
            proposals: [],
          },
        ],
      },
    ],
  };
}

function mountPage(currentProject: ProjectInfo | null = project()) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useProjectStore().currentProject = currentProject;
  return mount(LineagePage, { global: { plugins: [pinia] } });
}

describe("lineage page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(lineageApi.getBrowser).mockResolvedValue({ ok: true, data: browserData() });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("loads the current project and renders session-grouped real browser data", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(lineageApi.getBrowser).toHaveBeenCalledWith("project-1");
    expect(wrapper.findAll('[data-test="lineage-list-item"]')).toHaveLength(4);
    expect(wrapper.findAll('[data-test="lineage-session"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-test="lineage-plan"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-test="lineage-proposal"]')).toHaveLength(2);
    expect(wrapper.get('[data-test="lineage-discussion-only"]').text()).toContain("只有讨论记录");
    expect(wrapper.text()).toContain("Plan 文档不可用");
    expect(wrapper.text()).toContain("missing-proposal");
    expect(wrapper.findAll('[data-test="lineage-proposal"]')[1]!.attributes("disabled")).toBe("");
    expect(wrapper.find('input[type="search"]').exists()).toBe(false);
  });

  it("applies all four filters and falls back to the first visible selection", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('[data-test="lineage-filter-completed"]').trigger("click");
    expect(wrapper.findAll('[data-test="lineage-list-item"]')).toHaveLength(1);
    expect(wrapper.get('[data-test="lineage-detail"]').text()).toContain("已归档工作");

    await wrapper.get('[data-test="lineage-filter-active"]').trigger("click");
    expect(wrapper.findAll('[data-test="lineage-list-item"]')).toHaveLength(3);
    expect(wrapper.get('[data-test="lineage-detail"]').text()).toContain("实现 Lineage 浏览器");

    await wrapper.get('[data-test="lineage-filter-unlinked"]').trigger("click");
    expect(wrapper.findAll('[data-test="lineage-list-item"]')).toHaveLength(1);
    expect(wrapper.get('[data-test="lineage-detail"]').text()).toContain("自由讨论");

    await wrapper.get('[data-test="lineage-filter-all"]').trigger("click");
    expect(wrapper.findAll('[data-test="lineage-list-item"]')).toHaveLength(4);
  });

  it("opens linked resources, navigates to tasks, and copies commit hashes", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('[data-test="lineage-open-task"]').trigger("click");
    await wrapper.findAll('[data-test="lineage-open-session"]')[0]!.trigger("click");
    await wrapper.findAll('[data-test="lineage-proposal"]')[0]!.trigger("click");
    await wrapper.get('[data-test="lineage-commit"]').trigger("click");
    await flushPromises();

    expect(routerMock.push).toHaveBeenCalledWith("/task");
    expect(sessionMock.openChatSession).toHaveBeenCalledWith("session-1");
    expect(proposalMock.openProposalDetail).toHaveBeenCalledWith("add-lineage-browser-page");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("abcdef1234567890");
    expect(toastMock.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Commit hash 已复制", color: "success" })
    );

    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("denied"));
    await wrapper.get('[data-test="lineage-commit"]').trigger("click");
    await flushPromises();
    expect(toastMock.add).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Commit hash 复制失败", color: "error" })
    );
  });

  it("isolates project switches and clears data when no project remains", async () => {
    const wrapper = mountPage();
    await flushPromises();

    const projectStore = useProjectStore();
    projectStore.currentProject = project("project-2");
    await flushPromises();
    expect(lineageApi.getBrowser).toHaveBeenLastCalledWith("project-2");

    projectStore.currentProject = null;
    await flushPromises();
    expect(wrapper.find('[data-test="lineage-empty"]').exists()).toBe(true);
  });

  it("renders loading, page error, empty, and filtered-empty states", async () => {
    vi.mocked(lineageApi.getBrowser).mockReturnValueOnce(new Promise(() => undefined));
    const loadingWrapper = mountPage();
    await loadingWrapper.vm.$nextTick();
    expect(loadingWrapper.find('[data-test="lineage-loading"]').exists()).toBe(true);
    loadingWrapper.unmount();

    vi.mocked(lineageApi.getBrowser).mockResolvedValueOnce({
      ok: false,
      error: { code: "UNKNOWN_ERROR", message: "lineage failed" },
    });
    const errorWrapper = mountPage();
    await flushPromises();
    expect(errorWrapper.get('[data-test="lineage-error"]').text()).toContain("lineage failed");
    errorWrapper.unmount();

    vi.mocked(lineageApi.getBrowser).mockResolvedValueOnce({ ok: true, data: { entries: [] } });
    const emptyWrapper = mountPage();
    await flushPromises();
    expect(emptyWrapper.find('[data-test="lineage-empty"]').exists()).toBe(true);
    emptyWrapper.unmount();

    const filteredWrapper = mountPage();
    await flushPromises();
    await filteredWrapper.get('[data-test="lineage-filter-completed"]').trigger("click");
    vi.mocked(lineageApi.getBrowser).mockResolvedValueOnce({
      ok: true,
      data: { entries: browserData().entries.filter((entry) => entry.status !== "completed") },
    });
    useProjectStore().currentProject = project("project-filtered");
    await flushPromises();
    await filteredWrapper.get('[data-test="lineage-filter-completed"]').trigger("click");
    expect(filteredWrapper.find('[data-test="lineage-filter-empty"]').exists()).toBe(true);
  });
});
