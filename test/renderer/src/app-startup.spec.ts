import { beforeEach, describe, expect, it, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";

const bootstrapPhaseState = vi.hoisted(() => ({ critical: "pending" }));
const subscribeProbeUpdates = vi.hoisted(() => vi.fn(() => vi.fn()));

vi.mock("@renderer/bootstrap", () => ({ bootstrapPhaseState }));
vi.mock("@renderer/stores", () => ({
  useSessionStore: () => ({ subscribeProbeUpdates }),
}));

describe("App startup gate", () => {
  beforeEach(() => {
    vi.resetModules();
    bootstrapPhaseState.critical = "pending";
  });

  it("shows only startup loading while critical bootstrap is pending", async () => {
    const App = (await import("@renderer/App.vue")).default;
    const wrapper = shallowMount(App, {
      global: {
        stubs: {
          Suspense: { template: "<div><slot /></div>" },
          UApp: { template: "<div><slot /></div>" },
          App: { template: "<div><slot /></div>" },
        },
      },
    });

    expect(wrapper.findComponent({ name: "StartupLoading" }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: "AppLayout" }).exists()).toBe(false);
  });

  it("reveals application content after critical bootstrap settles", async () => {
    bootstrapPhaseState.critical = "settled";
    const App = (await import("@renderer/App.vue")).default;
    const wrapper = shallowMount(App, {
      global: {
        stubs: {
          Suspense: { template: "<div><slot /></div>" },
          UApp: { template: "<div><slot /></div>" },
          App: { template: "<div><slot /></div>" },
        },
      },
    });

    expect(wrapper.findComponent({ name: "StartupLoading" }).exists()).toBe(false);
    expect(wrapper.html()).toContain("app-layout-stub");
  });
});
