import { flushPromises, mount } from "@vue/test-utils";
import { shallowRef } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProposalDetailSlideover from "@renderer/components/proposal/ProposalDetailSlideover.vue";
import { proposalApi } from "@renderer/api/proposal";
import type { ApplyRunMeta, ProposalMeta, ProposalSpecDeltaOverview } from "@shared/types/proposal";

const mocks = vi.hoisted(() => ({
  loadProposals: vi.fn(),
  fetchTemplates: vi.fn().mockResolvedValue(undefined),
  startRun: vi.fn(),
  startArchive: vi.fn(),
  resumeRun: vi.fn(),
  resumeArchive: vi.fn().mockResolvedValue(false),
}));

const proposalsValue = shallowRef<ProposalMeta[]>([]);
let proposalStoreErrorValue: string | null = null;
let runMetaValue: ApplyRunMeta | null = null;
let isStreamingValue = false;
let messagesValue: unknown[] = [];

vi.mock("@renderer/api/proposal", () => ({
  proposalApi: {
    readFile: vi.fn(),
    getSpecDeltas: vi.fn(),
  },
}));

vi.mock("@renderer/stores/project", () => ({
  useProjectStore: () => ({
    currentProject: { id: "project-1" },
  }),
}));

vi.mock("@renderer/stores/proposal", () => ({
  useProposalStore: () => ({
    get proposals() {
      return proposalsValue.value;
    },
    get error() {
      return proposalStoreErrorValue;
    },
    loadProposals: mocks.loadProposals,
  }),
}));

vi.mock("@renderer/stores/workflow", () => ({
  useWorkflowStore: () => ({
    customTemplates: [{ id: "workflow-1", name: "Workflow 1" }],
    isLoading: false,
    fetchTemplates: mocks.fetchTemplates,
  }),
}));

vi.mock("@renderer/stores/proposal-run", () => ({
  useProposalRunStore: () => ({
    get runMeta() {
      return runMetaValue;
    },
    get messages() {
      return messagesValue;
    },
    get isStreaming() {
      return isStreamingValue;
    },
    startRun: mocks.startRun,
    startArchive: mocks.startArchive,
    resumeRun: mocks.resumeRun,
    resumeArchive: mocks.resumeArchive,
  }),
}));

function buildProposal(overrides: Partial<ProposalMeta> = {}): ProposalMeta {
  return {
    id: "change-1",
    title: "Change 1",
    status: "draft",
    why: "why",
    totalTasks: 2,
    doneTasks: 1,
    hasDesign: true,
    date: "2026-06-12",
    ...overrides,
  };
}

function specOverview(): ProposalSpecDeltaOverview {
  return {
    items: [
      {
        id: "proposal-detail",
        purpose: "Show proposal delta",
        sourcePath: "specs/proposal-detail/spec.md",
        deltaTypes: ["ADDED", "REMOVED"],
        requirementsCount: 2,
        scenariosCount: 1,
        requirementGroups: [
          {
            deltaType: "ADDED",
            title: "Show specs tab",
            body: "The detail shows specs delta.",
            scenarios: [{ title: "Specs exist", body: "- **THEN** show Specs" }],
          },
          {
            deltaType: "REMOVED",
            title: "Legacy detail route",
            body: "**Reason**: route removed",
            scenarios: [],
          },
        ],
      },
      {
        id: "app-shell-routing",
        purpose: "Shared route shell",
        sourcePath: "specs/app-shell-routing/spec.md",
        deltaTypes: ["MODIFIED"],
        requirementsCount: 1,
        scenariosCount: 1,
        requirementGroups: [
          {
            deltaType: "MODIFIED",
            title: "Shared app shell",
            body: "Routes use the shared shell.",
            scenarios: [{ title: "Route renders", body: "- **WHEN** route opens" }],
          },
        ],
      },
    ],
  };
}

function mockSuccessfulReads(): void {
  vi.mocked(proposalApi.readFile).mockImplementation(async (_projectId, changeId, filename) => ({
    ok: true,
    data: filename === "design.md" ? null : `# ${filename} for ${changeId}`,
  }));
  vi.mocked(proposalApi.getSpecDeltas).mockResolvedValue({ ok: true, data: specOverview() });
}

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function mountSlideover(changeId = "change-1") {
  return mount(ProposalDetailSlideover, {
    props: { changeId },
    global: {
      stubs: {
        MarkStream: {
          template: '<div data-test="markstream">{{ content }}</div>',
          props: ["content"],
        },
        ChatMessageList: true,
      },
    },
  });
}

describe("ProposalDetailSlideover", () => {
  beforeEach(() => {
    mocks.loadProposals.mockReset();
    mocks.fetchTemplates.mockReset();
    mocks.startRun.mockReset();
    mocks.startArchive.mockReset();
    mocks.resumeRun.mockReset();
    mocks.resumeArchive.mockReset();
    vi.mocked(proposalApi.readFile).mockReset();
    vi.mocked(proposalApi.getSpecDeltas).mockReset();

    mocks.loadProposals.mockResolvedValue(undefined);
    mocks.fetchTemplates.mockResolvedValue(undefined);
    mocks.resumeArchive.mockResolvedValue(false);
    proposalsValue.value = [buildProposal()];
    proposalStoreErrorValue = null;
    runMetaValue = null;
    isStreamingValue = false;
    messagesValue = [];
    mockSuccessfulReads();
  });

  it("emits close when the header close button is clicked", async () => {
    const wrapper = mountSlideover();
    await flushPromises();

    await wrapper.get('button[aria-label="关闭 proposal 详情"]').trigger("click");

    expect(wrapper.emitted("close")?.length).toBe(1);
  });

  it("refreshes proposal metadata on open and updates task count from the store", async () => {
    const load = deferred();
    proposalsValue.value = [buildProposal({ doneTasks: 1, totalTasks: 2 })];
    mocks.loadProposals.mockImplementation(async () => {
      await load.promise;
      proposalsValue.value = [buildProposal({ doneTasks: 2, totalTasks: 3 })];
    });

    const wrapper = mountSlideover();
    await wrapper.vm.$nextTick();

    expect(mocks.loadProposals).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("1/2 tasks");

    load.resolve();
    await flushPromises();

    expect(wrapper.text()).toContain("2/3 tasks");
  });

  it("shows a metadata refresh icon while proposals are loading", async () => {
    const load = deferred();
    mocks.loadProposals.mockImplementation(() => load.promise);

    const wrapper = mountSlideover();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="proposal-meta-refreshing"]').exists()).toBe(true);

    load.resolve();
    await flushPromises();

    expect(wrapper.find('[data-test="proposal-meta-refreshing"]').exists()).toBe(false);
  });

  it("keeps the previous header metadata when background proposal refresh fails", async () => {
    proposalsValue.value = [buildProposal({ doneTasks: 1, totalTasks: 2 })];
    mocks.loadProposals.mockImplementation(async () => {
      proposalsValue.value = [];
      proposalStoreErrorValue = "refresh failed";
      throw new Error("refresh failed");
    });

    const wrapper = mountSlideover();
    await flushPromises();

    expect(wrapper.text()).toContain("Change 1");
    expect(wrapper.text()).toContain("1/2 tasks");
    expect(wrapper.find('[data-test="proposal-meta-refreshing"]').exists()).toBe(false);
    expect(proposalApi.readFile).toHaveBeenCalledWith("project-1", "change-1", "proposal.md");
    expect(proposalApi.getSpecDeltas).toHaveBeenCalledWith("project-1", "change-1");
  });

  it("renders Specs tab with proposal capability deltas", async () => {
    const wrapper = mountSlideover();
    await flushPromises();

    await wrapper.get('[data-test="tab-specs"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("proposal-detail");
    expect(wrapper.text()).toContain("app-shell-routing");
    expect(wrapper.text()).toContain("2 个能力规约");
    expect(wrapper.text()).not.toContain("Show specs tab");
    expect(wrapper.text()).not.toContain("Legacy detail route");
    expect(wrapper.text()).not.toContain("Shared app shell");
    expect(wrapper.text()).toContain("新增");
    expect(wrapper.text()).toContain("移除");
    expect(wrapper.get('[data-test="proposal-markdown-body"]').classes()).toContain("max-w-3xl");
    expect(wrapper.findAll('[data-test="proposal-specs-capability"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-test="proposal-specs-capability-body"]')).toHaveLength(0);
    expect(wrapper.find('[data-test="proposal-specs-delta-reader"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="proposal-specs-delta-list"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="proposal-specs-requirement-index"]').exists()).toBe(false);

    await wrapper.findAll('[data-test="proposal-specs-capability-toggle"]')[0].trigger("click");

    expect(wrapper.text()).toContain("Show specs tab");
    expect(wrapper.text()).toContain("Legacy detail route");
    expect(wrapper.findAll('[data-test="proposal-specs-capability-body"]')).toHaveLength(1);

    await wrapper.findAll('[data-test="proposal-specs-capability-toggle"]')[1].trigger("click");

    expect(wrapper.text()).toContain("Shared app shell");
    expect(wrapper.findAll('[data-test="proposal-specs-capability-body"]')).toHaveLength(2);
  });

  it("shows Specs error without hiding markdown tabs", async () => {
    vi.mocked(proposalApi.getSpecDeltas).mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN_ERROR", message: "specs failed" },
    });

    const wrapper = mountSlideover();
    await flushPromises();

    expect(wrapper.find('[data-test="tab-proposal"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="tab-specs"]').exists()).toBe(true);

    await wrapper.get('[data-test="tab-specs"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Specs 变更加载失败");
    expect(wrapper.text()).toContain("specs failed");
  });

  it("updates current change id after archive and reloads detail files", async () => {
    proposalsValue.value = [
      buildProposal({
        status: "applying",
      }),
    ];
    runMetaValue = {
      runId: "run-1",
      changeId: "change-1",
      workflowId: "workflow-1",
      stages: [],
      currentStageIndex: 0,
      stageAcpSessionIds: {},
      status: "done",
      startedAt: "2026-06-12T00:00:00.000Z",
      updatedAt: "2026-06-12T00:00:00.000Z",
    };
    mocks.startArchive.mockImplementation(async () => {
      proposalsValue.value = [buildProposal({ id: "2026-06-22-change-1", status: "archived" })];
    });

    const wrapper = mountSlideover();
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("归档"))
      ?.trigger("click");
    await flushPromises();

    expect(mocks.startArchive).toHaveBeenCalledWith("project-1", "change-1");
    expect(mocks.loadProposals).toHaveBeenCalled();
    expect(proposalApi.readFile).toHaveBeenCalledWith(
      "project-1",
      "2026-06-22-change-1",
      "proposal.md"
    );
    expect(proposalApi.getSpecDeltas).toHaveBeenCalledWith("project-1", "2026-06-22-change-1");
  });
});
