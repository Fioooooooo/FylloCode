import { flushPromises, mount } from "@vue/test-utils";
import { nextTick, reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsIntegrationProviders from "@renderer/pages/settings/connections.vue";
import { useIntegrationProvidersStore } from "@renderer/stores/platform/providers";

const route = reactive<{ query: Record<string, string | undefined> }>({
  query: {},
});

vi.mock("vue-router", () => ({
  useRoute: () => route,
}));

describe("SettingsIntegrationProviders", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    route.query = {};
  });

  it("scrolls to the focused provider when focus query is present", async () => {
    route.query = {
      focus: "yunxiao",
    };

    const store = useIntegrationProvidersStore();
    store.providers = [
      {
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
            description: "任务来源",
          },
        ],
        logoIcon: "icon",
        logoColor: "text-primary",
        comingSoon: false,
        connection: null,
      },
    ];

    vi.spyOn(store, "loadProviders").mockImplementation(async () => undefined);
    vi.spyOn(store, "probeConnectedProviders").mockImplementation(async () => undefined);

    const scrollIntoView = vi.fn();
    const getElementByIdSpy = vi
      .spyOn(document, "getElementById")
      .mockReturnValue({ scrollIntoView } as unknown as HTMLElement);

    mount(SettingsIntegrationProviders, {
      global: {
        stubs: {
          IntegrationProviderCard: {
            props: ["provider", "autofocus"],
            template: '<div :id="`provider-${provider.id}`">{{ provider.name }}</div>',
          },
        },
      },
    });

    await flushPromises();
    await nextTick();

    expect(getElementByIdSpy).toHaveBeenCalledWith("provider-yunxiao");
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });
});
