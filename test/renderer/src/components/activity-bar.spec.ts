import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import ActivityBar from "@renderer/components/layout/ActivityBar.vue";
import { activityBarItems } from "@renderer/config/activity-bar";

const mockPath = ref("/task");

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
    const wrapper = mount(ActivityBar);
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
    const wrapper = mount(ActivityBar);
    await wrapper.vm.$nextTick();

    const activeButtons = wrapper.findAll('button[class*="bg-primary/15"]');

    expect(activeButtons).toHaveLength(1);
    expect(activeButtons[0].attributes("to")).toBe("/chat");
  });

  it("returns null for unmatched routes", async () => {
    mockPath.value = "/unknown-route";
    const wrapper = mount(ActivityBar);
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('button[class*="bg-primary/15"]')).toHaveLength(0);
  });

  it("does not render or highlight the proposal entry", async () => {
    mockPath.value = "/proposal";
    const wrapper = mount(ActivityBar);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="activity-bar-item-proposal"]').exists()).toBe(false);
    expect(wrapper.findAll('button[class*="bg-primary/15"]')).toHaveLength(0);
  });

  it("renders three sections with settings separated at the bottom", () => {
    const wrapper = mount(ActivityBar);

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
});
