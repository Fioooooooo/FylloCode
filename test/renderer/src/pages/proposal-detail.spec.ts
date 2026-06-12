import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProposalDetailPage from "@renderer/pages/proposal/[id].vue";
import type { ProposalMeta } from "@shared/types/proposal";

const routerMock = vi.hoisted(() => ({
  router: {
    options: {
      history: {
        state: {
          back: "/overview" as string | null,
        },
      },
    },
    back: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
  },
}));

const workflowStoreMock = vi.hoisted(() => ({
  customTemplates: [],
  isLoading: false,
  fetchTemplates: vi.fn().mockResolvedValue(undefined),
}));

const proposalRunStoreMock = vi.hoisted(() => ({
  runMeta: null,
  messages: [],
  isStreaming: false,
  startRun: vi.fn(),
  startArchive: vi.fn(),
  resumeRun: vi.fn(),
  resumeArchive: vi.fn().mockResolvedValue(false),
}));

const proposalMeta: ProposalMeta = {
  id: "change-1",
  title: "Change 1",
  status: "draft",
  why: "why",
  totalTasks: 2,
  doneTasks: 1,
  hasDesign: true,
  date: "2026-06-12",
};

vi.mock("vue-router", () => ({
  useRoute: () => ({
    params: { id: "change-1" },
  }),
  useRouter: () => routerMock.router,
}));

vi.mock("@renderer/stores/project", () => ({
  useProjectStore: () => ({
    currentProject: null,
  }),
}));

vi.mock("@renderer/stores/proposal", () => ({
  useProposalStore: () => ({
    proposals: [proposalMeta],
    loadProposals: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@renderer/stores/workflow", () => ({
  useWorkflowStore: () => workflowStoreMock,
}));

vi.mock("@renderer/stores/proposal-run", () => ({
  useProposalRunStore: () => proposalRunStoreMock,
}));

function mountPage() {
  return mount(ProposalDetailPage);
}

describe("proposal detail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerMock.router.options.history.state.back = "/overview";
  });

  it("goes back when route history has a previous entry", async () => {
    const wrapper = mountPage();

    await wrapper.get("button").trigger("click");

    expect(routerMock.router.back).toHaveBeenCalledTimes(1);
    expect(routerMock.router.replace).not.toHaveBeenCalled();
  });

  it("replaces to overview when route history has no previous entry", async () => {
    routerMock.router.options.history.state.back = null;
    const wrapper = mountPage();

    await wrapper.get("button").trigger("click");

    expect(routerMock.router.back).not.toHaveBeenCalled();
    expect(routerMock.router.replace).toHaveBeenCalledWith("/overview");
  });
});
