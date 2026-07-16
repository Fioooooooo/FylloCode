import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "@renderer/pages/settings.vue";

const route = reactive<{
  path: string;
  query: Record<string, string | undefined>;
}>({
  path: "/settings/acp-agents",
  query: {},
});

vi.mock("vue-router", () => ({
  useRoute: () => route,
}));

const routerLinkStub = {
  props: ["to"],
  template: '<a :data-to="to"><slot /></a>',
};

function mountSettingsPage(): ReturnType<typeof mount> {
  return mount(SettingsPage, {
    global: {
      stubs: {
        RouterLink: routerLinkStub,
        RouterView: { template: '<div data-test="settings-router-view" />' },
      },
    },
  });
}

describe("settings page", () => {
  beforeEach(() => {
    route.path = "/settings/acp-agents";
    route.query = {};
  });

  it("renders shared navigation and the child route outlet", () => {
    const wrapper = mountSettingsPage();

    const navigationItems = wrapper.findAll('[data-test^="settings-nav-"]');
    expect(
      navigationItems.map((item) => ({
        id: item.attributes("data-test"),
        label: item.text().trim(),
        path: item.attributes("data-to"),
      }))
    ).toEqual([
      {
        id: "settings-nav-preferences",
        label: "偏好设置",
        path: "/settings/preferences",
      },
      {
        id: "settings-nav-agents",
        label: "Agents",
        path: "/settings/acp-agents",
      },
      {
        id: "settings-nav-connections",
        label: "服务连接",
        path: "/settings/connections",
      },
      { id: "settings-nav-about", label: "关于我们", path: "/settings/about" },
    ]);
    expect(wrapper.find('[data-test="settings-route-content"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="settings-router-view"]').exists()).toBe(true);
  });

  it("derives the active item from the child route", async () => {
    route.path = "/settings/connections";
    const wrapper = mountSettingsPage();
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[data-test="settings-nav-connections"]').classes()).toContain(
      "bg-primary/15"
    );
    expect(wrapper.get('[data-test="settings-nav-agents"]').classes()).not.toContain(
      "bg-primary/15"
    );
  });

  it("ignores the legacy tab query when selecting the active item", () => {
    route.path = "/settings/acp-agents";
    route.query = { tab: "about" };
    const wrapper = mountSettingsPage();

    expect(wrapper.get('[data-test="settings-nav-agents"]').classes()).toContain("bg-primary/15");
    expect(wrapper.get('[data-test="settings-nav-about"]').classes()).not.toContain(
      "bg-primary/15"
    );
  });
});
