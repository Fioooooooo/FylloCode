import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChatPage from "@renderer/pages/chat.vue";
import ChatSessionPage from "@renderer/pages/chat/[sessionId].vue";

const stores = vi.hoisted(() => ({
  beginDraftSession: vi.fn(),
  fetchTemplates: vi.fn(),
  selectSession: vi.fn(),
  toastAdd: vi.fn(),
  routerReplace: vi.fn(),
  routeState: { sessionId: "session-1", path: "/chat" },
  sessions: [] as Array<{ id: string; workspaceId: string }>,
  setActiveSessionId: (sessionId: string | null) => {
    void sessionId;
  },
}));

vi.mock("@renderer/stores", async () => {
  const { ref } = await import("vue");
  const activeSessionId = ref<string | null>(null);
  stores.setActiveSessionId = (sessionId) => {
    activeSessionId.value = sessionId;
  };

  return {
    useSessionStore: () => ({
      beginDraftSession: stores.beginDraftSession,
      selectSession: stores.selectSession,
      isLoading: false,
      sessions: stores.sessions,
      get activeSessionId() {
        return activeSessionId.value;
      },
    }),
    useWorkflowStore: () => ({ fetchTemplates: stores.fetchTemplates }),
    useWorkspaceStore: () => ({ currentWorkspace: { id: "workspace-1" } }),
  };
});

vi.mock("vue-router", () => ({
  useRoute: () => ({
    get params() {
      return { sessionId: stores.routeState.sessionId };
    },
    get path() {
      return stores.routeState.path;
    },
  }),
  useRouter: () => ({ replace: stores.routerReplace }),
}));

vi.mock("@nuxt/ui/composables", () => ({
  useToast: () => ({ add: stores.toastAdd }),
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
    stores.selectSession.mockReset();
    stores.selectSession.mockImplementation(async (sessionId: string) => {
      stores.setActiveSessionId(sessionId);
    });
    stores.toastAdd.mockReset();
    stores.routerReplace.mockReset();
    stores.routerReplace.mockResolvedValue(undefined);
    stores.routeState.sessionId = "session-1";
    stores.routeState.path = "/chat";
    stores.sessions.length = 0;
    stores.setActiveSessionId(null);
  });

  it("toggles the dashboard sidebar collapsed state from ChatContainer", async () => {
    const wrapper = mountChatPage();

    expect(wrapper.get('[data-test="dashboard-sidebar"]').attributes("data-collapsed")).toBe(
      "false"
    );
    expect(wrapper.get('[data-test="dashboard-sidebar"]').classes()).toContain("mr-2");
    expect(wrapper.get('[data-test="toggle-sidebar"]').attributes("data-sidebar-collapsed")).toBe(
      "false"
    );

    await wrapper.get('[data-test="toggle-sidebar"]').trigger("click");

    expect(wrapper.get('[data-test="dashboard-sidebar"]').attributes("data-collapsed")).toBe(
      "true"
    );
    expect(wrapper.get('[data-test="dashboard-sidebar"]').classes()).toContain("mr-0");
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
    expect(group.classes()).not.toContain("space-x-2");
    expect(sidebar.classes()).not.toContain("w-65");
  });

  it("renders ChatSidebar as dashboard sidebar content", () => {
    const wrapper = mountChatPage();

    expect(
      wrapper.get('[data-test="dashboard-sidebar"]').find('[data-test="chat-sidebar"]').text()
    ).toBe("sessions");
  });

  it("initializes only the draft state for /chat", () => {
    mountChatPage();

    expect(stores.beginDraftSession).toHaveBeenCalledTimes(1);
    expect(stores.selectSession).not.toHaveBeenCalled();
  });

  it("selects the target session for /chat/:sessionId", async () => {
    stores.sessions.push({ id: "session-1", workspaceId: "workspace-1" });
    mount(ChatSessionPage, {
      global: {
        stubs: {
          ChatPageShell: true,
        },
      },
    });

    await vi.waitFor(() => expect(stores.selectSession).toHaveBeenCalledWith("session-1"));
    expect(stores.beginDraftSession).not.toHaveBeenCalled();
  });

  it("returns an unavailable session route to /chat with a toast", async () => {
    stores.routeState.sessionId = "missing-session";
    stores.routeState.path = "/chat/missing-session";
    mount(ChatSessionPage, {
      global: {
        stubs: {
          ChatPageShell: true,
        },
      },
    });

    await vi.waitFor(() => expect(stores.routerReplace).toHaveBeenCalledWith("/chat"));
    expect(stores.toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: "会话不可用", color: "error" })
    );
  });

  it("replaces the draft route after the first real session becomes active", async () => {
    mountChatPage();

    stores.setActiveSessionId("session-created");

    await vi.waitFor(() =>
      expect(stores.routerReplace).toHaveBeenCalledWith("/chat/session-created")
    );
  });

  it("returns to the draft route after deleting the active session", async () => {
    stores.routeState.sessionId = "session-1";
    stores.routeState.path = "/chat/session-1";
    stores.setActiveSessionId("session-1");
    mountChatPage();

    stores.setActiveSessionId(null);

    await vi.waitFor(() => expect(stores.routerReplace).toHaveBeenCalledWith("/chat"));
  });
});
