import { mount } from "@vue/test-utils";
import { nextTick, reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "@renderer/pages/settings.vue";

const replaceMock = vi.fn();
const route = reactive<{ query: Record<string, string | undefined> }>({
  query: {},
});

vi.mock("vue-router", () => ({
  useRoute: () => route,
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

const settingsAgentsStub = {
  template: '<div data-test="settings-agents">agents</div>',
};

const settingsPreferencesStub = {
  template: '<div data-test="settings-preferences">preferences</div>',
};

const settingsIntegrationProvidersStub = {
  template: '<div data-test="settings-integration-providers">integration providers</div>',
};

describe("settings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    route.query = {};
  });

  it("renders the integration providers tab from query", async () => {
    route.query = {
      tab: "integration-providers",
      focus: "yunxiao",
    };

    const wrapper = mount(SettingsPage, {
      global: {
        stubs: {
          SettingsAgents: settingsAgentsStub,
          SettingsPreferences: settingsPreferencesStub,
          SettingsIntegrationProviders: settingsIntegrationProvidersStub,
        },
      },
    });

    await nextTick();

    expect(wrapper.find('[data-test="settings-integration-providers"]').exists()).toBe(true);
  });

  it("preserves focus query when switching tabs", async () => {
    route.query = {
      tab: "integration-providers",
      focus: "yunxiao",
    };

    const wrapper = mount(SettingsPage, {
      global: {
        stubs: {
          SettingsAgents: settingsAgentsStub,
          SettingsPreferences: settingsPreferencesStub,
          SettingsIntegrationProviders: settingsIntegrationProvidersStub,
        },
      },
    });

    const buttons = wrapper.findAll("button");
    await buttons[2].trigger("click");

    expect(replaceMock).toHaveBeenCalledWith({
      path: "/settings",
      query: {
        tab: "preferences",
        focus: "yunxiao",
      },
    });
  });
});
