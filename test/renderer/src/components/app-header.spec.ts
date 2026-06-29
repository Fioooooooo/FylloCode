import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import AppHeader from "@renderer/components/layout/AppHeader.vue";

vi.mock("@renderer/api/app", () => ({
  appApi: {
    openDevTools: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

vi.mock("@renderer/composables/useDefaultAppRoute", () => ({
  useDefaultAppRoute: () => ({
    goToDefault: vi.fn(),
  }),
}));

vi.mock("@renderer/stores/project", () => ({
  useProjectStore: () => ({
    currentProject: { name: "FylloCode" },
    recentProjects: [],
    openFolder: vi.fn().mockResolvedValue(null),
    openRecentProject: vi.fn(),
  }),
}));

vi.mock("@vueuse/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vueuse/core")>()),
  useColorMode: () => ref("light"),
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
        ProjectHealthPopover: true,
        UTooltip: tooltipStub,
        Tooltip: tooltipStub,
      },
    },
  });
}

describe("AppHeader", () => {
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
});
