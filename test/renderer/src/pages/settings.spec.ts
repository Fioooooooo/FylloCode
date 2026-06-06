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

const settingsAboutStub = {
  template: '<div data-test="settings-about">about</div>',
};

const settingsIntegrationProvidersStub = {
  template: '<div data-test="settings-integration-providers">integration providers</div>',
};

function mountSettingsPage(): ReturnType<typeof mount> {
  return mount(SettingsPage, {
    global: {
      stubs: {
        SettingsAgents: settingsAgentsStub,
        SettingsAbout: settingsAboutStub,
        SettingsPreferences: settingsPreferencesStub,
        SettingsIntegrationProviders: settingsIntegrationProvidersStub,
      },
    },
  });
}

describe("settings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    route.query = {};
  });

  it("renders the about tab from query", async () => {
    route.query = {
      tab: "about",
      focus: "yunxiao",
    };

    const wrapper = mountSettingsPage();

    await nextTick();

    expect(wrapper.find('[data-test="settings-about"]').exists()).toBe(true);
  });

  it("preserves focus query when switching to about", async () => {
    route.query = {
      tab: "integration-providers",
      focus: "yunxiao",
    };

    const wrapper = mountSettingsPage();

    const aboutButton = wrapper.findAll("button").find((button) => button.text().includes("About"));

    expect(aboutButton).toBeTruthy();
    await aboutButton!.trigger("click");

    expect(replaceMock).toHaveBeenCalledWith({
      path: "/settings",
      query: {
        tab: "about",
        focus: "yunxiao",
      },
    });
  });
});
