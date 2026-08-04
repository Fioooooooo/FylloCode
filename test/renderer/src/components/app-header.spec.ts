import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref, type Ref } from "vue";
import AppHeader from "@renderer/components/layout/AppHeader.vue";

const appApiMocks = vi.hoisted(() => ({
  openDevTools: vi.fn(),
}));

const colorModeMock = vi.hoisted(() => ({
  current: null as Ref<string> | null,
}));

vi.mock("@renderer/api/platform/app", () => ({
  appApi: {
    openDevTools: appApiMocks.openDevTools,
  },
}));

vi.mock("@vueuse/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vueuse/core")>()),
  useColorMode: () => colorModeMock.current,
}));

const tooltipStub = {
  props: ["text", "disableHoverableContent", "ignoreNonKeyboardFocus"],
  template:
    '<div data-test="app-header-tooltip" :data-text="text" :data-disable-hoverable-content="String(disableHoverableContent)" :data-ignore-non-keyboard-focus="String(ignoreNonKeyboardFocus)"><slot /></div>',
};

function mountAppHeader() {
  return mount(AppHeader, {
    global: {
      stubs: {
        WorkspaceSwitcher: {
          template: '<div data-test="workspace-switcher-stub" />',
        },
        ProjectHealthPopover: {
          template: '<div data-test="project-health-popover-stub" />',
        },
        UTooltip: tooltipStub,
        Tooltip: tooltipStub,
      },
    },
  });
}

describe("AppHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    colorModeMock.current = ref("light");
    appApiMocks.openDevTools.mockResolvedValue({ ok: true });
  });

  it("mounts the Workspace switcher and Project health controls in the center region", () => {
    const wrapper = mountAppHeader();

    expect(wrapper.find('[data-test="workspace-switcher-stub"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="project-health-popover-stub"]').exists()).toBe(true);
  });

  it("keeps tooltip hover behavior scoped to header controls", () => {
    const wrapper = mountAppHeader();

    const tooltips = wrapper.findAll('[data-test="app-header-tooltip"]');
    expect(tooltips.map((tooltip) => tooltip.attributes("data-text"))).toEqual([
      "打开开发者工具",
      "通知",
      "切换主题",
    ]);
    for (const tooltip of tooltips) {
      expect(tooltip.attributes("data-disable-hoverable-content")).toBe("true");
      expect(tooltip.attributes("data-ignore-non-keyboard-focus")).toBe("true");
    }
  });

  it("keeps devtools and theme actions in AppHeader", async () => {
    const wrapper = mountAppHeader();

    await wrapper.get('[data-icon-name="i-lucide-bug"]').trigger("click");
    expect(appApiMocks.openDevTools).toHaveBeenCalledOnce();

    expect(wrapper.find('[data-icon-name="i-lucide-moon"]').exists()).toBe(true);
    await wrapper.get('[data-icon-name="i-lucide-moon"]').trigger("click");
    await wrapper.vm.$nextTick();
    expect(colorModeMock.current?.value).toBe("dark");
    expect(wrapper.find('[data-icon-name="i-lucide-sun"]').exists()).toBe(true);
  });
});
