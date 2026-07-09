import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProviderStageSection from "@renderer/components/integration/ProviderStageSection.vue";
import { useIntegrationProvidersStore } from "@renderer/stores/platform/providers";
import type {
  IntegrationCategory,
  ProjectIntegrationConfig,
  Provider,
  ProviderResource,
} from "@shared/types/integration";

const pushMock = vi.fn();

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

const category: IntegrationCategory = {
  id: "project-management",
  name: "项目管理",
  description: "管理项目任务与协作。",
};

const provider: Provider = {
  id: "yunxiao",
  name: "云效",
  description: "企业研发平台",
  authType: "api-token",
  credentialFields: [],
  capabilities: [
    {
      stage: "project-management",
      resourceType: "projex-project",
      label: "Projex 项目",
      description: "选择项目作为任务来源。",
    },
  ],
  logoIcon: "i-lucide-cloud",
  logoColor: "text-primary",
  comingSoon: false,
};

function createEmptyProjectIntegration(): ProjectIntegrationConfig {
  return {
    "project-management": [],
    "source-control": [],
    "ci-cd": [],
    deployment: [],
    communication: [],
    observability: [],
  };
}

describe("ProviderStageSection", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("supports selecting resources and removing mounted resources", async () => {
    const store = useIntegrationProvidersStore();
    store.providers = [
      {
        ...provider,
        connection: {
          providerId: "yunxiao",
          state: "connected",
          accountName: "demo@example.com",
        },
      },
    ];
    store.projectIntegration = {
      ...createEmptyProjectIntegration(),
      "project-management": [
        {
          providerId: "yunxiao",
          resourceType: "projex-project",
          resourceId: "proj-existing",
        },
      ],
    };

    const saveSpy = vi
      .spyOn(store, "saveProjectIntegrationStage")
      .mockImplementation(async (_projectId, stage, resources) => {
        store.projectIntegration = {
          ...(store.projectIntegration ?? createEmptyProjectIntegration()),
          [stage]: resources,
        };
      });
    vi.spyOn(store, "loadProviderResources").mockImplementation(async () => {
      const resources: ProviderResource[] = [
        {
          id: "proj-existing",
          name: "Existing",
          providerId: "yunxiao",
          resourceType: "projex-project",
        },
        {
          id: "proj-new",
          name: "New Project",
          providerId: "yunxiao",
          resourceType: "projex-project",
          subtitle: "Hangzhou",
        },
      ];
      store.resourceOptions["yunxiao:projex-project"] = resources;
      return resources;
    });

    const wrapper = mount(ProviderStageSection, {
      props: {
        category,
        providers: store.providers,
        currentProjectId: "project-1",
      },
    });

    await wrapper.get('[data-test="toggle-provider-yunxiao"]').trigger("click");
    await wrapper.get('[data-test="open-picker-yunxiao-projex-project"]').trigger("click");
    await flushPromises();

    const newProjectCheckbox = wrapper.get(
      '[data-test="resource-option-yunxiao-projex-project-proj-new"] input'
    ).element as HTMLInputElement;
    newProjectCheckbox.checked = true;
    await wrapper
      .get('[data-test="resource-option-yunxiao-projex-project-proj-new"] input')
      .trigger("change");
    await wrapper.get('[data-test="confirm-picker-yunxiao-projex-project"]').trigger("click");
    await flushPromises();

    expect(saveSpy).toHaveBeenCalledWith("project-1", "project-management", [
      {
        providerId: "yunxiao",
        resourceType: "projex-project",
        resourceId: "proj-existing",
      },
      {
        providerId: "yunxiao",
        resourceType: "projex-project",
        resourceId: "proj-new",
      },
    ]);
    expect(store.projectIntegration?.["project-management"]).toEqual([
      {
        providerId: "yunxiao",
        resourceType: "projex-project",
        resourceId: "proj-existing",
      },
      {
        providerId: "yunxiao",
        resourceType: "projex-project",
        resourceId: "proj-new",
      },
    ]);

    await wrapper
      .get('[data-test="remove-resource-yunxiao-projex-project-proj-existing"]')
      .trigger("click");
    await flushPromises();

    expect(saveSpy).toHaveBeenLastCalledWith("project-1", "project-management", [
      {
        providerId: "yunxiao",
        resourceType: "projex-project",
        resourceId: "proj-new",
      },
    ]);
  });

  it("lets connected providers open resource picking before any resource is mounted", async () => {
    const store = useIntegrationProvidersStore();
    store.providers = [
      {
        ...provider,
        connection: {
          providerId: "yunxiao",
          state: "connected",
          accountName: "demo@example.com",
        },
      },
    ];
    store.projectIntegration = createEmptyProjectIntegration();

    vi.spyOn(store, "loadProviderResources").mockImplementation(async () => {
      const resources: ProviderResource[] = [
        {
          id: "proj-first",
          name: "First Project",
          providerId: "yunxiao",
          resourceType: "projex-project",
        },
      ];
      store.resourceOptions["yunxiao:projex-project"] = resources;
      return resources;
    });

    const wrapper = mount(ProviderStageSection, {
      props: {
        category,
        providers: store.providers,
        currentProjectId: "project-1",
      },
    });

    expect(wrapper.find('[data-test="provider-card-yunxiao"]').exists()).toBe(true);

    await wrapper.get('[data-test="add-provider-yunxiao"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-test="resource-picker-yunxiao-projex-project"]').exists()).toBe(
      true
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("guides unconnected providers to settings", async () => {
    const store = useIntegrationProvidersStore();
    store.providers = [
      {
        ...provider,
        connection: null,
      },
    ];
    store.projectIntegration = {
      ...createEmptyProjectIntegration(),
      "project-management": [
        {
          providerId: "yunxiao",
          resourceType: "projex-project",
          resourceId: "proj-existing",
        },
      ],
    };

    const wrapper = mount(ProviderStageSection, {
      props: {
        category,
        providers: store.providers,
        currentProjectId: "project-1",
      },
    });

    await wrapper.get('[data-test="toggle-provider-yunxiao"]').trigger("click");
    expect(wrapper.text()).toContain("请前往设置页面完成连接或重新连接");

    const buttons = wrapper.findAll("button");
    await buttons[2].trigger("click");

    expect(pushMock).toHaveBeenCalledWith({
      path: "/settings",
      query: {
        tab: "integration-providers",
        focus: "yunxiao",
      },
    });
  });

  it("sends not-connected providers to settings from add provider entry", async () => {
    const store = useIntegrationProvidersStore();
    store.providers = [
      {
        ...provider,
        connection: null,
      },
    ];
    store.projectIntegration = createEmptyProjectIntegration();

    const wrapper = mount(ProviderStageSection, {
      props: {
        category,
        providers: store.providers,
        currentProjectId: "project-1",
      },
    });

    await wrapper.get('[data-test="add-provider-yunxiao"]').trigger("click");

    expect(pushMock).toHaveBeenCalledWith({
      path: "/settings",
      query: {
        tab: "integration-providers",
        focus: "yunxiao",
      },
    });
  });
});
