import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChatPage from "@renderer/pages/chat.vue";

const stores = vi.hoisted(() => ({
  beginDraftSession: vi.fn(),
  fetchTemplates: vi.fn(),
}));

vi.mock("@renderer/stores", () => ({
  useSessionStore: () => ({
    beginDraftSession: stores.beginDraftSession,
  }),
  useWorkflowStore: () => ({
    fetchTemplates: stores.fetchTemplates,
  }),
}));

function mountChatPage(): ReturnType<typeof mount> {
  return mount(ChatPage, {
    global: {
      stubs: {
        ChatContainer: {
          props: ["sidebarCollapsed"],
          emits: ["toggle-sidebar"],
          template:
            '<button type="button" data-test="toggle-sidebar" :data-sidebar-collapsed="String(sidebarCollapsed)" @click="$emit(\'toggle-sidebar\')">toggle</button>',
        },
        ChatSidebar: {
          template: '<div data-test="chat-sidebar">sessions</div>',
        },
      },
    },
  });
}

describe("chat page", () => {
  beforeEach(() => {
    stores.beginDraftSession.mockReset();
    stores.fetchTemplates.mockReset();
  });

  it("toggles the dashboard sidebar collapsed state from ChatContainer", async () => {
    const wrapper = mountChatPage();

    expect(wrapper.get('[data-test="dashboard-sidebar"]').attributes("data-collapsed")).toBe(
      "false"
    );
    expect(wrapper.get('[data-test="toggle-sidebar"]').attributes("data-sidebar-collapsed")).toBe(
      "false"
    );

    await wrapper.get('[data-test="toggle-sidebar"]').trigger("click");

    expect(wrapper.get('[data-test="dashboard-sidebar"]').attributes("data-collapsed")).toBe(
      "true"
    );
    expect(wrapper.get('[data-test="toggle-sidebar"]').attributes("data-sidebar-collapsed")).toBe(
      "true"
    );
  });

  it("keeps the dashboard group inside the app layout flow", () => {
    const wrapper = mountChatPage();
    const group = wrapper.get('[data-test="dashboard-group"]');
    const sidebar = wrapper.get('[data-test="dashboard-sidebar"]');

    expect(group.classes()).toContain("relative");
    expect(group.classes()).toContain("inset-auto");
    expect(group.classes()).not.toContain("fixed");
    expect(sidebar.classes()).not.toContain("w-65");
  });

  it("renders ChatSidebar as dashboard sidebar content", () => {
    const wrapper = mountChatPage();

    expect(
      wrapper.get('[data-test="dashboard-sidebar"]').find('[data-test="chat-sidebar"]').text()
    ).toBe("sessions");
  });
});
