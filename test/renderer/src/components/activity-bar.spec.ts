import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import ActivityBar from "@renderer/components/layout/ActivityBar.vue";
import { activityBarItems } from "@renderer/config/activity-bar";

const mockPath = ref("/task");
const tooltipStub = {
  props: ["text", "content", "disableHoverableContent", "ignoreNonKeyboardFocus"],
  template:
    '<div data-test="activity-bar-tooltip" :data-disable-hoverable-content="String(disableHoverableContent)" :data-ignore-non-keyboard-focus="String(ignoreNonKeyboardFocus)"><slot /></div>',
};

function mountActivityBar() {
  return mount(ActivityBar, {
    global: {
      stubs: {
        UTooltip: tooltipStub,
        Tooltip: tooltipStub,
      },
    },
  });
}

vi.mock("vue-router", () => ({
  useRoute: () => ({
    path: mockPath.value,
  }),
}));

vi.mock("@renderer/stores/project", () => ({
  useProjectStore: () => ({
    hasCurrentProject: true,
  }),
}));

describe("ActivityBar", () => {
  it("renders the brand icon and all registered item buttons", () => {
    const wrapper = mountActivityBar();
    const buttons = wrapper.findAll("button");
    const brandIcon = wrapper.get('[data-test="activity-bar-brand-icon"]');

    expect(buttons).toHaveLength(activityBarItems.length);
    expect(brandIcon.attributes("src")).toContain("icon.svg");

    for (const item of activityBarItems) {
      expect(wrapper.find(`[data-test="activity-bar-item-${item.id}"]`).exists()).toBe(true);
    }
  });

  it("highlights the item matching current route", async () => {
    mockPath.value = "/chat";
    const wrapper = mountActivityBar();
    await wrapper.vm.$nextTick();

    const activeButtons = wrapper.findAll('button[class*="bg-primary/15"]');

    expect(activeButtons).toHaveLength(1);
    expect(activeButtons[0].attributes("to")).toBe("/chat");
  });

  it("returns null for unmatched routes", async () => {
    mockPath.value = "/unknown-route";
    const wrapper = mountActivityBar();
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('button[class*="bg-primary/15"]')).toHaveLength(0);
  });

  it("does not render or highlight the proposal entry", async () => {
    mockPath.value = "/proposal";
    const wrapper = mountActivityBar();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="activity-bar-item-proposal"]').exists()).toBe(false);
    expect(wrapper.findAll('button[class*="bg-primary/15"]')).toHaveLength(0);
  });

  it("renders three sections with settings separated at the bottom", () => {
    const wrapper = mountActivityBar();

    expect(wrapper.find('[data-test="activity-bar-brand"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="activity-bar-menu"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="activity-bar-settings"]').exists()).toBe(true);

    const menuButtons = wrapper.find('[data-test="activity-bar-menu"]').findAll("button");
    const settingsButtons = wrapper.find('[data-test="activity-bar-settings"]').findAll("button");

    expect(menuButtons).toHaveLength(
      activityBarItems.filter((item) => item.group === "top").length
    );
    expect(settingsButtons).toHaveLength(
      activityBarItems.filter((item) => item.group === "bottom").length
    );
  });

  it("keeps tooltip hover behavior scoped to activity bar items", () => {
    const wrapper = mountActivityBar();

    const tooltips = wrapper.findAll('[data-test="activity-bar-tooltip"]');
    expect(tooltips).toHaveLength(activityBarItems.length);
    for (const tooltip of tooltips) {
      expect(tooltip.attributes("data-disable-hoverable-content")).toBe("true");
      expect(tooltip.attributes("data-ignore-non-keyboard-focus")).toBe("true");
    }
  });

  it("renders the dev badge when in development mode", () => {
    const wrapper = mountActivityBar();

    const badge = wrapper.find('[data-test="activity-bar-dev-badge"]');
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toBe("DEV");
  });

  it("does not render the dev badge when not in development mode", async () => {
    vi.stubEnv("DEV", false);
    vi.resetModules();

    const { default: ActivityBarProd } =
      await import("@renderer/components/layout/ActivityBar.vue");
    const wrapper = mount(ActivityBarProd, {
      global: {
        stubs: {
          UTooltip: tooltipStub,
          Tooltip: tooltipStub,
        },
      },
    });

    expect(wrapper.find('[data-test="activity-bar-dev-badge"]').exists()).toBe(false);

    vi.unstubAllEnvs();
  });
});
