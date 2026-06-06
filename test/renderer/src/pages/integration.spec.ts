import { flushPromises, mount } from "@vue/test-utils";
import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import IntegrationPage from "@renderer/pages/integration.vue";

const loadProvidersMock = vi.fn();
const loadProjectIntegrationMock = vi.fn();
const setSearchQueryMock = vi.fn();

const integrationProvidersStore = {
  categories: [
    {
      id: "project-management",
      name: "项目管理",
      description: "管理任务。",
    },
    {
      id: "source-control",
      name: "源代码控制",
      description: "管理仓库。",
    },
  ],
  filteredProviders: [
    {
      id: "yunxiao",
      name: "云效",
    },
  ],
  searchQuery: "",
  loadProviders: loadProvidersMock,
  loadProjectIntegration: loadProjectIntegrationMock,
  setSearchQuery: setSearchQueryMock,
};

const projectStore = reactive<{
  currentProject: { id: string } | null;
}>({
  currentProject: {
    id: "project-1",
  },
});

vi.mock("@renderer/stores/project", () => ({
  useProjectStore: () => projectStore,
}));

vi.mock("@renderer/stores/integration.providers", () => ({
  useIntegrationProvidersStore: () => integrationProvidersStore,
}));

const providerStageSectionStub = {
  props: ["category", "providers", "currentProjectId"],
  template:
    '<div :data-test="`stage-${category.id}`">{{ category.name }}|{{ providers.length }}|{{ currentProjectId }}</div>',
};

describe("integration page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    integrationProvidersStore.searchQuery = "";
    projectStore.currentProject = { id: "project-1" };
  });

  it("loads providers and project integration on mount", async () => {
    const wrapper = mount(IntegrationPage, {
      global: {
        stubs: {
          ProviderStageSection: providerStageSectionStub,
        },
      },
    });

    await flushPromises();

    expect(loadProvidersMock).toHaveBeenCalledTimes(1);
    expect(loadProjectIntegrationMock).toHaveBeenCalledWith("project-1");
    expect(wrapper.get('[data-test="stage-project-management"]').text()).toContain("project-1");
  });

  it("filters providers by search input", async () => {
    const wrapper = mount(IntegrationPage, {
      global: {
        stubs: {
          ProviderStageSection: providerStageSectionStub,
        },
      },
    });

    await wrapper.get("input").setValue("云效");
    expect(setSearchQueryMock).toHaveBeenCalledWith("云效");
  });

  it("shows empty state when no project is open", async () => {
    projectStore.currentProject = null;

    const wrapper = mount(IntegrationPage, {
      global: {
        stubs: {
          ProviderStageSection: providerStageSectionStub,
        },
      },
    });

    await flushPromises();

    expect(loadProjectIntegrationMock).toHaveBeenCalledWith("");
    expect(wrapper.text()).toContain("请先打开一个项目");
  });

  it("loads project integration when the current project becomes available after mount", async () => {
    projectStore.currentProject = null;

    mount(IntegrationPage, {
      global: {
        stubs: {
          ProviderStageSection: providerStageSectionStub,
        },
      },
    });

    await flushPromises();
    expect(loadProjectIntegrationMock).toHaveBeenCalledWith("");

    projectStore.currentProject = { id: "project-late" };
    await flushPromises();

    expect(loadProjectIntegrationMock).toHaveBeenCalledWith("project-late");
  });
});
