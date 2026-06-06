import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useIntegrationProvidersStore } from "@renderer/stores/integration.providers";
import { integrationApi } from "@renderer/api/integration";

vi.mock("@renderer/api/integration", () => ({
  integrationApi: {
    listProviders: vi.fn(),
    connectProvider: vi.fn(),
    disconnectProvider: vi.fn(),
    probeProvider: vi.fn(),
    listProviderResources: vi.fn(),
    getProjectIntegration: vi.fn(),
    setProjectIntegration: vi.fn(),
  },
}));

describe("useIntegrationProvidersStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("loads providers and filters by search query", async () => {
    vi.mocked(integrationApi.listProviders).mockResolvedValue({
      ok: true,
      data: [
        {
          id: "yunxiao",
          name: "云效",
          description: "研发平台",
          authType: "api-token",
          credentialFields: [],
          capabilities: [
            {
              stage: "project-management",
              resourceType: "projex-project",
              label: "Projex 项目",
              description: "任务来源",
            },
          ],
          logoIcon: "icon",
          logoColor: "text-primary",
          comingSoon: false,
          connection: null,
        },
      ],
    });

    const store = useIntegrationProvidersStore();
    await store.loadProviders();
    expect(store.providers).toHaveLength(1);

    store.setSearchQuery("云效");
    expect(store.filteredProviders).toHaveLength(1);
    store.setSearchQuery("GitHub");
    expect(store.filteredProviders).toHaveLength(0);
  });

  it("persists project integration stage updates", async () => {
    vi.mocked(integrationApi.setProjectIntegration).mockResolvedValue({
      ok: true,
      data: {
        "project-management": [
          {
            providerId: "yunxiao",
            resourceType: "projex-project",
            resourceId: "proj-1",
          },
        ],
        "source-control": [],
        "ci-cd": [],
        deployment: [],
        communication: [],
        observability: [],
      },
    });

    const store = useIntegrationProvidersStore();
    await store.saveProjectIntegrationStage("project-1", "project-management", [
      {
        providerId: "yunxiao",
        resourceType: "projex-project",
        resourceId: "proj-1",
      },
    ]);

    expect(store.projectIntegration?.["project-management"]).toHaveLength(1);
  });

  it("loads provider resources into keyed cache", async () => {
    vi.mocked(integrationApi.listProviderResources).mockResolvedValue({
      ok: true,
      data: [
        {
          id: "repo-1",
          name: "Repo One",
          providerId: "yunxiao",
          resourceType: "codeup-repo",
        },
      ],
    });

    const store = useIntegrationProvidersStore();
    const resources = await store.loadProviderResources("yunxiao", "codeup-repo", { perPage: 20 });

    expect(resources).toHaveLength(1);
    expect(store.resourceOptions["yunxiao:codeup-repo"]).toHaveLength(1);
  });
});
